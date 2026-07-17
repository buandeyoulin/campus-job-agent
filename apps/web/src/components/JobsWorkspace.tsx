import { useCallback, useEffect, useState } from "react";
import type { JobList, JobListQuery, SourceStatus, StoredJob } from "@campus-job-agent/contracts";
import type { JobsApi } from "../jobs-api";

const EMPTY_QUERY: JobListQuery = { keyword: "", city: "", source: "", status: "", page: 1, pageSize: 20 };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "职位数据暂时无法读取";
}

export interface JobsWorkspaceProps { api: JobsApi }

export function JobsWorkspace({ api }: JobsWorkspaceProps) {
  const [query, setQuery] = useState<JobListQuery>(EMPTY_QUERY);
  const [list, setList] = useState<JobList>({ jobs: [], total: 0, page: 1, pageSize: 20 });
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [selected, setSelected] = useState<StoredJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (nextQuery: JobListQuery) => {
    try {
      setError("");
      const [nextList, nextSources] = await Promise.all([api.list(nextQuery), api.sourceStatuses()]);
      setList(nextList);
      setSources(nextSources);
      setSelected((current) => nextList.jobs.find((job) => job.id === current?.id) ?? nextList.jobs[0] ?? null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [api]);

  useEffect(() => { void load(query); }, [load, query]);

  const updateFilter = (key: "keyword" | "city", value: string) => setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  const scanTencent = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.scanTencent();
      setMessage(`已更新 ${result.fetched} 个公开岗位`);
      await load(query);
    } catch (scanError) {
      setError(errorMessage(scanError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card jobs-workspace" aria-labelledby="jobs-heading">
      <div className="job-heading">
        <div><p className="eyebrow">公开职位</p><h2 id="jobs-heading">发现校招与实习岗位</h2></div>
        <button type="button" onClick={() => void scanTencent()} disabled={busy}>{busy ? "正在更新…" : "更新腾讯公开职位"}</button>
      </div>
      <p className="privacy-note job-note">只读取公开来源；系统不会登录招聘网站或自动投递。</p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="source-statuses" aria-label="职位来源状态">
        {sources.map((source) => <span key={source.source}>{source.source === "tencent" ? "腾讯" : source.source}：{source.message}</span>)}
      </div>
      <div className="job-filters">
        <label>关键词<input aria-label="关键词" value={query.keyword} onChange={(event) => updateFilter("keyword", event.target.value)} placeholder="例如：前端、产品、算法" /></label>
        <label>城市<input aria-label="城市" value={query.city} onChange={(event) => updateFilter("city", event.target.value)} placeholder="例如：上海" /></label>
      </div>
      {list.jobs.length === 0 ? <p className="empty-copy">还没有本地职位记录。可先更新腾讯公开职位。</p> : (
        <div className="jobs-layout">
          <ul className="job-list" aria-label="职位列表">
            {list.jobs.map((job) => <li key={job.id}><button type="button" className={selected?.id === job.id ? "selected-job" : ""} onClick={() => setSelected(job)}><strong>{job.title}</strong><span>{job.company} · {job.location || "地点待确认"}</span></button></li>)}
          </ul>
          {selected ? <article className="job-detail" aria-label="职位详情"><h3>{selected.title}</h3><p>{selected.company} · {selected.location || "地点待确认"}</p><p className="job-description">{selected.description}</p><a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看公开职位原页</a></article> : null}
        </div>
      )}
    </section>
  );
}

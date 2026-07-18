import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CompanyCandidateList,
  CompanyCandidateListQuery,
  CompanyCareerSource,
  CompanyList,
  CompanyListQuery,
} from "@campus-job-agent/contracts";
import type { CompanyDirectoryApi } from "../company-directory-api";

const COMPANY_QUERY: CompanyListQuery = { keyword: "", industry: "", region: "", status: "active", page: 1, pageSize: 20 };
const CANDIDATE_QUERY: CompanyCandidateListQuery = { keyword: "", industry: "", region: "", status: "", page: 1, pageSize: 20 };

const messageOf = (error: unknown) => error instanceof Error && error.message ? error.message : "公司库操作失败";

export interface CompanyDirectoryWorkspaceProps { api: CompanyDirectoryApi }

export function CompanyDirectoryWorkspace({ api }: CompanyDirectoryWorkspaceProps) {
  const [tab, setTab] = useState<"companies" | "candidates">("companies");
  const [companyQuery, setCompanyQuery] = useState(COMPANY_QUERY);
  const [candidateQuery, setCandidateQuery] = useState(CANDIDATE_QUERY);
  const [companies, setCompanies] = useState<CompanyList>({ companies: [], total: 0, page: 1, pageSize: 20 });
  const [candidates, setCandidates] = useState<CompanyCandidateList>({ candidates: [], total: 0, page: 1, pageSize: 20 });
  const [sources, setSources] = useState<Record<string, CompanyCareerSource[]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [sourceCompanyId, setSourceCompanyId] = useState("");
  const [careerUrl, setCareerUrl] = useState("");

  const loadCompanies = useCallback(async (query: CompanyListQuery) => {
    try {
      const next = await api.list(query);
      setCompanies(next);
      setSourceCompanyId((current) => current || next.companies[0]?.id || "");
      const entries = await Promise.all(next.companies.map(async (company) => [company.id, await api.listCareerSources(company.id)] as const));
      setSources(Object.fromEntries(entries));
    } catch (reason) { setError(messageOf(reason)); }
  }, [api]);

  const loadCandidates = useCallback(async (query: CompanyCandidateListQuery) => {
    try { setCandidates(await api.listCandidates(query)); }
    catch (reason) { setError(messageOf(reason)); }
  }, [api]);

  useEffect(() => { void loadCompanies(companyQuery); }, [loadCompanies, companyQuery]);
  useEffect(() => { void loadCandidates(candidateQuery); }, [loadCandidates, candidateQuery]);

  const refresh = async () => Promise.all([loadCompanies(companyQuery), loadCandidates(candidateQuery)]);
  const run = async (operation: () => Promise<string>) => {
    setBusy(true); setMessage(""); setError("");
    try { setMessage(await operation()); await refresh(); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };

  const addCompany = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await api.addCompany({ canonicalName: companyName, homepageUrl });
      setCompanyName(""); setHomepageUrl("");
      return result.candidate.status === "verified" ? "公司已核验并加入公司库" : "公司已进入隔离候选区，等待更多公开证据";
    });
  };
  const addSource = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.addCareerSource(sourceCompanyId, careerUrl);
      setCareerUrl("");
      return "招聘入口已通过官网证据核验并加入";
    });
  };

  return (
    <section className="card company-directory" aria-labelledby="company-directory-heading">
      <div className="job-heading">
        <div><p className="eyebrow">本机公司与岗位来源</p><h2 id="company-directory-heading">自建公司岗位库</h2></div>
        <div className="company-actions">
          <button type="button" disabled={busy} onClick={() => void run(async () => { const value = await api.importSeed(); return `导入完成：新增 ${value.created}，更新 ${value.updated}`; })}>导入内置芯片公司</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => { const value = await api.discover(); return `发现完成：核验通过 ${value.verified}，隔离 ${value.quarantined}`; })}>发现新公司</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => { const value = await api.syncJobs(); return `岗位更新完成：抓取 ${value.jobsFetched}，新增 ${value.created}，跳过 ${value.sourcesSkipped}`; })}>更新官方岗位</button>
        </div>
      </div>
      <p className="privacy-note job-note">只读取公开官网并保存到本机。系统不会登录招聘平台，也不会自动提交申请；投递仍需你在官网手动完成。</p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      <div className="company-tabs" role="tablist" aria-label="公司库视图">
        <button type="button" role="tab" aria-selected={tab === "companies"} onClick={() => setTab("companies")}>已核验公司（{companies.total}）</button>
        <button type="button" role="tab" aria-selected={tab === "candidates"} onClick={() => setTab("candidates")}>待核验与隔离</button>
      </div>

      {tab === "companies" ? <>
        <div className="company-filters">
          <label>公司关键词<input aria-label="公司关键词" value={companyQuery.keyword} onChange={(event) => setCompanyQuery((value) => ({ ...value, keyword: event.target.value, page: 1 }))} /></label>
          <label>行业<input aria-label="行业" value={companyQuery.industry} onChange={(event) => setCompanyQuery((value) => ({ ...value, industry: event.target.value, page: 1 }))} /></label>
          <label>地区<input aria-label="地区" value={companyQuery.region} onChange={(event) => setCompanyQuery((value) => ({ ...value, region: event.target.value, page: 1 }))} /></label>
          <label>状态<select aria-label="公司状态" value={companyQuery.status} onChange={(event) => setCompanyQuery((value) => ({ ...value, status: event.target.value as CompanyListQuery["status"], page: 1 }))}><option value="">全部</option><option value="active">正常</option><option value="paused">暂停</option><option value="invalid">无效</option></select></label>
        </div>
        {companies.companies.length === 0 ? <p className="empty-copy">尚无已核验公司，可导入内置芯片公司或手动提交官网。</p> : <ul className="company-list" aria-label="已核验公司">
          {companies.companies.map((company) => <li key={company.id} className="company-item">
            <div className="company-summary">
              <strong>{company.canonicalName}</strong>
              <small>{company.industries.join(" · ") || "行业待补充"} · {company.regions.join(" · ") || "地区待补充"}</small>
              <span>核验分 {company.verificationScore} · {company.jobCount} 个有效岗位 · {company.careerSourceCount} 个招聘来源</span>
              <span>{company.verificationEvidence[0]?.detail}</span>
              <a href={`https://${company.officialDomain}/`} target="_blank" rel="noreferrer">公司官网</a>
            </div>
            <ul className="career-source-list" aria-label={`${company.canonicalName} 招聘来源`}>
              {(sources[company.id] ?? []).map((item) => <li key={item.id}>
                <a href={item.canonicalUrl} target="_blank" rel="noreferrer">官方招聘入口</a>
                <small>{item.status} · 健康度 {item.healthScore}{item.lastError ? ` · ${item.lastError}` : ""}</small>
              </li>)}
            </ul>
          </li>)}
        </ul>}
      </> : <>
        <div className="company-filters">
          <label>候选关键词<input aria-label="候选关键词" value={candidateQuery.keyword} onChange={(event) => setCandidateQuery((value) => ({ ...value, keyword: event.target.value, page: 1 }))} /></label>
          <label>状态<select aria-label="候选状态" value={candidateQuery.status} onChange={(event) => setCandidateQuery((value) => ({ ...value, status: event.target.value as CompanyCandidateListQuery["status"], page: 1 }))}><option value="">全部</option><option value="pending">待核验</option><option value="quarantined">隔离</option><option value="verified">已通过</option><option value="rejected">已拒绝</option></select></label>
        </div>
        <ul className="candidate-list" aria-label="候选公司">{candidates.candidates.map((item) => <li key={item.id}><strong>{item.canonicalName}</strong><span>{item.status} · 核验分 {item.verificationScore}</span><a href={item.homepageUrl} target="_blank" rel="noreferrer">候选官网</a>{item.failureReason ? <p>{item.failureReason}</p> : null}</li>)}</ul>
      </>}

      <div className="company-manual-forms">
        <form onSubmit={addCompany}>
          <h3>添加公司官网</h3>
          <label>公司名称<input aria-label="公司名称" required value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
          <label>公司官网<input aria-label="公司官网" required type="url" placeholder="https://company.example/" value={homepageUrl} onChange={(event) => setHomepageUrl(event.target.value)} /></label>
          <button type="submit" disabled={busy}>提交公司核验</button>
        </form>
        <form onSubmit={addSource}>
          <h3>添加招聘入口</h3>
          <label>所属公司<select aria-label="所属公司" required value={sourceCompanyId} onChange={(event) => setSourceCompanyId(event.target.value)}>{companies.companies.map((company) => <option key={company.id} value={company.id}>{company.canonicalName}</option>)}</select></label>
          <label>招聘入口网址<input aria-label="招聘入口网址" required type="url" value={careerUrl} onChange={(event) => setCareerUrl(event.target.value)} /></label>
          <button type="submit" disabled={busy || !sourceCompanyId}>核验并添加入口</button>
        </form>
      </div>
    </section>
  );
}

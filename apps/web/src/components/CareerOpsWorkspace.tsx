import { useCallback, useEffect, useState } from "react";
import type { ApplicationDetail, ApplicationPreparation, ApplicationStatus, JobMatchResult } from "@campus-job-agent/contracts";
import type { CareerOpsApi } from "../career-ops-api";

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "已收藏", preparing: "准备材料", applied: "已手动投递", assessment: "笔试/测评", interview: "面试", offer: "Offer",
  rejected: "未通过", withdrawn: "已撤回", expired: "岗位过期",
};
const messageOf = (error: unknown) => error instanceof Error && error.message ? error.message : "求职工作台操作失败";

export interface CareerOpsWorkspaceProps { api: CareerOpsApi }

export function CareerOpsWorkspace({ api }: CareerOpsWorkspaceProps) {
  const [matches, setMatches] = useState<JobMatchResult[]>([]);
  const [applications, setApplications] = useState<ApplicationDetail[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextMatches, nextApplications] = await Promise.all([api.listMatches(false), api.listApplications()]);
      setMatches(nextMatches); setApplications(nextApplications);
    } catch (reason) { setError(messageOf(reason)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const runAi = async () => {
    setBusy(true); setError(""); setMessage("");
    try { setMatches(await api.listMatches(true)); setMessage("AI 已根据确认资料重新排序岗位"); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };
  const track = async (jobId: string) => {
    setBusy(true); setError("");
    try { await api.createApplication(jobId); setApplications(await api.listApplications()); setMessage("已加入求职跟踪；请在官网手动投递后再更新状态"); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };
  const replaceApplication = (id: string, patch: Partial<ApplicationDetail>) => setApplications((items) => items.map((item) => item.application.id === id ? { ...item, ...patch } : item));

  return <section className="card career-ops" aria-labelledby="career-ops-heading">
    <div className="job-heading"><div><p className="eyebrow">AI 求职工作台</p><h2 id="career-ops-heading">岗位匹配、材料与进度</h2></div><button type="button" disabled={busy} onClick={() => void runAi()}>AI 自动筛选岗位</button></div>
    <p className="privacy-note job-note">AI 只使用你已确认的资料。加入跟踪不会投递；状态只记录你已经手动完成的操作。</p>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}

    <section className="match-section" aria-labelledby="match-heading"><h3 id="match-heading">推荐岗位</h3>
      {matches.length === 0 ? <p className="empty-copy">请先完善求职偏好，并让岗位库同步到公开岗位。</p> : <ul className="match-list">{matches.map((match) => <li key={match.job.id}>
        <div><strong>{match.job.title}</strong><span>{match.job.company} · {match.job.location || "地点待确认"}</span><b>{match.score} 分</b></div>
        <p>{match.aiAssessment?.summary ?? (match.evidence.join("；") || "等待 AI 深度分析")}</p>
        {match.aiAssessment ? <div className="match-explanation"><span>优势：{match.aiAssessment.strengths.join("；") || "暂无"}</span><span>缺口：{match.aiAssessment.gaps.join("；") || "暂无"}</span></div> : null}
        <div className="fact-actions"><a href={match.job.sourceUrl} target="_blank" rel="noreferrer">查看官网岗位</a><button type="button" disabled={busy} onClick={() => void track(match.job.id)}>加入求职跟踪</button></div>
      </li>)}</ul>}
    </section>

    <section className="application-section" aria-labelledby="application-heading"><h3 id="application-heading">求职进度</h3>
      {applications.length === 0 ? <p className="empty-copy">尚未跟踪岗位。请从推荐岗位中手动加入。</p> : applications.map((detail) => <ApplicationCard key={detail.application.id} detail={detail} api={api} busy={busy} setBusy={setBusy} setError={setError} onChange={(patch) => replaceApplication(detail.application.id, patch)} />)}
    </section>
  </section>;
}

function ApplicationCard({ detail, api, busy, setBusy, setError, onChange }: {
  detail: ApplicationDetail; api: CareerOpsApi; busy: boolean; setBusy(value: boolean): void; setError(value: string): void; onChange(patch: Partial<ApplicationDetail>): void;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(detail.application.status);
  const [note, setNote] = useState(detail.application.note);
  const save = async () => {
    setBusy(true); setError("");
    try { onChange({ application: await api.updateApplication(detail.application.id, { status, note }) }); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };
  const prepare = async () => {
    setBusy(true); setError("");
    try { onChange({ preparation: await api.prepareApplication(detail.application.id) }); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };
  return <article className="application-card">
    <div className="application-title"><div><strong>{detail.job.title}</strong><span>{detail.job.company}</span></div><a href={detail.job.sourceUrl} target="_blank" rel="noreferrer">前往官网手动投递</a></div>
    <div className="application-controls">
      <label>求职阶段<select aria-label="求职阶段" value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>进度备注<input aria-label="进度备注" value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void save()}>保存进度</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void prepare()}>生成定制简历与面试包</button>
    </div>
    {detail.events.length > 0 ? <details className="application-history"><summary>查看进度历史（{detail.events.length}）</summary><ol>{detail.events.toReversed().map((event) => <li key={event.id}><strong>{STATUS_LABELS[event.status]}</strong>{event.note ? `：${event.note}` : ""}<small>{new Date(event.createdAt).toLocaleString()}</small></li>)}</ol></details> : null}
    {detail.preparation ? <PreparationView value={detail.preparation} /> : null}
  </article>;
}

function PreparationView({ value }: { value: ApplicationPreparation }) {
  const download = `data:text/markdown;charset=utf-8,${encodeURIComponent(value.tailoredResumeMarkdown)}`;
  return <div className="preparation-view"><section><h4>定制简历草稿</h4><div className="fact-actions"><a href={download} download="tailored-resume.md">下载定制简历 Markdown</a><a href={`/api/applications/${value.applicationId}/resume.pdf`}>下载定制简历 PDF</a></div><pre>{value.tailoredResumeMarkdown}</pre></section><section><h4>面试问题与回答提纲</h4><ol>{value.interviewQuestions.map((item) => <li key={item.question}><strong>{item.question}</strong><p>{item.answerOutline}</p><small>事实依据：{item.evidence.join("；") || "需自行准备，不得虚构"}</small></li>)}</ol></section><section><h4>待补能力</h4><ul>{value.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></section></div>;
}

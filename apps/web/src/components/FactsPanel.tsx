import { useMemo, useRef, useState } from "react";
import type { CandidateFactContent, OnboardingSnapshot, ProfileFact } from "@campus-job-agent/contracts";
import type { OnboardingApi } from "../api";
import { FactEditor } from "./FactEditor";

type Filter = "all" | ProfileFact["status"];
const GROUP_LABELS: Record<CandidateFactContent["type"], string> = { education: "教育经历", internship: "实习经历", project: "项目经历", skill: "技能" };
const STATUS_LABELS: Record<ProfileFact["status"], string> = { pending: "待确认", confirmed: "已确认", rejected: "已拒绝" };

function title(content: CandidateFactContent): string {
  if (content.type === "education") return `${content.school} · ${content.major}`;
  if (content.type === "internship") return `${content.company} · ${content.role}`;
  if (content.type === "project") return content.name;
  return content.name;
}

function contentText(content: CandidateFactContent): string {
  if (content.type === "education") return `${content.school} ${content.degree} ${content.major} ${content.details}`.trim();
  if (content.type === "internship") return `${content.company} ${content.role} ${content.bullets.join("；")}`.trim();
  if (content.type === "project") return `${content.name} ${content.role} ${content.technologies.join("、")} ${content.bullets.join("；")}`.trim();
  return `${content.name} ${content.category} ${content.evidence}`.trim();
}

function allFacts(groups: OnboardingSnapshot["facts"]): ProfileFact[] {
  return ["education", "internship", "project", "skill"].flatMap((type) => groups[type as keyof typeof groups]);
}

export interface FactsPanelProps {
  facts: OnboardingSnapshot["facts"];
  counts: OnboardingSnapshot["factCounts"];
  api: OnboardingApi;
  onRefresh: () => Promise<void>;
}

export function FactsPanel({ facts, counts, api, onRefresh }: FactsPanelProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProfileFact | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const ordered = useMemo(() => allFacts(facts), [facts]);
  const visible = filter === "all" ? ordered : ordered.filter((fact) => fact.status === filter);
  const existingById = new Map(ordered.map((fact) => [fact.id, fact]));
  const total = counts.pending + counts.confirmed + counts.rejected;

  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await operation(); await onRefresh(); return true; }
    catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : "事实操作失败"); return false; }
    finally { setBusy(false); }
  };

  const save = async (content: CandidateFactContent) => {
    const current = editing;
    const saved = await mutate(() => current === "new" ? api.createFact(content) : api.updateFact(current!.id, content));
    if (!saved) return;
    setEditing(null);
    if (current && current !== "new") queueMicrotask(() => editButtons.current.get(current.id)?.focus());
  };

  const batch = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true); setError("");
    try { await api.confirmFacts(ids); await onRefresh(); setSelected(new Set()); }
    catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : "批量确认失败"); }
    finally { setBusy(false); }
  };

  return (
    <section className="card facts-panel" aria-labelledby="facts-title">
      <div className="card-heading">
        <div><p className="eyebrow">核心资料</p><h2 id="facts-title">经历与技能事实</h2></div>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing("new")}>手动添加事实</button>
      </div>
      <div className="fact-filters" aria-label="事实筛选">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>全部 {total}</button>
        <button type="button" aria-pressed={filter === "pending"} onClick={() => setFilter("pending")}>待确认 {counts.pending}</button>
        <button type="button" aria-pressed={filter === "confirmed"} onClick={() => setFilter("confirmed")}>已确认 {counts.confirmed}</button>
        <button type="button" aria-pressed={filter === "rejected"} onClick={() => setFilter("rejected")}>已拒绝 {counts.rejected}</button>
      </div>
      {editing && <FactEditor value={editing === "new" ? null : editing.content} onSave={save} onCancel={() => setEditing(null)} />}
      {counts.pending > 0 && (
        <div className="batch-bar">
          <span>已选择 {selected.size} 条待确认事实</span>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => { void batch(); }}>批量确认所选</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {visible.length === 0 && !editing && <p className="empty-copy">当前筛选下没有事实。手动录入不依赖简历或 AI。</p>}
      {(["education", "internship", "project", "skill"] as const).map((type) => {
        const items = visible.filter((fact) => fact.content.type === type);
        if (items.length === 0) return null;
        return <section className="fact-group" key={type} aria-labelledby={`group-${type}`}>
          <h3 id={`group-${type}`}>{GROUP_LABELS[type]}</h3>
          <div className="fact-list">{items.map((item) => {
            const duplicate = item.duplicateOfFactId ? existingById.get(item.duplicateOfFactId) : null;
            return <article className={`fact-item ${selected.has(item.id) ? "selected" : ""}`} key={item.id} aria-label={`事实：${title(item.content)}`}>
              <div className="fact-head">
                {item.status === "pending" && <label><input type="checkbox" aria-label={`选择 ${title(item.content)}`} checked={selected.has(item.id)} onChange={(event) => setSelected((current) => {
                  const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next;
                })} /> 选择</label>}
                <strong>{title(item.content)}</strong><span className={`fact-status ${item.status}`}>{STATUS_LABELS[item.status]}</span>
              </div>
              <p>{contentText(item.content)}</p>
              {duplicate && <div className="duplicate-comparison">
                <div><b>候选事实</b><p>{contentText(item.content)}</p></div>
                <div><b>可能重复的已有事实</b><p>{contentText(duplicate.content)}</p></div>
              </div>}
              <div className="fact-actions">
                <button type="button" className="secondary-button" disabled={busy} ref={(node) => { if (node) editButtons.current.set(item.id, node); }} onClick={() => setEditing(item)}>编辑</button>
                {item.status === "pending" && <>
                  <button type="button" disabled={busy} onClick={() => { void mutate(() => api.actOnFact(item.id, "confirm")); }}>确认</button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => { void mutate(() => api.actOnFact(item.id, "reject")); }}>拒绝</button>
                </>}
                <button type="button" className="danger-button" disabled={busy} onClick={() => { void mutate(() => api.actOnFact(item.id, "delete")); }}>删除</button>
              </div>
            </article>;
          })}</div>
        </section>;
      })}
    </section>
  );
}

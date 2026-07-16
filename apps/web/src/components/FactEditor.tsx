import { useState, type FormEvent } from "react";
import { CandidateFactContentSchema, type CandidateFactContent } from "@campus-job-agent/contracts";

type FactType = CandidateFactContent["type"];

function empty(type: FactType): CandidateFactContent {
  if (type === "education") return { type, school: "", degree: "", major: "", startDate: "", endDate: "", details: "" };
  if (type === "internship") return { type, company: "", role: "", startDate: "", endDate: "", bullets: [] };
  if (type === "project") return { type, name: "", role: "", startDate: "", endDate: "", bullets: [], technologies: [] };
  return { type, name: "", category: "", evidence: "" };
}

const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

export interface FactEditorProps {
  value: CandidateFactContent | null;
  onSave: (content: CandidateFactContent) => Promise<void>;
  onCancel: () => void;
}

export function FactEditor({ value, onSave, onCancel }: FactEditorProps) {
  const [draft, setDraft] = useState<CandidateFactContent>(value ?? empty("education"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (field: string, next: string | string[]) => {
    setDraft((current) => ({ ...current, [field]: next } as CandidateFactContent));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(CandidateFactContentSchema.parse(draft));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "事实保存失败");
      setBusy(false);
    }
  };

  return (
    <section className="fact-editor" role="dialog" aria-modal="false" aria-labelledby="fact-editor-title">
      <h3 id="fact-editor-title">{value ? "编辑事实" : "手动添加事实"}</h3>
      <form onSubmit={submit}>
        <fieldset className="form-grid" disabled={busy}>
          <label>事实类型
            <select value={draft.type} disabled={Boolean(value)} onChange={(event) => setDraft(empty(event.target.value as FactType))}>
              <option value="education">教育经历</option><option value="internship">实习经历</option><option value="project">项目经历</option><option value="skill">技能</option>
            </select>
          </label>
          {draft.type === "education" && <>
            <label>学校<input value={draft.school} onChange={(event) => update("school", event.target.value)} required /></label>
            <label>学历<input value={draft.degree} onChange={(event) => update("degree", event.target.value)} required /></label>
            <label>专业<input value={draft.major} onChange={(event) => update("major", event.target.value)} required /></label>
            <label>开始月份<input type="month" value={draft.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
            <label>结束月份<input type="month" value={draft.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
            <label className="wide-field">补充说明<textarea value={draft.details} onChange={(event) => update("details", event.target.value)} /></label>
          </>}
          {draft.type === "internship" && <>
            <label>公司<input value={draft.company} onChange={(event) => update("company", event.target.value)} required /></label>
            <label>岗位<input value={draft.role} onChange={(event) => update("role", event.target.value)} required /></label>
            <label>开始月份<input type="month" value={draft.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
            <label>结束月份<input type="month" value={draft.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
            <label className="wide-field">成果要点（每行一条）<textarea value={draft.bullets.join("\n")} onChange={(event) => update("bullets", lines(event.target.value))} /></label>
          </>}
          {draft.type === "project" && <>
            <label>项目名称<input value={draft.name} onChange={(event) => update("name", event.target.value)} required /></label>
            <label>担任角色<input value={draft.role} onChange={(event) => update("role", event.target.value)} /></label>
            <label>开始月份<input type="month" value={draft.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
            <label>结束月份<input type="month" value={draft.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
            <label>成果要点（每行一条）<textarea value={draft.bullets.join("\n")} onChange={(event) => update("bullets", lines(event.target.value))} /></label>
            <label>技术栈（每行一项）<textarea value={draft.technologies.join("\n")} onChange={(event) => update("technologies", lines(event.target.value))} /></label>
          </>}
          {draft.type === "skill" && <>
            <label>技能名称<input value={draft.name} onChange={(event) => update("name", event.target.value)} required /></label>
            <label>技能分类<input value={draft.category} onChange={(event) => update("category", event.target.value)} /></label>
            <label className="wide-field">证明或使用场景<textarea value={draft.evidence} onChange={(event) => update("evidence", event.target.value)} /></label>
          </>}
        </fieldset>
        <div className="form-actions">
          <button type="submit" disabled={busy}>保存事实</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>取消</button>
          {error && <span role="alert">{error}</span>}
        </div>
      </form>
    </section>
  );
}

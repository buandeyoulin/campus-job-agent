import { useEffect, useState, type FormEvent } from "react";
import { ProfileDraftSchema, type ProfileDraft } from "@campus-job-agent/contracts";

const EMPTY_PROFILE: ProfileDraft = {
  displayName: "",
  email: "",
  phone: "",
  currentCity: "",
  degree: "",
  major: "",
  graduationDate: "",
};

export interface ProfileCardProps {
  value: ProfileDraft | null;
  onSave: (value: ProfileDraft) => Promise<void>;
  disabled: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "基本信息保存失败";
}

export function ProfileCard({ value, onSave, disabled }: ProfileCardProps) {
  const [draft, setDraft] = useState<ProfileDraft>(value ?? EMPTY_PROFILE);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => setDraft(value ?? EMPTY_PROFILE), [value]);

  const update = (field: keyof ProfileDraft, next: string) => {
    setDraft((current) => ({ ...current, [field]: next }));
    setState("idle");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving");
    setError("");
    try {
      await onSave(ProfileDraftSchema.parse(draft));
      setState("saved");
    } catch (caught) {
      setError(errorMessage(caught));
      setState("error");
    }
  };

  return (
    <section className="card" aria-labelledby="profile-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">第一步</p>
          <h2 id="profile-title">基本信息</h2>
        </div>
        <span className="required-note">姓名必填，其余可稍后补充</span>
      </div>
      <form onSubmit={submit}>
        <fieldset className="form-grid" disabled={disabled || state === "saving"}>
          <label>
            姓名或称呼
            <input value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} required autoComplete="name" />
          </label>
          <label>
            邮箱（选填）
            <input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" />
          </label>
          <label>
            手机号（选填）
            <input value={draft.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" />
          </label>
          <label>
            当前城市
            <input value={draft.currentCity} onChange={(event) => update("currentCity", event.target.value)} />
          </label>
          <label>
            学历
            <input value={draft.degree} onChange={(event) => update("degree", event.target.value)} />
          </label>
          <label>
            专业
            <input value={draft.major} onChange={(event) => update("major", event.target.value)} />
          </label>
          <label>
            毕业月份
            <input type="month" value={draft.graduationDate} onChange={(event) => update("graduationDate", event.target.value)} />
          </label>
        </fieldset>
        <div className="form-actions">
          <button type="submit" disabled={disabled || state === "saving"}>保存基本信息</button>
          {state === "saving" && <span role="status">正在保存…</span>}
          {state === "saved" && <span role="status">已保存</span>}
          {state === "error" && <span role="alert">{error}</span>}
        </div>
      </form>
    </section>
  );
}

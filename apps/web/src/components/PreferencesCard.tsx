import { useEffect, useState, type FormEvent } from "react";
import {
  JobPreferencesSchema,
  type JobPreferences,
  type RecruitmentType,
} from "@campus-job-agent/contracts";

interface PreferencesDraft {
  targetRoles: string;
  excludedRoles: string;
  recruitmentTypes: RecruitmentType[];
  targetCities: string;
  remotePreference: JobPreferences["remotePreference"];
  availabilityFrom: string;
  availabilityTo: string;
  daysPerWeek: string;
  minimumDurationMonths: string;
  preferredIndustries: string;
  preferredCompanies: string;
  companyBlacklist: string;
}

const EMPTY_PREFERENCES: JobPreferences = {
  targetRoles: [],
  excludedRoles: [],
  recruitmentTypes: [],
  targetCities: [],
  remotePreference: "no_preference",
  availabilityFrom: "",
  availabilityTo: "",
  daysPerWeek: null,
  minimumDurationMonths: null,
  preferredIndustries: [],
  preferredCompanies: [],
  companyBlacklist: [],
};

function join(values: string[]): string {
  return values.join("，");
}

function toDraft(value: JobPreferences | null): PreferencesDraft {
  const source = value ?? EMPTY_PREFERENCES;
  return {
    targetRoles: join(source.targetRoles),
    excludedRoles: join(source.excludedRoles),
    recruitmentTypes: source.recruitmentTypes,
    targetCities: join(source.targetCities),
    remotePreference: source.remotePreference,
    availabilityFrom: source.availabilityFrom,
    availabilityTo: source.availabilityTo,
    daysPerWeek: source.daysPerWeek?.toString() ?? "",
    minimumDurationMonths: source.minimumDurationMonths?.toString() ?? "",
    preferredIndustries: join(source.preferredIndustries),
    preferredCompanies: join(source.preferredCompanies),
    companyBlacklist: join(source.companyBlacklist),
  };
}

function list(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))];
}

function nullableNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "求职偏好保存失败";
}

export interface PreferencesCardProps {
  value: JobPreferences | null;
  onSave: (value: JobPreferences) => Promise<void>;
  disabled: boolean;
}

export function PreferencesCard({ value, onSave, disabled }: PreferencesCardProps) {
  const [draft, setDraft] = useState<PreferencesDraft>(() => toDraft(value));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => setDraft(toDraft(value)), [value]);

  const update = <K extends keyof PreferencesDraft>(field: K, next: PreferencesDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: next }));
    setState("idle");
  };

  const toggleRecruitmentType = (type: RecruitmentType, checked: boolean) => {
    update(
      "recruitmentTypes",
      checked
        ? [...new Set([...draft.recruitmentTypes, type])]
        : draft.recruitmentTypes.filter((value) => value !== type),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || state === "saving") return;
    setState("saving");
    setError("");
    try {
      const parsed = JobPreferencesSchema.parse({
        targetRoles: list(draft.targetRoles),
        excludedRoles: list(draft.excludedRoles),
        recruitmentTypes: draft.recruitmentTypes,
        targetCities: list(draft.targetCities),
        remotePreference: draft.remotePreference,
        availabilityFrom: draft.availabilityFrom,
        availabilityTo: draft.availabilityTo,
        daysPerWeek: nullableNumber(draft.daysPerWeek),
        minimumDurationMonths: nullableNumber(draft.minimumDurationMonths),
        preferredIndustries: list(draft.preferredIndustries),
        preferredCompanies: list(draft.preferredCompanies),
        companyBlacklist: list(draft.companyBlacklist),
      });
      await onSave(parsed);
      setState("saved");
    } catch (caught) {
      setError(errorMessage(caught));
      setState("error");
    }
  };

  return (
    <section className="card" aria-labelledby="preferences-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">第二步</p>
          <h2 id="preferences-title">求职偏好</h2>
        </div>
        <span className="required-note">各项偏好可随时调整</span>
      </div>
      {disabled && <p className="inline-hint">请先保存姓名或称呼，再设置求职偏好。</p>}
      <form onSubmit={submit}>
        <fieldset className="form-grid" disabled={disabled || state === "saving"}>
          <label className="wide-field">
            目标岗位
            <textarea value={draft.targetRoles} onChange={(event) => update("targetRoles", event.target.value)} placeholder="例如：前端开发实习生，产品实习生" />
          </label>
          <label className="wide-field">
            排除岗位
            <textarea value={draft.excludedRoles} onChange={(event) => update("excludedRoles", event.target.value)} />
          </label>
          <fieldset className="choice-group wide-field">
            <legend>招聘类型</legend>
            <label><input type="checkbox" checked={draft.recruitmentTypes.includes("campus")} onChange={(event) => toggleRecruitmentType("campus", event.target.checked)} /> 校园招聘</label>
            <label><input type="checkbox" checked={draft.recruitmentTypes.includes("daily_internship")} onChange={(event) => toggleRecruitmentType("daily_internship", event.target.checked)} /> 日常实习</label>
            <label><input type="checkbox" checked={draft.recruitmentTypes.includes("summer_internship")} onChange={(event) => toggleRecruitmentType("summer_internship", event.target.checked)} /> 暑期实习</label>
          </fieldset>
          <label>
            目标城市
            <textarea value={draft.targetCities} onChange={(event) => update("targetCities", event.target.value)} />
          </label>
          <label>
            办公方式
            <select value={draft.remotePreference} onChange={(event) => update("remotePreference", event.target.value as JobPreferences["remotePreference"])}>
              <option value="no_preference">不限</option>
              <option value="onsite">现场办公</option>
              <option value="hybrid">混合办公</option>
              <option value="remote">远程办公</option>
            </select>
          </label>
          <label>可开始日期<input type="date" value={draft.availabilityFrom} onChange={(event) => update("availabilityFrom", event.target.value)} /></label>
          <label>可结束日期<input type="date" value={draft.availabilityTo} onChange={(event) => update("availabilityTo", event.target.value)} /></label>
          <label>每周可工作天数<input type="number" min="1" max="7" value={draft.daysPerWeek} onChange={(event) => update("daysPerWeek", event.target.value)} /></label>
          <label>最短实习月数<input type="number" min="1" max="24" value={draft.minimumDurationMonths} onChange={(event) => update("minimumDurationMonths", event.target.value)} /></label>
          <label>偏好行业<textarea value={draft.preferredIndustries} onChange={(event) => update("preferredIndustries", event.target.value)} /></label>
          <label>偏好公司<textarea value={draft.preferredCompanies} onChange={(event) => update("preferredCompanies", event.target.value)} /></label>
          <label>公司黑名单<textarea value={draft.companyBlacklist} onChange={(event) => update("companyBlacklist", event.target.value)} /></label>
        </fieldset>
        <div className="form-actions">
          <button type="submit" disabled={disabled || state === "saving"}>保存求职偏好</button>
          {state === "saving" && <span role="status">正在保存…</span>}
          {state === "saved" && <span role="status">已保存</span>}
          {state === "error" && <span role="alert">{error}</span>}
        </div>
      </form>
    </section>
  );
}

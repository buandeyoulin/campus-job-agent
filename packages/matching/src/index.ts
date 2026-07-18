import type { AiJobAssessment, JobPreferences, ProfileFact, StoredJob } from "@campus-job-agent/contracts";

export interface JobMatch {
  job: StoredJob;
  eligible: boolean;
  score: number;
  reasons: string[];
  evidence: string[];
  aiAssessment: AiJobAssessment | null;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const matches = (value: string, terms: string[]) => terms.some((term) => normalize(term) && normalize(value).includes(normalize(term)));

export function evaluateJobMatch(job: StoredJob, preferences: JobPreferences, facts: ProfileFact[]): JobMatch {
  const reasons: string[] = [];
  if (job.status === "expired" || job.lifecycleStatus === "closed") reasons.push("岗位已过期或关闭");
  if (matches(job.company, preferences.companyBlacklist)) reasons.push("公司在黑名单中");
  if (matches(job.title, preferences.excludedRoles)) reasons.push("职位命中排除方向");
  if (preferences.targetCities.length > 0 && !matches(job.location, preferences.targetCities)) reasons.push("工作城市不在目标范围");
  if (reasons.length > 0) return { job, eligible: false, score: 0, reasons, evidence: [], aiAssessment: null };

  const evidence: string[] = [];
  let score = 0;
  if (matches(job.title, preferences.targetRoles)) { score += 35; evidence.push("目标岗位方向匹配"); }
  if (preferences.targetCities.length > 0 && matches(job.location, preferences.targetCities)) { score += 15; evidence.push(`城市：${job.location}`); }
  if (matches(job.company, preferences.preferredCompanies)) { score += 10; evidence.push(`偏好公司：${job.company}`); }
  const text = `${job.title}\n${job.description}`;
  const skills = facts.flatMap((fact) => fact.status === "confirmed" && fact.content.type === "skill" ? [fact.content.name] : [])
    .filter((skill) => normalize(skill) && normalize(text).includes(normalize(skill)));
  if (skills.length > 0) { score += 25; evidence.push(...skills.map((skill) => `技能：${skill}`)); }
  return { job, eligible: true, score: Math.min(score, 100), reasons, evidence, aiAssessment: null };
}

export function rankJobMatches(matches: JobMatch[]): JobMatch[] {
  return matches.filter((match) => match.eligible).toSorted((left, right) => right.score - left.score || right.job.lastCapturedAt.localeCompare(left.job.lastCapturedAt));
}

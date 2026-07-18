import { evaluateJobMatch, rankJobMatches, type JobMatch } from "@campus-job-agent/matching";
import { AiJobAssessmentListSchema } from "@campus-job-agent/contracts";
import type { StructuredAiProvider } from "@campus-job-agent/ai-providers";
import type { FactRepository, JobRepository, ProfileRepository } from "@campus-job-agent/storage";

export interface MatchServiceDependencies { profiles: ProfileRepository; facts: FactRepository; jobs: JobRepository; provider?: StructuredAiProvider }

export class MatchService {
  constructor(private readonly dependencies: MatchServiceDependencies) {}

  async list(useAi = false): Promise<JobMatch[]> {
    const preferences = this.dependencies.profiles.getPreferences();
    if (!preferences) return [];
    const jobs = this.dependencies.jobs.list({ keyword: "", city: "", source: "", status: "active", page: 1, pageSize: 100 }).jobs;
    const facts = this.dependencies.facts.list();
    const ranked = rankJobMatches(jobs.map((job) => evaluateJobMatch(job, preferences, facts)));
    if (!useAi || !this.dependencies.provider || ranked.length === 0) return ranked;
    const targets = ranked.slice(0, 20);
    const confirmedFacts = facts.filter((fact) => fact.status === "confirmed").map((fact) => fact.content);
    const assessments = await this.dependencies.provider.generate({
      system: "你是严谨的求职岗位匹配助手。只使用用户已确认事实，不得虚构经历。对每个岗位给出 0-100 匹配分、简短结论、优势和缺口。",
      prompt: JSON.stringify({ preferences, confirmedFacts, jobs: targets.map(({ job }) => ({ id: job.id, title: job.title, company: job.company, location: job.location, description: job.description.slice(0, 6_000) })) }),
      schema: AiJobAssessmentListSchema,
    });
    const byJob = new Map(assessments.map((item) => [item.jobId, item]));
    return targets.map((match) => {
      const aiAssessment = byJob.get(match.job.id) ?? null;
      return aiAssessment ? { ...match, score: Math.round(match.score * 0.4 + aiAssessment.fitScore * 0.6), aiAssessment } : match;
    }).toSorted((left, right) => right.score - left.score || right.job.lastCapturedAt.localeCompare(left.job.lastCapturedAt));
  }
}

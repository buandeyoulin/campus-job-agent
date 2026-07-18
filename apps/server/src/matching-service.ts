import { z } from "zod";
import { evaluateJobMatch, rankJobMatches, type JobMatch } from "@campus-job-agent/matching";
import type { StructuredAiProvider } from "@campus-job-agent/ai-providers";
import type { FactRepository, JobRepository, ProfileRepository } from "@campus-job-agent/storage";
import { ApiFailure } from "./errors.js";
import { summarizeConfirmedFact } from "./confirmed-facts.js";

const AiAssessmentPlanSchema = z.array(z.object({
  jobId: z.uuid(), fitScore: z.number().int().min(0).max(100), strengthFactIds: z.array(z.uuid()).max(20),
  gaps: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict()).max(20);

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
    const confirmed = facts.filter((fact) => fact.status === "confirmed");
    if (confirmed.length === 0) throw new ApiFailure(409, "profile_required", "请先确认至少一条经历事实，再运行 AI 匹配");
    const factMap = new Map(confirmed.map((fact) => [fact.id, summarizeConfirmedFact(fact)]));
    const targets = ranked.slice(0, 20);
    let plans: z.infer<typeof AiAssessmentPlanSchema>;
    try {
      plans = await this.dependencies.provider.generate({
        system: "你是严谨的求职岗位匹配助手。只能引用输入中的 confirmedFacts.id 作为候选人优势；不得把岗位要求当成候选人经历。输出岗位分数、支撑事实 ID 和缺口。",
        prompt: JSON.stringify({ preferences, confirmedFacts: [...factMap].map(([id, summary]) => ({ id, summary })), jobs: targets.map(({ job }) => ({ id: job.id, title: job.title, company: job.company, location: job.location, description: job.description.slice(0, 6_000) })) }),
        schema: AiAssessmentPlanSchema,
      });
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(503, "ai_unavailable", "AI 岗位分析暂时不可用，请稍后重试");
    }
    const allowedJobs = new Set(targets.map((item) => item.job.id));
    for (const plan of plans) {
      if (!allowedJobs.has(plan.jobId) || plan.strengthFactIds.some((id) => !factMap.has(id))) {
        throw new ApiFailure(502, "ai_output_invalid", "AI 岗位分析引用了未经确认的数据");
      }
    }
    const byJob = new Map(plans.map((item) => [item.jobId, item]));
    return targets.map((match) => {
      const plan = byJob.get(match.job.id);
      if (!plan) return match;
      const strengths = [...new Set(plan.strengthFactIds)].map((id) => factMap.get(id)!);
      const aiAssessment = { jobId: match.job.id, fitScore: plan.fitScore, summary: `AI 匹配分 ${plan.fitScore}，由 ${strengths.length} 条已确认事实支撑`, strengths, gaps: plan.gaps };
      return { ...match, score: Math.round(match.score * 0.4 + plan.fitScore * 0.6), aiAssessment };
    }).toSorted((left, right) => right.score - left.score || right.job.lastCapturedAt.localeCompare(left.job.lastCapturedAt));
  }
}

import {
  ApplicationCreateSchema,
  ApplicationDetailSchema,
  ApplicationListSchema,
  ApplicationPreparationContentSchema,
  ApplicationUpdateSchema,
  type Application,
  type ApplicationDetail,
  type ApplicationEvent,
  type ApplicationPreparation,
  type ApplicationUpdate,
} from "@campus-job-agent/contracts";
import type { StructuredAiProvider } from "@campus-job-agent/ai-providers";
import { renderHtmlToPdf } from "@campus-job-agent/materials";
import type { ApplicationRepository, FactRepository, JobRepository, ProfileRepository } from "@campus-job-agent/storage";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ApiFailure } from "./errors.js";
import { summarizeConfirmedFact } from "./confirmed-facts.js";

const PreparationPlanSchema = z.object({
  selectedFactIds: z.array(z.uuid()).min(1).max(50),
  interviewQuestions: z.array(z.object({
    question: z.string().trim().min(1).max(1_000),
    focus: z.string().trim().min(1).max(1_000),
    factIds: z.array(z.uuid()).min(1).max(10),
  }).strict()).min(3).max(20),
  gaps: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict();

export interface ApplicationsServiceDependencies {
  repository: ApplicationRepository;
  jobs: JobRepository;
  profiles: ProfileRepository;
  facts: FactRepository;
  provider: StructuredAiProvider;
  outputRoot?: string;
  renderResumePdf?: (markdown: string) => Promise<Buffer>;
}

export class ApplicationsService {
  constructor(private readonly dependencies: ApplicationsServiceDependencies) {}

  create(input: unknown): Application {
    const jobId = ApplicationCreateSchema.parse(input).jobId;
    if (!this.dependencies.jobs.get(jobId)) throw new ApiFailure(404, "job_not_found", "岗位不存在");
    return this.dependencies.repository.create(jobId);
  }
  update(id: string, input: unknown): Application {
    if (!this.dependencies.repository.get(id)) throw new ApiFailure(404, "application_not_found", "求职记录不存在");
    return this.dependencies.repository.update(id, ApplicationUpdateSchema.parse(input));
  }
  list(): ApplicationDetail[] {
    return ApplicationListSchema.parse(this.dependencies.repository.list().map((application) => {
      const job = this.dependencies.jobs.get(application.jobId);
      if (!job) throw new Error("Tracked job is missing");
      return { application, job, events: this.dependencies.repository.events(application.id), preparation: this.dependencies.repository.getPreparation(application.id) };
    }));
  }
  events(id: string): ApplicationEvent[] {
    if (!this.dependencies.repository.get(id)) throw new ApiFailure(404, "application_not_found", "求职记录不存在");
    return this.dependencies.repository.events(id);
  }
  async prepare(id: string): Promise<ApplicationPreparation> {
    const application = this.dependencies.repository.get(id);
    if (!application) throw new ApiFailure(404, "application_not_found", "求职记录不存在");
    const job = this.dependencies.jobs.get(application.jobId);
    if (!job) throw new ApiFailure(404, "job_not_found", "岗位不存在");
    const profile = this.dependencies.profiles.getProfile();
    const confirmedFacts = this.dependencies.facts.list().filter((fact) => fact.status === "confirmed");
    if (!profile || confirmedFacts.length === 0) throw new ApiFailure(409, "profile_required", "请先完善个人资料并确认至少一条经历事实");
    const factMap = new Map(confirmedFacts.map((fact) => [fact.id, summarizeConfirmedFact(fact)]));
    let plan: z.infer<typeof PreparationPlanSchema>;
    try {
      plan = await this.dependencies.provider.generate({
        system: [
          "你是严谨的中文求职材料规划助手。",
          "只能通过 confirmedFacts.id 选择和引用事实，不能撰写新的候选人经历、技能、数字或成果。",
          "为目标岗位选择相关事实，并为每道面试题返回支撑 factIds；缺失要求列入 gaps。",
        ].join("\n"),
        prompt: JSON.stringify({ profile, confirmedFacts: [...factMap].map(([factId, summary]) => ({ factId, summary })), job: { title: job.title, company: job.company, location: job.location, description: job.description } }),
        schema: PreparationPlanSchema,
      });
    } catch {
      throw new ApiFailure(503, "ai_unavailable", "AI 材料生成暂时不可用，请稍后重试");
    }
    const referencedIds = [...plan.selectedFactIds, ...plan.interviewQuestions.flatMap((item) => item.factIds)];
    if (referencedIds.some((factId) => !factMap.has(factId))) throw new ApiFailure(502, "ai_output_invalid", "AI 材料引用了未经确认的数据");
    const selected = [...new Set(plan.selectedFactIds)].map((factId) => factMap.get(factId)!);
    const contact = [profile.email, profile.phone, profile.currentCity].filter(Boolean).join(" · ");
    const tailoredResumeMarkdown = [`# ${profile.displayName}`, contact, "", `目标岗位：${job.company} · ${job.title}`, "", "## 已确认的相关经历", ...selected.map((summary) => `- ${summary}`)].join("\n");
    const content = ApplicationPreparationContentSchema.parse({
      tailoredResumeMarkdown,
      interviewQuestions: plan.interviewQuestions.map((item) => {
        const evidence = [...new Set(item.factIds)].map((factId) => factMap.get(factId)!);
        return { question: item.question, answerOutline: `回答重点：${item.focus}\n仅基于以下已确认事实组织回答：${evidence.join("；")}`, evidence };
      }),
      gaps: plan.gaps,
    });
    const saved = this.dependencies.repository.savePreparation(id, content);
    if (this.dependencies.outputRoot) await rm(path.join(this.dependencies.outputRoot, `${id}-tailored-resume.pdf`), { force: true });
    return saved;
  }
  async resumePdf(id: string): Promise<Buffer> {
    if (!this.dependencies.repository.get(id)) throw new ApiFailure(404, "application_not_found", "求职记录不存在");
    const preparation = this.dependencies.repository.getPreparation(id);
    if (!preparation) throw new ApiFailure(409, "application_state_conflict", "请先生成定制简历");
    if (this.dependencies.renderResumePdf) {
      try { return await this.dependencies.renderResumePdf(preparation.tailoredResumeMarkdown); }
      catch { throw new ApiFailure(503, "pdf_generation_failed", "PDF 生成失败，请稍后重试或下载 Markdown"); }
    }
    if (!this.dependencies.outputRoot) throw new Error("Generated material directory is unavailable");
    const outputPath = path.join(this.dependencies.outputRoot, `${id}-tailored-resume.pdf`);
    try { return await readFile(outputPath); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw new ApiFailure(503, "pdf_generation_failed", "PDF 读取失败，请稍后重试或下载 Markdown"); }
    const escaped = preparation.tailoredResumeMarkdown.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!);
    try {
      await renderHtmlToPdf({
        html: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#172033}pre{white-space:pre-wrap;font:11pt/1.65 inherit}</style><body><pre>${escaped}</pre></body></html>`,
        outputPath,
      });
      return await readFile(outputPath);
    } catch { throw new ApiFailure(503, "pdf_generation_failed", "PDF 生成失败，请稍后重试或下载 Markdown"); }
  }
}

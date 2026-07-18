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
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiFailure } from "./errors.js";

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
    const confirmedFacts = this.dependencies.facts.list().filter((fact) => fact.status === "confirmed").map((fact) => fact.content);
    if (!profile || confirmedFacts.length === 0) throw new ApiFailure(409, "profile_required", "请先完善个人资料并确认至少一条经历事实");
    const content = await this.dependencies.provider.generate({
      system: [
        "你是严谨的中文求职材料助手。",
        "只允许使用用户已确认的资料和事实，绝不虚构技能、数字、职责或结果。",
        "定制简历应重新组织和突出相关事实，不得改变事实含义；缺失要求必须列入 gaps。",
        "面试题需要提供可执行的回答提纲，并在 evidence 中列出支撑事实。",
      ].join("\n"),
      prompt: JSON.stringify({ profile, confirmedFacts, job: { title: job.title, company: job.company, location: job.location, description: job.description } }),
      schema: ApplicationPreparationContentSchema,
    });
    return this.dependencies.repository.savePreparation(id, content);
  }
  async resumePdf(id: string): Promise<Buffer> {
    if (!this.dependencies.repository.get(id)) throw new ApiFailure(404, "application_not_found", "求职记录不存在");
    const preparation = this.dependencies.repository.getPreparation(id);
    if (!preparation) throw new ApiFailure(409, "application_state_conflict", "请先生成定制简历");
    if (this.dependencies.renderResumePdf) return this.dependencies.renderResumePdf(preparation.tailoredResumeMarkdown);
    if (!this.dependencies.outputRoot) throw new Error("Generated material directory is unavailable");
    const outputPath = path.join(this.dependencies.outputRoot, `${id}-tailored-resume.pdf`);
    const escaped = preparation.tailoredResumeMarkdown.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!);
    await renderHtmlToPdf({
      html: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#172033}pre{white-space:pre-wrap;font:11pt/1.65 inherit}</style><body><pre>${escaped}</pre></body></html>`,
      outputPath,
    });
    return readFile(outputPath);
  }
}

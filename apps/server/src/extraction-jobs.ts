import type { StructuredAiProvider } from "@campus-job-agent/ai-providers";
import {
  duplicateSuggestion,
  extractResumeFacts,
  factFingerprint,
  parseResume,
} from "@campus-job-agent/profile";
import type { FactRepository, NewFactRecord, ResumeRepository } from "@campus-job-agent/storage";
import type { ResumeFileStore } from "./resume-files.js";

export interface ExtractionJobDependencies {
  resumes: ResumeRepository;
  facts: FactRepository;
  files: ResumeFileStore;
  provider: StructuredAiProvider;
  parse: typeof parseResume;
}

export class ExtractionJobRunner {
  constructor(private readonly dependencies: ExtractionJobDependencies) {}

  recoverInterrupted(): number {
    return this.dependencies.resumes.markInterrupted();
  }

  async run(resumeId: string): Promise<void> {
    let record = this.dependencies.resumes.getRecord(resumeId);
    if (!record) return;

    let phase: "parse" | "extract" = "parse";
    let emptyText = false;
    try {
      let text: string | null = null;
      if (record.summary.parseStatus === "parsed" && record.parsedRelativePath) {
        try {
          text = await this.dependencies.files.readParsed(record.parsedRelativePath);
        } catch {
          text = null;
        }
      }

      if (text === null) {
        this.dependencies.resumes.updateState(resumeId, {
          parseStatus: "parsing",
          failureCode: null,
        });
        const original = await this.dependencies.files.readOriginal(record.storedRelativePath);
        const parsed = await this.dependencies.parse({
          fileName: record.summary.originalFileName,
          data: original,
        });
        text = parsed.text.trim();
        if (!text) {
          emptyText = true;
          throw new Error("empty parsed text");
        }
        const parsedRelativePath = await this.dependencies.files.writeParsedText(resumeId, text);
        this.dependencies.resumes.updateState(resumeId, {
          parsedRelativePath,
          parseStatus: "parsed",
          warnings: parsed.warnings.length > 0 ? ["文档包含可能影响解析的格式"] : [],
          failureCode: null,
        });
        record = this.dependencies.resumes.getRecord(resumeId)!;
      }

      phase = "extract";
      this.dependencies.resumes.updateState(resumeId, {
        extractionStatus: "extracting",
        failureCode: null,
      });
      const extraction = await extractResumeFacts({ provider: this.dependencies.provider, text });
      const existing = this.dependencies.facts.list().filter((fact) => fact.status !== "rejected");
      const knownFingerprints = new Set(existing.map((fact) => factFingerprint(fact.content)));
      const newFacts: NewFactRecord[] = [];

      for (const candidate of extraction.facts) {
        const fingerprint = factFingerprint(candidate.content);
        if (knownFingerprints.has(fingerprint)) continue;
        const suggestion = duplicateSuggestion(candidate.content, existing.map((fact) => fact.content));
        newFacts.push({
          status: "pending",
          source: "resume",
          resumeUploadId: resumeId,
          sourceExcerpt: candidate.sourceExcerpt,
          content: candidate.content,
          fingerprint,
          duplicateOfFactId: suggestion?.kind === "similar" ? existing[suggestion.factIndex]!.id : null,
        });
        knownFingerprints.add(fingerprint);
      }

      this.dependencies.facts.createMany(newFacts);
      this.dependencies.resumes.updateState(resumeId, {
        extractionStatus: newFacts.length > 0 ? "awaiting_confirmation" : "completed",
        failureCode: null,
      });
    } catch (error) {
      if (phase === "parse") {
        this.dependencies.resumes.updateState(resumeId, {
          parseStatus: "failed",
          extractionStatus: "failed",
          failureCode: emptyText ? "resume_text_empty" : "resume_parse_failed",
        });
        return;
      }
      const invalidOutput = error instanceof Error && error.message === "Resume extraction output was invalid";
      this.dependencies.resumes.updateState(resumeId, {
        extractionStatus: "failed",
        failureCode: invalidOutput ? "extraction_output_invalid" : "extraction_failed",
      });
    }
  }
}

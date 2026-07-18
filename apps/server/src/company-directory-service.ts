import {
  CompanyListQuerySchema,
  CandidateVerificationRunResultSchema,
  CompanySeedImportResultSchema,
  type CandidateVerificationRunResult,
  type CompanyList,
  type CompanySeedImportResult,
} from "@campus-job-agent/contracts";
import { loadSemiconductorCompanySeed, verifyCompanyCandidate, type SeedCompanyRecord, type VerificationDecision } from "@campus-job-agent/sources";
import type { CompanyRepository } from "@campus-job-agent/storage";
import type { CompanyCandidate } from "@campus-job-agent/contracts";

export interface CompanyDirectoryServiceDependencies {
  repository: CompanyRepository;
  loadSeed?: () => SeedCompanyRecord[];
  verifyCandidate?: (candidate: CompanyCandidate) => Promise<VerificationDecision>;
  now?: () => Date;
}

export class CompanyDirectoryService {
  constructor(private readonly dependencies: CompanyDirectoryServiceDependencies) {}

  list(query: unknown): CompanyList {
    return this.dependencies.repository.listCompanies(CompanyListQuerySchema.parse(query));
  }

  importSeed(): CompanySeedImportResult {
    const records = (this.dependencies.loadSeed ?? loadSemiconductorCompanySeed)();
    let created = 0;
    for (const record of records) {
      this.dependencies.repository.transaction(() => {
        const { careerSources, ...companyInput } = record;
        const result = this.dependencies.repository.upsertSeed(companyInput);
        if (result.created) created += 1;
        for (const source of careerSources) {
          this.dependencies.repository.upsertCareerSource(result.company.id, {
            canonicalUrl: source.url,
            kind: source.kind,
            adapter: source.adapter,
            verificationEvidence: source.evidence,
          });
        }
      });
    }
    return CompanySeedImportResultSchema.parse({
      fetched: records.length,
      created,
      updated: records.length - created,
      completedAt: (this.dependencies.now ?? (() => new Date()))().toISOString(),
    });
  }

  async verifyPendingCandidates(limit = 20): Promise<CandidateVerificationRunResult> {
    const now = this.dependencies.now ?? (() => new Date());
    const candidates = this.dependencies.repository.listEligibleCandidates(limit, now().toISOString());
    const counts = { verified: 0, quarantined: 0, rejected: 0 };
    for (const candidate of candidates) {
      const decision = await (this.dependencies.verifyCandidate ?? verifyCompanyCandidate)(candidate);
      if (decision.status === "verified") {
        this.dependencies.repository.transaction(() => {
          const company = this.dependencies.repository.promoteCandidate(candidate.id, {
            aliases: [],
            industries: [],
            regions: [],
            verificationScore: decision.score,
            verificationEvidence: decision.evidence,
          });
          for (const source of decision.careerSources) {
            this.dependencies.repository.upsertCareerSource(company.id, {
              canonicalUrl: source.url,
              kind: source.kind,
              adapter: source.adapter,
              verificationEvidence: source.evidence,
            });
          }
        });
        counts.verified += 1;
        continue;
      }
      const retryHours = Math.min(24 * 14, 2 ** Math.min(candidate.retryCount, 8) * 6);
      const nextRetryAt = decision.status === "quarantined"
        ? new Date(now().getTime() + retryHours * 3_600_000).toISOString()
        : null;
      this.dependencies.repository.recordCandidateDecision(candidate.id, {
        status: decision.status,
        verificationScore: decision.score,
        evidence: decision.evidence,
        failureReason: decision.failureReason ?? "insufficient verified evidence",
        nextRetryAt,
      });
      counts[decision.status] += 1;
    }
    return CandidateVerificationRunResultSchema.parse({
      processed: candidates.length,
      ...counts,
      completedAt: now().toISOString(),
    });
  }
}

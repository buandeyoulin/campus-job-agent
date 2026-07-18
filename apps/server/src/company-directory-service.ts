import {
  CompanyListQuerySchema,
  CandidateVerificationRunResultSchema,
  CompanyDiscoveryRequestSchema,
  CompanyDiscoveryRunResultSchema,
  CompanySeedImportResultSchema,
  type CandidateVerificationRunResult,
  type CompanyDiscoveryRunResult,
  type CompanyList,
  type CompanySeedImportResult,
} from "@campus-job-agent/contracts";
import {
  CompanyDiscoveryError,
  DEFAULT_COMPANY_DISCOVERY_QUERIES,
  loadSemiconductorCompanySeed,
  verifyCompanyCandidate,
  type CompanyDiscoveryProvider,
  type SeedCompanyRecord,
  type VerificationDecision,
} from "@campus-job-agent/sources";
import { normalizeDomain, type CompanyRepository } from "@campus-job-agent/storage";
import type { CompanyCandidate } from "@campus-job-agent/contracts";
import { ApiFailure } from "./errors.js";

export interface CompanyDirectoryServiceDependencies {
  repository: CompanyRepository;
  loadSeed?: () => SeedCompanyRecord[];
  verifyCandidate?: (candidate: CompanyCandidate) => Promise<VerificationDecision>;
  discoveryProvider?: CompanyDiscoveryProvider;
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
    const counts = await this.verifyCandidates(candidates);
    return CandidateVerificationRunResultSchema.parse({
      processed: candidates.length,
      ...counts,
      completedAt: now().toISOString(),
    });
  }

  async discover(value: unknown): Promise<CompanyDiscoveryRunResult> {
    if (!this.dependencies.discoveryProvider) {
      throw new ApiFailure(409, "discovery_not_configured", "Company discovery is not configured");
    }
    const input = CompanyDiscoveryRequestSchema.parse(value ?? {});
    const queries = input.queries.length > 0 ? input.queries : [...DEFAULT_COMPANY_DISCOVERY_QUERIES];
    let results;
    try {
      results = await this.dependencies.discoveryProvider.discover(queries);
    } catch (error) {
      if (error instanceof CompanyDiscoveryError && error.code === "rate_limited") {
        throw new ApiFailure(429, "discovery_rate_limited", "Company discovery is rate limited", error.retryAt ?? undefined);
      }
      throw new ApiFailure(502, "discovery_unavailable", "Company discovery is unavailable");
    }

    const byDomain = new Map<string, (typeof results)[number]>();
    for (const result of results) {
      try {
        const url = new URL(result.url);
        if (url.protocol !== "https:" || url.username || url.password) continue;
        const domain = normalizeDomain(url.hostname);
        if (!byDomain.has(domain)) byDomain.set(domain, result);
      } catch {
        // Malformed discovery results are ignored before persistence.
      }
    }

    let candidatesCreated = 0;
    const candidates: CompanyCandidate[] = [];
    for (const [domain, result] of byDomain) {
      const canonicalName = result.title
        .replace(/\s*[-|｜].*$/, "")
        .replace(/(?:官方)?(?:校园|社会)?招聘|careers?|jobs?|join us/gi, "")
        .trim() || domain.split(".")[0]!;
      const upserted = this.dependencies.repository.upsertCandidate({
        canonicalName,
        candidateDomain: domain,
        homepageUrl: `https://${domain}/`,
        origin: "discovery",
        evidence: [{ kind: "career_semantics", url: result.url, detail: `Search discovery for: ${result.query}` }],
      });
      if (upserted.created) candidatesCreated += 1;
      if (upserted.candidate.status === "pending" || upserted.candidate.status === "quarantined") candidates.push(upserted.candidate);
    }
    const counts = await this.verifyCandidates(candidates);
    const now = this.dependencies.now ?? (() => new Date());
    return CompanyDiscoveryRunResultSchema.parse({
      searched: queries.length,
      candidatesCreated,
      candidatesUpdated: byDomain.size - candidatesCreated,
      ...counts,
      completedAt: now().toISOString(),
    });
  }

  private async verifyCandidates(candidates: readonly CompanyCandidate[]): Promise<{ verified: number; quarantined: number; rejected: number }> {
    const now = this.dependencies.now ?? (() => new Date());
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
    return counts;
  }
}

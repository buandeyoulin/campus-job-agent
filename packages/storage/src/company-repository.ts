import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CompanyCandidateInputSchema,
  CandidateVerificationUpdateSchema,
  CompanyCandidateListQuerySchema,
  CompanyCandidateListSchema,
  CompanyCandidateSchema,
  CompanyCareerSourceInputSchema,
  CompanyCareerSourceSchema,
  CompanyListQuerySchema,
  CompanyListSchema,
  CompanySchema,
  PromoteCandidateDecisionSchema,
  SeedCompanyInputSchema,
  SourceSyncOutcomeSchema,
  type Company,
  type CompanyCandidate,
  type CompanyCandidateInput,
  type CandidateVerificationUpdate,
  type CompanyCandidateList,
  type CompanyCandidateListQuery,
  type CompanyCareerSource,
  type CompanyCareerSourceInput,
  type CompanyList,
  type CompanyListQuery,
  type PromoteCandidateDecision,
  type SeedCompanyInput,
  type SourceSyncOutcome,
} from "@campus-job-agent/contracts";
import { withTransaction } from "./database.js";

type JsonValue = unknown[];
interface CompanyRow {
  id: string; canonical_name: string; aliases_json: string; official_domain: string;
  industries_json: string; regions_json: string; origin: string; status: string;
  verification_score: number; verification_evidence_json: string; verified_at: string;
  created_at: string; updated_at: string;
}
interface CandidateRow {
  id: string; normalized_name: string; canonical_name: string; candidate_domain: string;
  homepage_url: string; origin: string; status: string; verification_score: number;
  evidence_json: string; failure_reason: string | null; retry_count: number;
  next_retry_at: string | null; created_at: string; updated_at: string;
}
interface SourceRow {
  id: string; company_id: string; canonical_url: string; kind: string; adapter: string;
  verification_evidence_json: string;
  status: string; health_score: number; last_success_at: string | null;
  last_failure_at: string | null; last_complete_sync_at: string | null;
  next_sync_at: string | null; backoff_until: string | null; consecutive_failures: number;
  last_error: string | null; created_at: string; updated_at: string;
}

export function normalizeDomain(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function parseJson(value: string): JsonValue {
  return JSON.parse(value) as JsonValue;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toCompany(row: CompanyRow): Company {
  return CompanySchema.parse({
    id: row.id,
    canonicalName: row.canonical_name,
    aliases: parseJson(row.aliases_json),
    officialDomain: row.official_domain,
    industries: parseJson(row.industries_json),
    regions: parseJson(row.regions_json),
    origin: row.origin,
    status: row.status,
    verificationScore: row.verification_score,
    verificationEvidence: parseJson(row.verification_evidence_json),
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toCandidate(row: CandidateRow): CompanyCandidate {
  return CompanyCandidateSchema.parse({
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    candidateDomain: row.candidate_domain,
    homepageUrl: row.homepage_url,
    origin: row.origin,
    status: row.status,
    verificationScore: row.verification_score,
    evidence: parseJson(row.evidence_json),
    failureReason: row.failure_reason,
    retryCount: row.retry_count,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toSource(row: SourceRow): CompanyCareerSource {
  return CompanyCareerSourceSchema.parse({
    id: row.id,
    companyId: row.company_id,
    canonicalUrl: row.canonical_url,
    kind: row.kind,
    adapter: row.adapter,
    verificationEvidence: parseJson(row.verification_evidence_json),
    status: row.status,
    healthScore: row.health_score,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastCompleteSyncAt: row.last_complete_sync_at,
    nextSyncAt: row.next_sync_at,
    backoffUntil: row.backoff_until,
    consecutiveFailures: row.consecutive_failures,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class CompanyRepository {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date = () => new Date()) {}

  transaction<T>(operation: () => T): T {
    return withTransaction(this.db, operation);
  }

  upsertSeed(value: SeedCompanyInput): { company: Company; created: boolean } {
    const input = SeedCompanyInputSchema.parse(value);
    const domain = normalizeDomain(input.officialDomain);
    const now = this.now().toISOString();
    return withTransaction(this.db, () => {
      const existing = this.db.prepare("select * from companies where official_domain = ?").get(domain) as CompanyRow | undefined;
      if (existing) {
        const aliases = unique([...(parseJson(existing.aliases_json) as string[]), ...input.aliases]);
        this.db.prepare(`update companies set canonical_name = ?, normalized_name = ?, aliases_json = ?, industries_json = ?, regions_json = ?,
          origin = 'seed', status = 'active', verification_score = ?, verification_evidence_json = ?, verified_at = ?, updated_at = ? where id = ?`)
          .run(input.canonicalName, normalizeCompanyName(input.canonicalName), JSON.stringify(aliases), JSON.stringify(input.industries),
            JSON.stringify(input.regions), input.verificationScore, JSON.stringify(input.verificationEvidence), now, now, existing.id);
        return { company: this.getCompany(existing.id)!, created: false };
      }
      const id = randomUUID();
      this.db.prepare(`insert into companies (id, normalized_name, canonical_name, aliases_json, official_domain, industries_json,
        regions_json, origin, status, verification_score, verification_evidence_json, verified_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, 'seed', 'active', ?, ?, ?, ?, ?)`)
        .run(id, normalizeCompanyName(input.canonicalName), input.canonicalName, JSON.stringify(unique(input.aliases)), domain,
          JSON.stringify(input.industries), JSON.stringify(input.regions), input.verificationScore,
          JSON.stringify(input.verificationEvidence), now, now, now);
      return { company: this.getCompany(id)!, created: true };
    });
  }

  upsertCandidate(value: CompanyCandidateInput): { candidate: CompanyCandidate; created: boolean } {
    const input = CompanyCandidateInputSchema.parse(value);
    const now = this.now().toISOString();
    return withTransaction(this.db, () => {
      const existing = this.db.prepare("select * from company_candidates where candidate_domain = ?").get(input.candidateDomain) as CandidateRow | undefined;
      if (existing) {
        this.db.prepare(`update company_candidates set canonical_name = ?, normalized_name = ?, homepage_url = ?, origin = ?,
          verification_score = ?, evidence_json = ?, updated_at = ? where id = ?`)
          .run(input.canonicalName, normalizeCompanyName(input.canonicalName), normalizeUrl(input.homepageUrl), input.origin,
            input.verificationScore, JSON.stringify(input.evidence), now, existing.id);
        return { candidate: this.getCandidate(existing.id)!, created: false };
      }
      const id = randomUUID();
      this.db.prepare(`insert into company_candidates (id, normalized_name, canonical_name, candidate_domain, homepage_url, origin,
        status, verification_score, evidence_json, failure_reason, retry_count, next_retry_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, 'pending', ?, ?, null, 0, null, ?, ?)`)
        .run(id, normalizeCompanyName(input.canonicalName), input.canonicalName, input.candidateDomain, normalizeUrl(input.homepageUrl),
          input.origin, input.verificationScore, JSON.stringify(input.evidence), now, now);
      return { candidate: this.getCandidate(id)!, created: true };
    });
  }

  quarantineCandidate(id: string, reason: string): CompanyCandidate {
    const now = this.now().toISOString();
    const result = this.db.prepare(`update company_candidates set status = 'quarantined', failure_reason = ?, retry_count = retry_count + 1,
      updated_at = ? where id = ? and status != 'verified'`).run(reason.trim().slice(0, 1000), now, id);
    if (result.changes === 0) throw new Error("Candidate not found or already verified");
    return this.getCandidate(id)!;
  }

  promoteCandidate(id: string, value: PromoteCandidateDecision): Company {
    const decision = PromoteCandidateDecisionSchema.parse(value);
    const now = this.now().toISOString();
    return withTransaction(this.db, () => {
      const candidate = this.db.prepare("select * from company_candidates where id = ?").get(id) as CandidateRow | undefined;
      if (!candidate || candidate.status === "rejected") throw new Error("Candidate cannot be promoted");
      const existing = this.db.prepare("select * from companies where official_domain = ?").get(candidate.candidate_domain) as CompanyRow | undefined;
      const companyId = existing?.id ?? randomUUID();
      if (existing) {
        this.db.prepare(`update companies set canonical_name = ?, normalized_name = ?, aliases_json = ?, industries_json = ?, regions_json = ?,
          origin = ?, status = 'active', verification_score = ?, verification_evidence_json = ?, verified_at = ?, updated_at = ? where id = ?`)
          .run(candidate.canonical_name, candidate.normalized_name, JSON.stringify(unique(decision.aliases)), JSON.stringify(decision.industries),
            JSON.stringify(decision.regions), candidate.origin, decision.verificationScore, JSON.stringify(decision.verificationEvidence), now, now, companyId);
      } else {
        this.db.prepare(`insert into companies (id, normalized_name, canonical_name, aliases_json, official_domain, industries_json,
          regions_json, origin, status, verification_score, verification_evidence_json, verified_at, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`)
          .run(companyId, candidate.normalized_name, candidate.canonical_name, JSON.stringify(unique(decision.aliases)), candidate.candidate_domain,
            JSON.stringify(decision.industries), JSON.stringify(decision.regions), candidate.origin, decision.verificationScore,
            JSON.stringify(decision.verificationEvidence), now, now, now);
      }
      this.db.prepare(`update company_candidates set status = 'verified', verification_score = ?, evidence_json = ?,
        failure_reason = null, next_retry_at = null, updated_at = ? where id = ?`)
        .run(decision.verificationScore, JSON.stringify(decision.verificationEvidence), now, id);
      return this.getCompany(companyId)!;
    });
  }

  upsertCareerSource(companyId: string, value: CompanyCareerSourceInput): { source: CompanyCareerSource; created: boolean } {
    const input = CompanyCareerSourceInputSchema.parse(value);
    const company = this.db.prepare("select id from companies where id = ? and status != 'invalid'").get(companyId);
    if (!company) throw new Error("Verified company not found");
    const canonicalUrl = normalizeUrl(input.canonicalUrl);
    const now = this.now().toISOString();
    return withTransaction(this.db, () => {
      const existing = this.db.prepare("select * from company_career_sources where company_id = ? and canonical_url = ?")
        .get(companyId, canonicalUrl) as SourceRow | undefined;
      if (existing) {
        this.db.prepare("update company_career_sources set kind = ?, adapter = ?, verification_evidence_json = ?, updated_at = ? where id = ?")
          .run(input.kind, input.adapter, JSON.stringify(input.verificationEvidence), now, existing.id);
        return { source: this.getCareerSource(existing.id)!, created: false };
      }
      const id = randomUUID();
      this.db.prepare(`insert into company_career_sources (id, company_id, canonical_url, kind, adapter, verification_evidence_json, status, health_score,
        last_success_at, last_failure_at, last_complete_sync_at, next_sync_at, backoff_until, consecutive_failures, last_error, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, 'pending', 100, null, null, null, null, null, 0, null, ?, ?)`)
        .run(id, companyId, canonicalUrl, input.kind, input.adapter, JSON.stringify(input.verificationEvidence), now, now);
      return { source: this.getCareerSource(id)!, created: true };
    });
  }

  recordSourceSync(id: string, value: SourceSyncOutcome): CompanyCareerSource {
    const outcome = SourceSyncOutcomeSchema.parse(value);
    const current = this.getCareerSource(id);
    if (!current) throw new Error("Career source not found");
    const nowDate = this.now();
    const now = nowDate.toISOString();
    if (outcome.succeeded) {
      this.db.prepare(`update company_career_sources set status = 'active', health_score = 100, last_success_at = ?,
        last_complete_sync_at = ?, next_sync_at = null, backoff_until = null, consecutive_failures = 0, last_error = null, updated_at = ? where id = ?`)
        .run(now, outcome.complete ? now : current.lastCompleteSyncAt, now, id);
    } else {
      const failures = current.consecutiveFailures + 1;
      const backoffHours = Math.min(24 * 7, 6 * 2 ** Math.min(failures - 1, 6));
      const backoff = new Date(nowDate.getTime() + backoffHours * 3_600_000).toISOString();
      this.db.prepare(`update company_career_sources set status = ?, health_score = ?, last_failure_at = ?, backoff_until = ?,
        consecutive_failures = ?, last_error = ?, updated_at = ? where id = ?`)
        .run("backoff", Math.max(0, current.healthScore - 20), now, backoff, failures,
          outcome.error ?? "Unknown synchronization failure", now, id);
    }
    return this.getCareerSource(id)!;
  }

  getCompany(id: string): Company | null {
    const row = this.db.prepare("select * from companies where id = ?").get(id) as CompanyRow | undefined;
    return row ? toCompany(row) : null;
  }

  getCandidate(id: string): CompanyCandidate | null {
    const row = this.db.prepare("select * from company_candidates where id = ?").get(id) as CandidateRow | undefined;
    return row ? toCandidate(row) : null;
  }

  getCareerSource(id: string): CompanyCareerSource | null {
    const row = this.db.prepare("select * from company_career_sources where id = ?").get(id) as SourceRow | undefined;
    return row ? toSource(row) : null;
  }

  listCompanies(value: CompanyListQuery): CompanyList {
    const query = CompanyListQuerySchema.parse(value);
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) { clauses.push("(canonical_name like ? or aliases_json like ?)"); params.push(`%${query.keyword}%`, `%${query.keyword}%`); }
    if (query.industry) { clauses.push("industries_json like ?"); params.push(`%${query.industry}%`); }
    if (query.region) { clauses.push("regions_json like ?"); params.push(`%${query.region}%`); }
    if (query.status) { clauses.push("status = ?"); params.push(query.status); }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const total = (this.db.prepare(`select count(*) as total from companies ${where}`).get(...params) as { total: number }).total;
    const rows = this.db.prepare(`select * from companies ${where} order by canonical_name, id limit ? offset ?`)
      .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as unknown as CompanyRow[];
    return CompanyListSchema.parse({ companies: rows.map(toCompany), total, page: query.page, pageSize: query.pageSize });
  }

  listCandidates(value: CompanyCandidateListQuery): CompanyCandidateList {
    const query = CompanyCandidateListQuerySchema.parse(value);
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) { clauses.push("(canonical_name like ? or candidate_domain like ?)"); params.push(`%${query.keyword}%`, `%${query.keyword}%`); }
    if (query.status) { clauses.push("status = ?"); params.push(query.status); }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const total = (this.db.prepare(`select count(*) as total from company_candidates ${where}`).get(...params) as { total: number }).total;
    const rows = this.db.prepare(`select * from company_candidates ${where} order by updated_at desc, id limit ? offset ?`)
      .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as unknown as CandidateRow[];
    return CompanyCandidateListSchema.parse({ candidates: rows.map(toCandidate), total, page: query.page, pageSize: query.pageSize });
  }

  listEligibleCandidates(limit: number, at = this.now().toISOString()): CompanyCandidate[] {
    const size = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = this.db.prepare(`select * from company_candidates
      where status = 'pending' or (status = 'quarantined' and (next_retry_at is null or next_retry_at <= ?))
      order by created_at, id limit ?`).all(at, size) as unknown as CandidateRow[];
    return rows.map(toCandidate);
  }

  recordCandidateDecision(id: string, value: CandidateVerificationUpdate): CompanyCandidate {
    const decision = CandidateVerificationUpdateSchema.parse(value);
    const now = this.now().toISOString();
    const result = this.db.prepare(`update company_candidates set status = ?, verification_score = ?, evidence_json = ?,
      failure_reason = ?, retry_count = retry_count + 1, next_retry_at = ?, updated_at = ? where id = ? and status != 'verified'`)
      .run(decision.status, decision.verificationScore, JSON.stringify(decision.evidence), decision.failureReason,
        decision.nextRetryAt, now, id);
    if (result.changes === 0) throw new Error("Candidate not found or already verified");
    return this.getCandidate(id)!;
  }

  listCareerSources(companyId: string): CompanyCareerSource[] {
    const rows = this.db.prepare("select * from company_career_sources where company_id = ? order by canonical_url, id")
      .all(companyId) as unknown as SourceRow[];
    return rows.map(toSource);
  }

  listEligibleCareerSources(options: { companyId?: string; at?: string; dueOnly?: boolean } = {}): Array<{ company: Company; source: CompanyCareerSource }> {
    const at = options.at ?? this.now().toISOString();
    const clauses = ["company.status = 'active'", "(source.status in ('pending', 'active') or (source.status = 'backoff' and source.backoff_until <= ?))", "(source.backoff_until is null or source.backoff_until <= ?)"];
    const params: Array<string | number> = [at, at];
    if (options.companyId) { clauses.push("company.id = ?"); params.push(options.companyId); }
    if (options.dueOnly) { clauses.push("(source.next_sync_at is null or source.next_sync_at <= ?)"); params.push(at); }
    const rows = this.db.prepare(`select source.id as source_id, company.id as company_id from company_career_sources source
      join companies company on company.id = source.company_id where ${clauses.join(" and ")} order by source.next_sync_at, source.id`)
      .all(...params) as Array<{ source_id: string; company_id: string }>;
    return rows.map((row) => ({ company: this.getCompany(row.company_id)!, source: this.getCareerSource(row.source_id)! }));
  }

  scheduleCareerSource(id: string, nextSyncAt: string): CompanyCareerSource {
    const result = this.db.prepare("update company_career_sources set next_sync_at = ?, updated_at = ? where id = ?")
      .run(nextSyncAt, this.now().toISOString(), id);
    if (result.changes === 0) throw new Error("Career source not found");
    return this.getCareerSource(id)!;
  }
}

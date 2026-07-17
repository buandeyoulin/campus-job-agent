import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  JobListQuerySchema,
  JobListSchema,
  SourceStatusSchema,
  StoredJobSchema,
  type JobList,
  type JobListQuery,
  type NormalizedJob,
  type SourceStatus,
  type StoredJob,
} from "@campus-job-agent/contracts";
import { fingerprintJob, normalizeJob } from "@campus-job-agent/jobs";
import { withTransaction } from "./database.js";

interface JobRow {
  id: string;
  fingerprint: string;
  source: string;
  source_job_id: string;
  source_url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  posted_at: string | null;
  status: "unknown" | "active" | "expired";
  first_captured_at: string;
  last_captured_at: string;
}

interface SourceRow {
  source: string;
  source_job_id: string;
  source_url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  posted_at: string | null;
  captured_at: string;
}

function jobInput(row: JobRow) {
  return {
    source: row.source,
    sourceJobId: row.source_job_id,
    sourceUrl: row.source_url,
    title: row.title,
    company: row.company,
    location: row.location,
    description: row.description,
    ...(row.posted_at ? { postedAt: row.posted_at } : {}),
    capturedAt: row.last_captured_at,
  };
}

function sourceInput(row: SourceRow) {
  return {
    source: row.source,
    sourceJobId: row.source_job_id,
    sourceUrl: row.source_url,
    title: row.title,
    company: row.company,
    location: row.location,
    description: row.description,
    ...(row.posted_at ? { postedAt: row.posted_at } : {}),
    capturedAt: row.captured_at,
  };
}

export interface UpsertedJob {
  job: StoredJob;
  created: boolean;
}

export class JobRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(id: string): StoredJob | null {
    const row = this.db.prepare("select * from jobs where id = ?").get(id) as JobRow | undefined;
    if (!row) return null;
    const sources = this.db.prepare("select * from job_sources where job_id = ? order by source, source_job_id").all(id) as unknown as SourceRow[];
    return StoredJobSchema.parse({
      id: row.id,
      fingerprint: row.fingerprint,
      status: row.status,
      firstCapturedAt: row.first_captured_at,
      lastCapturedAt: row.last_captured_at,
      sources: sources.map(sourceInput),
      ...jobInput(row),
    });
  }

  upsert(value: NormalizedJob): UpsertedJob {
    const job = normalizeJob(value);
    const fingerprint = fingerprintJob(job);
    return withTransaction(this.db, () => {
      const existing = this.db.prepare("select * from jobs where fingerprint = ?").get(fingerprint) as JobRow | undefined;
      const id = existing?.id ?? randomUUID();
      const firstCapturedAt = existing?.first_captured_at ?? job.capturedAt;
      const status = existing?.status === "expired" ? "expired" : "active";
      if (existing) {
        this.db.prepare(`
          update jobs set source = ?, source_job_id = ?, source_url = ?, title = ?, company = ?, location = ?,
          description = ?, posted_at = ?, status = ?, last_captured_at = ? where id = ?
        `).run(job.source, job.sourceJobId, job.sourceUrl, job.title, job.company, job.location, job.description, job.postedAt ?? null, status, job.capturedAt, id);
      } else {
        this.db.prepare(`
          insert into jobs (id, fingerprint, source, source_job_id, source_url, title, company, location, description, posted_at, status, first_captured_at, last_captured_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, fingerprint, job.source, job.sourceJobId, job.sourceUrl, job.title, job.company, job.location, job.description, job.postedAt ?? null, status, firstCapturedAt, job.capturedAt);
      }
      this.db.prepare(`
        insert into job_sources (job_id, source, source_job_id, source_url, title, company, location, description, posted_at, captured_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(job_id, source, source_job_id) do update set
          source_url = excluded.source_url, title = excluded.title, company = excluded.company, location = excluded.location,
          description = excluded.description, posted_at = excluded.posted_at, captured_at = excluded.captured_at
      `).run(id, job.source, job.sourceJobId, job.sourceUrl, job.title, job.company, job.location, job.description, job.postedAt ?? null, job.capturedAt);
      return { job: this.get(id)!, created: !existing };
    });
  }

  list(value: JobListQuery): JobList {
    const query = JobListQuerySchema.parse(value);
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push("(title like ? or company like ? or description like ?)");
      const keyword = `%${query.keyword}%`;
      params.push(keyword, keyword, keyword);
    }
    if (query.city) { where.push("location like ?"); params.push(`%${query.city}%`); }
    if (query.status) { where.push("status = ?"); params.push(query.status); }
    if (query.source) {
      where.push("exists (select 1 from job_sources where job_sources.job_id = jobs.id and job_sources.source = ?)");
      params.push(query.source);
    }
    const condition = where.length ? `where ${where.join(" and ")}` : "";
    const count = this.db.prepare(`select count(*) as total from jobs ${condition}`).get(...params) as { total: number };
    const rows = this.db.prepare(`select * from jobs ${condition} order by last_captured_at desc, id limit ? offset ?`)
      .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as unknown as JobRow[];
    return JobListSchema.parse({ jobs: rows.map((row) => this.get(row.id)!), total: count.total, page: query.page, pageSize: query.pageSize });
  }

  recordScan(value: { source: string; succeeded: boolean; message: string }): void {
    this.db.prepare(`
      insert into source_scans (source, last_checked_at, succeeded, message) values (?, ?, ?, ?)
      on conflict(source) do update set last_checked_at = excluded.last_checked_at, succeeded = excluded.succeeded, message = excluded.message
    `).run(value.source, this.now().toISOString(), value.succeeded ? 1 : 0, value.message.slice(0, 300));
  }

  getSourceStatuses(): SourceStatus[] {
    const rows = this.db.prepare("select * from source_scans order by source").all() as Array<{ source: string; last_checked_at: string; succeeded: number; message: string }>;
    return rows.map((row) => SourceStatusSchema.parse({
      source: row.source,
      available: row.succeeded === 1,
      message: row.message,
      lastCheckedAt: row.last_checked_at,
    }));
  }
}

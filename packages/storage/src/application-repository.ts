import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ApplicationEventSchema, ApplicationSchema, ApplicationUpdateSchema, type Application, type ApplicationEvent, type ApplicationUpdate } from "@campus-job-agent/contracts";
import { withTransaction } from "./database.js";

interface ApplicationRow { id: string; job_id: string; status: string; note: string; created_at: string; updated_at: string }
const mapApplication = (row: ApplicationRow): Application => ApplicationSchema.parse({ id: row.id, jobId: row.job_id, status: row.status, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at });

export class ApplicationRepository {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date = () => new Date()) {}
  get(id: string): Application | null { const row = this.db.prepare("select * from applications where id = ?").get(id) as ApplicationRow | undefined; return row ? mapApplication(row) : null; }
  create(jobId: string): Application {
    return withTransaction(this.db, () => {
      const existing = this.db.prepare("select * from applications where job_id = ?").get(jobId) as ApplicationRow | undefined;
      if (existing) return mapApplication(existing);
      if (!this.db.prepare("select id from jobs where id = ?").get(jobId)) throw new Error("Job not found");
      const id = randomUUID(); const timestamp = this.now().toISOString();
      this.db.prepare("insert into applications (id, job_id, status, note, created_at, updated_at) values (?, ?, 'saved', '', ?, ?)").run(id, jobId, timestamp, timestamp);
      this.db.prepare("insert into application_events (id, application_id, status, note, created_at) values (?, ?, 'saved', '', ?)").run(randomUUID(), id, timestamp);
      return this.get(id)!;
    });
  }
  update(id: string, value: ApplicationUpdate): Application {
    const input = ApplicationUpdateSchema.parse(value); const current = this.get(id); if (!current) throw new Error("Application not found"); const timestamp = this.now().toISOString();
    this.db.prepare("update applications set status = ?, note = ?, updated_at = ? where id = ?").run(input.status, input.note, timestamp, id);
    this.db.prepare("insert into application_events (id, application_id, status, note, created_at) values (?, ?, ?, ?, ?)").run(randomUUID(), id, input.status, input.note, timestamp);
    return this.get(id)!;
  }
  events(applicationId: string): ApplicationEvent[] { return (this.db.prepare("select * from application_events where application_id = ? order by created_at, id").all(applicationId) as Array<{ id: string; application_id: string; status: string; note: string; created_at: string }>).map((row) => ApplicationEventSchema.parse({ id: row.id, applicationId: row.application_id, status: row.status, note: row.note, createdAt: row.created_at })); }
}

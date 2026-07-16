import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CandidateFactContentSchema,
  ProfileFactSchema,
  type CandidateFactContent,
  type ProfileFact,
} from "@campus-job-agent/contracts";
import { withTransaction } from "./database.js";

export interface NewFactRecord {
  status: "pending" | "confirmed" | "rejected";
  source: "manual" | "resume";
  resumeUploadId: string | null;
  sourceExcerpt: string | null;
  content: CandidateFactContent;
  fingerprint: string;
  duplicateOfFactId: string | null;
}

interface FactRow {
  id: string;
  status: "pending" | "confirmed" | "rejected";
  source: "manual" | "resume";
  resume_upload_id: string | null;
  source_excerpt: string | null;
  content_json: string;
  duplicate_of_fact_id: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

function mapFact(row: FactRow): ProfileFact {
  return ProfileFactSchema.parse({
    id: row.id,
    status: row.status,
    source: row.source,
    resumeUploadId: row.resume_upload_id,
    sourceExcerpt: row.source_excerpt,
    content: CandidateFactContentSchema.parse(JSON.parse(row.content_json)),
    duplicateOfFactId: row.duplicate_of_fact_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
  });
}

export class FactRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(id: string): ProfileFact | null {
    const row = this.db.prepare("select * from profile_facts where id = ? and profile_id = 'default'").get(id) as FactRow | undefined;
    return row ? mapFact(row) : null;
  }

  list(): ProfileFact[] {
    const rows = this.db.prepare("select * from profile_facts where profile_id = 'default' order by created_at, id").all() as unknown as FactRow[];
    return rows.map(mapFact);
  }

  findByFingerprint(fingerprint: string): ProfileFact | null {
    const row = this.db.prepare(`
      select * from profile_facts
      where profile_id = 'default' and fingerprint = ? and status != 'rejected'
      order by created_at, id
      limit 1
    `).get(fingerprint) as FactRow | undefined;
    return row ? mapFact(row) : null;
  }

  create(value: NewFactRecord): ProfileFact {
    return this.createMany([value])[0]!;
  }

  createMany(values: NewFactRecord[]): ProfileFact[] {
    return withTransaction(this.db, () => values.map((value) => {
      const content = CandidateFactContentSchema.parse(value.content);
      const id = randomUUID();
      const timestamp = this.now().toISOString();

      this.db.prepare(`
        insert into profile_facts (
          id, profile_id, type, status, source, resume_upload_id, source_excerpt,
          content_json, fingerprint, duplicate_of_fact_id, created_at, updated_at, confirmed_at
        ) values (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        content.type,
        value.status,
        value.source,
        value.resumeUploadId,
        value.sourceExcerpt,
        JSON.stringify(content),
        value.fingerprint,
        value.duplicateOfFactId,
        timestamp,
        timestamp,
        value.status === "confirmed" ? timestamp : null,
      );

      return this.get(id)!;
    }));
  }

  update(
    id: string,
    contentValue: CandidateFactContent,
    fingerprint: string,
    duplicateOfFactId: string | null,
  ): ProfileFact {
    const existing = this.get(id);
    if (!existing) throw new Error("Fact not found");

    const content = CandidateFactContentSchema.parse(contentValue);
    const status = existing.status === "rejected" ? "pending" : existing.status;
    this.db.prepare(`
      update profile_facts
      set type = ?, content_json = ?, fingerprint = ?, duplicate_of_fact_id = ?,
          status = ?, confirmed_at = ?, updated_at = ?
      where id = ? and profile_id = 'default'
    `).run(
      content.type,
      JSON.stringify(content),
      fingerprint,
      duplicateOfFactId,
      status,
      status === "confirmed" ? existing.confirmedAt : null,
      this.now().toISOString(),
      id,
    );
    return this.get(id)!;
  }

  confirm(id: string): ProfileFact {
    return this.changePendingStatus(id, "confirmed");
  }

  reject(id: string): ProfileFact {
    return this.changePendingStatus(id, "rejected");
  }

  private changePendingStatus(id: string, status: "confirmed" | "rejected"): ProfileFact {
    const existing = this.get(id);
    if (!existing) throw new Error("Fact not found");
    if (existing.status !== "pending") throw new Error("Fact state conflict");

    const timestamp = this.now().toISOString();
    this.db.prepare(`
      update profile_facts
      set status = ?, confirmed_at = ?, updated_at = ?
      where id = ? and profile_id = 'default'
    `).run(status, status === "confirmed" ? timestamp : null, timestamp, id);
    return this.get(id)!;
  }

  confirmBatch(ids: string[]): ProfileFact[] {
    return withTransaction(this.db, () => {
      const facts = ids.map((id) => this.get(id));
      if (facts.some((fact) => fact === null)) throw new Error("Fact not found");
      if (facts.some((fact) => fact?.status !== "pending")) throw new Error("Fact state conflict");

      const timestamp = this.now().toISOString();
      const update = this.db.prepare(`
        update profile_facts
        set status = 'confirmed', confirmed_at = ?, updated_at = ?
        where id = ? and profile_id = 'default'
      `);
      ids.forEach((id) => update.run(timestamp, timestamp, id));
      return ids.map((id) => this.get(id)!);
    });
  }

  delete(id: string): boolean {
    return this.db.prepare("delete from profile_facts where id = ? and profile_id = 'default'").run(id).changes === 1;
  }
}

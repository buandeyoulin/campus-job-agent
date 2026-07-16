import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  ResumeUploadSummarySchema,
  type ResumeUploadSummary,
} from "@campus-job-agent/contracts";
import { withTransaction } from "./database.js";

export interface NewResumeRecord {
  originalFileName: string;
  storedRelativePath: string;
  kind: "pdf" | "docx";
  byteSize: number;
  sha256: string;
}

export interface ResumeRecord {
  summary: ResumeUploadSummary;
  storedRelativePath: string;
  parsedRelativePath: string | null;
}

export interface ResumeStatePatch {
  parsedRelativePath?: string | null;
  parseStatus?: ResumeUploadSummary["parseStatus"];
  extractionStatus?: ResumeUploadSummary["extractionStatus"];
  failureCode?: ResumeUploadSummary["failureCode"];
  warnings?: string[];
}

interface ResumeRow {
  id: string;
  original_file_name: string;
  stored_relative_path: string;
  parsed_relative_path: string | null;
  kind: "pdf" | "docx";
  byte_size: number;
  sha256: string;
  is_active: number;
  parse_status: ResumeUploadSummary["parseStatus"];
  extraction_status: ResumeUploadSummary["extractionStatus"];
  failure_code: ResumeUploadSummary["failureCode"];
  warnings_json: string;
  created_at: string;
  updated_at: string;
}

function mapResume(row: ResumeRow): ResumeUploadSummary {
  return ResumeUploadSummarySchema.parse({
    id: row.id,
    originalFileName: row.original_file_name,
    kind: row.kind,
    byteSize: row.byte_size,
    sha256: row.sha256,
    isActive: row.is_active === 1,
    parseStatus: row.parse_status,
    extractionStatus: row.extraction_status,
    failureCode: row.failure_code,
    warnings: JSON.parse(row.warnings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class ResumeRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(id: string): ResumeUploadSummary | null {
    const row = this.getRow(id);
    return row ? mapResume(row) : null;
  }

  getRecord(id: string): ResumeRecord | null {
    const row = this.getRow(id);
    return row ? {
      summary: mapResume(row),
      storedRelativePath: row.stored_relative_path,
      parsedRelativePath: row.parsed_relative_path,
    } : null;
  }

  getActive(): ResumeUploadSummary | null {
    const row = this.db.prepare("select * from resume_uploads where profile_id = 'default' and is_active = 1").get() as ResumeRow | undefined;
    return row ? mapResume(row) : null;
  }

  findByHash(sha256: string): ResumeUploadSummary | null {
    const row = this.db.prepare("select * from resume_uploads where profile_id = 'default' and sha256 = ?").get(sha256) as ResumeRow | undefined;
    return row ? mapResume(row) : null;
  }

  activate(id: string): ResumeUploadSummary {
    return withTransaction(this.db, () => {
      if (!this.get(id)) throw new Error("Resume not found");
      this.db.prepare("update resume_uploads set is_active = 0 where profile_id = 'default'").run();
      this.db.prepare(`
        update resume_uploads set is_active = 1, updated_at = ?
        where id = ? and profile_id = 'default'
      `).run(this.now().toISOString(), id);
      return this.get(id)!;
    });
  }

  create(value: NewResumeRecord): ResumeUploadSummary {
    return withTransaction(this.db, () => {
      this.db.prepare("update resume_uploads set is_active = 0 where profile_id = 'default' and is_active = 1").run();
      const id = randomUUID();
      const timestamp = this.now().toISOString();
      this.db.prepare(`
        insert into resume_uploads (
          id, profile_id, original_file_name, stored_relative_path, parsed_relative_path,
          kind, byte_size, sha256, is_active, parse_status, extraction_status,
          failure_code, warnings_json, created_at, updated_at
        ) values (?, 'default', ?, ?, null, ?, ?, ?, 1, 'pending', 'not_started', null, '[]', ?, ?)
      `).run(
        id,
        value.originalFileName,
        value.storedRelativePath,
        value.kind,
        value.byteSize,
        value.sha256,
        timestamp,
        timestamp,
      );
      return this.get(id)!;
    });
  }

  updateState(id: string, patch: ResumeStatePatch): ResumeUploadSummary {
    if (!this.get(id)) throw new Error("Resume not found");

    const assignments = ["updated_at = ?"];
    const values: SQLInputValue[] = [this.now().toISOString()];
    const add = (column: string, value: SQLInputValue): void => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (patch.parsedRelativePath !== undefined) add("parsed_relative_path", patch.parsedRelativePath);
    if (patch.parseStatus !== undefined) add("parse_status", patch.parseStatus);
    if (patch.extractionStatus !== undefined) add("extraction_status", patch.extractionStatus);
    if (patch.failureCode !== undefined) add("failure_code", patch.failureCode);
    if (patch.warnings !== undefined) add("warnings_json", JSON.stringify(patch.warnings));

    this.db.prepare(`
      update resume_uploads set ${assignments.join(", ")}
      where id = ? and profile_id = 'default'
    `).run(...values, id);
    return this.get(id)!;
  }

  markInterrupted(): number {
    const timestamp = this.now().toISOString();
    return Number(this.db.prepare(`
      update resume_uploads
      set parse_status = case when parse_status = 'parsing' then 'failed' else parse_status end,
          extraction_status = case when extraction_status in ('queued', 'extracting') then 'failed' else extraction_status end,
          failure_code = 'interrupted',
          updated_at = ?
      where parse_status = 'parsing' or extraction_status in ('queued', 'extracting')
    `).run(timestamp).changes);
  }

  deleteWithUnconfirmedFacts(id: string): boolean {
    return withTransaction(this.db, () => {
      if (!this.get(id)) return false;
      this.db.prepare("delete from profile_facts where resume_upload_id = ? and status != 'confirmed'").run(id);
      this.db.prepare("update profile_facts set resume_upload_id = null where resume_upload_id = ? and status = 'confirmed'").run(id);
      this.db.prepare("delete from resume_uploads where id = ? and profile_id = 'default'").run(id);
      return true;
    });
  }

  private getRow(id: string): ResumeRow | null {
    const row = this.db.prepare("select * from resume_uploads where id = ? and profile_id = 'default'").get(id) as ResumeRow | undefined;
    return row ?? null;
  }
}

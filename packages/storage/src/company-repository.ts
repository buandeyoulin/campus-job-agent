import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CompanyDirectoryEntryInputSchema,
  CompanyDirectoryListQuerySchema,
  CompanyDirectoryListSchema,
  StoredCompanyDirectoryEntrySchema,
  type CompanyDirectoryEntryInput,
  type CompanyDirectoryList,
  type CompanyDirectoryListQuery,
  type StoredCompanyDirectoryEntry,
} from "@campus-job-agent/contracts";
import { withTransaction } from "./database.js";

interface CompanySiteRow {
  id: string;
  company_name: string;
  career_url: string;
  directory_source: string;
  directory_url: string;
  status: "pending" | "active" | "unavailable";
  first_discovered_at: string;
  last_discovered_at: string;
}

function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function toEntry(row: CompanySiteRow): StoredCompanyDirectoryEntry {
  return StoredCompanyDirectoryEntrySchema.parse({
    id: row.id,
    companyName: row.company_name,
    careerUrl: row.career_url,
    directorySource: row.directory_source,
    directoryUrl: row.directory_url,
    status: row.status,
    firstDiscoveredAt: row.first_discovered_at,
    lastDiscoveredAt: row.last_discovered_at,
  });
}

export interface UpsertedCompanyDirectoryEntry {
  entry: StoredCompanyDirectoryEntry;
  created: boolean;
}

export class CompanyRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  upsert(input: CompanyDirectoryEntryInput): UpsertedCompanyDirectoryEntry {
    const entry = CompanyDirectoryEntryInputSchema.parse(input);
    const companyName = entry.companyName.trim().replace(/\s+/g, " ");
    const careerUrl = normalizeUrl(entry.careerUrl);
    const directoryUrl = normalizeUrl(entry.directoryUrl);
    const companyKey = normalizeCompanyName(companyName);
    const now = this.now().toISOString();
    return withTransaction(this.db, () => {
      const existing = this.db.prepare(`
        select site.id, company.display_name as company_name, site.career_url, site.directory_source,
          site.directory_url, site.status, site.first_discovered_at, site.last_discovered_at
        from company_career_sites site join companies company on company.id = site.company_id
        where site.directory_source = ? and site.career_url = ?
      `).get(entry.directorySource, careerUrl) as CompanySiteRow | undefined;
      if (existing) {
        this.db.prepare(`
          update company_career_sites set directory_url = ?, last_discovered_at = ? where id = ?
        `).run(directoryUrl, now, existing.id);
        return { entry: this.get(existing.id)!, created: false };
      }

      const company = this.db.prepare("select id from companies where normalized_name = ?").get(companyKey) as { id: string } | undefined;
      const companyId = company?.id ?? randomUUID();
      if (!company) {
        this.db.prepare("insert into companies (id, normalized_name, display_name, created_at, updated_at) values (?, ?, ?, ?, ?)")
          .run(companyId, companyKey, companyName, now, now);
      } else {
        this.db.prepare("update companies set display_name = ?, updated_at = ? where id = ?").run(companyName, now, companyId);
      }
      const id = randomUUID();
      this.db.prepare(`
        insert into company_career_sites (id, company_id, career_url, directory_source, directory_url, status, first_discovered_at, last_discovered_at)
        values (?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(id, companyId, careerUrl, entry.directorySource, directoryUrl, now, now);
      return { entry: this.get(id)!, created: true };
    });
  }

  get(id: string): StoredCompanyDirectoryEntry | null {
    const row = this.db.prepare(`
      select site.id, company.display_name as company_name, site.career_url, site.directory_source,
        site.directory_url, site.status, site.first_discovered_at, site.last_discovered_at
      from company_career_sites site join companies company on company.id = site.company_id where site.id = ?
    `).get(id) as CompanySiteRow | undefined;
    return row ? toEntry(row) : null;
  }

  list(value: CompanyDirectoryListQuery): CompanyDirectoryList {
    const query = CompanyDirectoryListQuerySchema.parse(value);
    const params: Array<string | number> = [];
    let where = "";
    if (query.keyword) {
      where = "where company.display_name like ?";
      params.push(`%${query.keyword}%`);
    }
    const count = this.db.prepare(`select count(*) as total from company_career_sites site join companies company on company.id = site.company_id ${where}`)
      .get(...params) as { total: number };
    const rows = this.db.prepare(`
      select site.id, company.display_name as company_name, site.career_url, site.directory_source,
        site.directory_url, site.status, site.first_discovered_at, site.last_discovered_at
      from company_career_sites site join companies company on company.id = site.company_id ${where}
      order by site.last_discovered_at desc, site.id limit ? offset ?
    `).all(...params, query.pageSize, (query.page - 1) * query.pageSize) as unknown as CompanySiteRow[];
    return CompanyDirectoryListSchema.parse({ entries: rows.map(toEntry), total: count.total, page: query.page, pageSize: query.pageSize });
  }
}

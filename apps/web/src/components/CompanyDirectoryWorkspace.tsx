import { useCallback, useEffect, useState } from "react";
import type { CompanyList, CompanyListQuery } from "@campus-job-agent/contracts";
import type { CompanyDirectoryApi } from "../company-directory-api";

const EMPTY_QUERY: CompanyListQuery = { keyword: "", industry: "", region: "", status: "active", page: 1, pageSize: 20 };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Company directory is unavailable";
}

export interface CompanyDirectoryWorkspaceProps { api: CompanyDirectoryApi }

export function CompanyDirectoryWorkspace({ api }: CompanyDirectoryWorkspaceProps) {
  const [query, setQuery] = useState<CompanyListQuery>(EMPTY_QUERY);
  const [list, setList] = useState<CompanyList>({ companies: [], total: 0, page: 1, pageSize: 20 });
  const [error, setError] = useState("");

  const load = useCallback(async (nextQuery: CompanyListQuery) => {
    try {
      setError("");
      setList(await api.list(nextQuery));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [api]);

  useEffect(() => { void load(query); }, [load, query]);

  return (
    <section className="card company-directory" aria-labelledby="company-directory-heading">
      <div className="job-heading">
        <div><p className="eyebrow">OWNED COMPANY LIBRARY</p><h2 id="company-directory-heading">Verified companies</h2></div>
      </div>
      <p className="privacy-note job-note">Verified company identities and official domains are stored in your local database.</p>
      {error ? <p role="alert">{error}</p> : null}
      <label className="company-search">Search company<input aria-label="Search company" value={query.keyword} onChange={(event) => setQuery((current) => ({ ...current, keyword: event.target.value, page: 1 }))} /></label>
      {list.companies.length === 0 ? <p className="empty-copy">No verified companies have been stored yet.</p> : (
        <ul className="company-list" aria-label="Verified companies">
          {list.companies.map((company) => <li key={company.id}>
            <div><strong>{company.canonicalName}</strong><small>{company.industries.join(" · ")}</small></div>
            <a href={`https://${company.officialDomain}/`} target="_blank" rel="noreferrer">Open official site</a>
          </li>)}
        </ul>
      )}
    </section>
  );
}

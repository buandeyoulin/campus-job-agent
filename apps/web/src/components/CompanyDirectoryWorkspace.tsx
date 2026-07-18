import { useCallback, useEffect, useState } from "react";
import type { CompanyDirectoryList, CompanyDirectoryListQuery } from "@campus-job-agent/contracts";
import type { CompanyDirectoryApi } from "../company-directory-api";

const EMPTY_QUERY: CompanyDirectoryListQuery = { keyword: "", page: 1, pageSize: 20 };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Company directory is unavailable";
}

export interface CompanyDirectoryWorkspaceProps { api: CompanyDirectoryApi }

export function CompanyDirectoryWorkspace({ api }: CompanyDirectoryWorkspaceProps) {
  const [query, setQuery] = useState<CompanyDirectoryListQuery>(EMPTY_QUERY);
  const [list, setList] = useState<CompanyDirectoryList>({ entries: [], total: 0, page: 1, pageSize: 20 });
  const [error, setError] = useState("");

  const load = useCallback(async (nextQuery: CompanyDirectoryListQuery) => {
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
        <div><p className="eyebrow">PUBLIC COMPANY DIRECTORY</p><h2 id="company-directory-heading">Company recruiting entry points</h2></div>
      </div>
      <p className="privacy-note job-note">Company recruiting entry points are stored locally and open as ordinary external links.</p>
      {error ? <p role="alert">{error}</p> : null}
      <label className="company-search">Search company<input aria-label="Search company" value={query.keyword} onChange={(event) => setQuery((current) => ({ ...current, keyword: event.target.value, page: 1 }))} /></label>
      {list.entries.length === 0 ? <p className="empty-copy">No public company career links have been stored yet.</p> : (
        <ul className="company-list" aria-label="Company career sites">
          {list.entries.map((entry) => <li key={entry.id}>
            <div><strong>{entry.companyName}</strong><small>Source: {entry.directorySource}</small></div>
            <a href={entry.careerUrl} target="_blank" rel="noreferrer">Open career site</a>
          </li>)}
        </ul>
      )}
    </section>
  );
}

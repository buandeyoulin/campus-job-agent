export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [{
  version: 1,
  sql: `
    create table profile (
      id text primary key check (id = 'default'),
      display_name text not null,
      email text not null default '',
      phone text not null default '',
      current_city text not null default '',
      degree text not null default '',
      major text not null default '',
      graduation_date text not null default '',
      created_at text not null,
      updated_at text not null
    );

    create table job_preferences (
      profile_id text primary key references profile(id) on delete cascade,
      target_roles_json text not null check (json_valid(target_roles_json)),
      excluded_roles_json text not null check (json_valid(excluded_roles_json)),
      recruitment_types_json text not null check (json_valid(recruitment_types_json)),
      target_cities_json text not null check (json_valid(target_cities_json)),
      remote_preference text not null,
      availability_from text not null default '',
      availability_to text not null default '',
      days_per_week integer,
      minimum_duration_months integer,
      preferred_industries_json text not null check (json_valid(preferred_industries_json)),
      preferred_companies_json text not null check (json_valid(preferred_companies_json)),
      company_blacklist_json text not null check (json_valid(company_blacklist_json)),
      created_at text not null,
      updated_at text not null
    );

    create table resume_uploads (
      id text primary key,
      profile_id text not null references profile(id) on delete cascade,
      original_file_name text not null,
      stored_relative_path text not null,
      parsed_relative_path text,
      kind text not null check (kind in ('pdf', 'docx')),
      byte_size integer not null,
      sha256 text not null unique,
      is_active integer not null check (is_active in (0, 1)),
      parse_status text not null check (parse_status in ('pending', 'parsing', 'parsed', 'failed')),
      extraction_status text not null check (extraction_status in ('not_started', 'queued', 'extracting', 'awaiting_confirmation', 'completed', 'failed')),
      failure_code text,
      warnings_json text not null check (json_valid(warnings_json)),
      created_at text not null,
      updated_at text not null
    );

    create table profile_facts (
      id text primary key,
      profile_id text not null references profile(id) on delete cascade,
      type text not null check (type in ('education', 'internship', 'project', 'skill')),
      status text not null check (status in ('pending', 'confirmed', 'rejected')),
      source text not null check (source in ('manual', 'resume')),
      resume_upload_id text references resume_uploads(id) on delete set null,
      source_excerpt text,
      content_json text not null check (json_valid(content_json)),
      fingerprint text not null,
      duplicate_of_fact_id text references profile_facts(id) on delete set null,
      created_at text not null,
      updated_at text not null,
      confirmed_at text
    );

    create index profile_facts_profile_status on profile_facts(profile_id, status);
    create index profile_facts_fingerprint on profile_facts(profile_id, fingerprint);
    create unique index one_active_resume on resume_uploads(profile_id) where is_active = 1;
  `,
}, {
  version: 2,
  sql: `
    create table jobs (
      id text primary key,
      fingerprint text not null unique,
      source text not null,
      source_job_id text not null,
      source_url text not null,
      title text not null,
      company text not null,
      location text not null default '',
      description text not null,
      posted_at text,
      status text not null check (status in ('unknown', 'active', 'expired')),
      first_captured_at text not null,
      last_captured_at text not null
    );

    create table job_sources (
      job_id text not null references jobs(id) on delete cascade,
      source text not null,
      source_job_id text not null,
      source_url text not null,
      title text not null,
      company text not null,
      location text not null default '',
      description text not null,
      posted_at text,
      captured_at text not null,
      primary key (job_id, source, source_job_id)
    );

    create table source_scans (
      source text primary key,
      last_checked_at text not null,
      succeeded integer not null check (succeeded in (0, 1)),
      message text not null
    );

    create index jobs_list_order on jobs(last_captured_at desc, id);
    create index jobs_company_title on jobs(company, title);
    create index job_sources_source on job_sources(source, source_job_id);
  `,
}, {
  version: 3,
  sql: `
    create table applications (
      id text primary key,
      job_id text not null unique references jobs(id) on delete restrict,
      status text not null check (status in ('saved','preparing','applied','assessment','interview','offer','rejected','withdrawn','expired')),
      note text not null default '',
      created_at text not null,
      updated_at text not null
    );
    create table application_events (
      id text primary key,
      application_id text not null references applications(id) on delete cascade,
      status text not null check (status in ('saved','preparing','applied','assessment','interview','offer','rejected','withdrawn','expired')),
      note text not null default '',
      created_at text not null
    );
    create index application_events_by_application on application_events(application_id, created_at, id);
  `,
}, {
  version: 4,
  sql: `
    create table companies (
      id text primary key,
      normalized_name text not null unique,
      display_name text not null,
      created_at text not null,
      updated_at text not null
    );
    create table company_career_sites (
      id text primary key,
      company_id text not null references companies(id) on delete cascade,
      career_url text not null,
      directory_source text not null,
      directory_url text not null,
      status text not null check (status in ('pending', 'active', 'unavailable')),
      first_discovered_at text not null,
      last_discovered_at text not null,
      unique(directory_source, career_url)
    );
    create index company_career_sites_company on company_career_sites(company_id, last_discovered_at desc);
  `,
}, {
  version: 5,
  sql: `
    drop table company_career_sites;
    drop table companies;

    create table companies (
      id text primary key,
      normalized_name text not null,
      canonical_name text not null,
      aliases_json text not null check (json_valid(aliases_json)),
      official_domain text not null unique,
      industries_json text not null check (json_valid(industries_json)),
      regions_json text not null check (json_valid(regions_json)),
      origin text not null check (origin in ('seed', 'discovery', 'manual')),
      status text not null check (status in ('active', 'paused', 'invalid')),
      verification_score integer not null check (verification_score between 0 and 100),
      verification_evidence_json text not null check (json_valid(verification_evidence_json)),
      verified_at text not null,
      created_at text not null,
      updated_at text not null
    );

    create table company_candidates (
      id text primary key,
      normalized_name text not null,
      canonical_name text not null,
      candidate_domain text not null unique,
      homepage_url text not null,
      origin text not null check (origin in ('discovery', 'manual')),
      status text not null check (status in ('pending', 'quarantined', 'verified', 'rejected')),
      verification_score integer not null check (verification_score between 0 and 100),
      evidence_json text not null check (json_valid(evidence_json)),
      failure_reason text,
      retry_count integer not null default 0 check (retry_count >= 0),
      next_retry_at text,
      created_at text not null,
      updated_at text not null
    );

    create table company_career_sources (
      id text primary key,
      company_id text not null references companies(id) on delete cascade,
      canonical_url text not null,
      kind text not null check (kind in ('ats_api', 'json_api', 'json_ld', 'sitemap', 'html', 'custom')),
      adapter text not null,
      status text not null check (status in ('pending', 'active', 'backoff', 'unavailable')),
      health_score integer not null check (health_score between 0 and 100),
      last_success_at text,
      last_failure_at text,
      last_complete_sync_at text,
      next_sync_at text,
      backoff_until text,
      consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
      last_error text,
      created_at text not null,
      updated_at text not null,
      unique(company_id, canonical_url)
    );

    create index companies_name on companies(normalized_name);
    create index company_candidates_status on company_candidates(status, updated_at desc);
    create index company_career_sources_due on company_career_sources(status, next_sync_at);

    delete from job_sources where source not in ('tencent', 'manual');
    delete from jobs where not exists (select 1 from job_sources where job_sources.job_id = jobs.id);
    update jobs set
      source = (select source from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      source_job_id = (select source_job_id from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      source_url = (select source_url from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      title = (select title from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      company = (select company from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      location = (select location from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      description = (select description from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      posted_at = (select posted_at from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
      last_captured_at = (select captured_at from job_sources where job_id = jobs.id order by source, source_job_id limit 1);
    delete from source_scans where source not in ('tencent', 'manual');
  `,
}];

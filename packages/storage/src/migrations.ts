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
}];

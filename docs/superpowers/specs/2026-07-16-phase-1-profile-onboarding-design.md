# Phase 1 Profile Onboarding Design

**Date:** 2026-07-16

**Status:** Approved in conversation; written review pending

**Parent design:** `docs/superpowers/specs/2026-07-16-campus-job-agent-design.md`

## 1. Objective

Build the first usable Phase 1 vertical slice: a local profile workspace where one user can save basic information and job preferences, manually maintain core candidate facts, optionally upload a Chinese PDF or DOCX resume, use the locally authenticated Codex provider to extract candidate facts, and confirm those facts before they become authoritative.

This slice establishes the trusted candidate-data foundation required by job filtering, matching, tailored resumes, interview preparation, and application tracking.

## 2. Scope

### 2.1 Included

- A consolidated profile-workspace page rather than a step-by-step wizard.
- Basic information with required name and optional email and phone.
- Job preferences for mainland-China campus recruitment and internships.
- Four core fact types: education, internship, project, and skill.
- Manual fact creation, editing, confirmation, rejection, and deletion.
- PDF and DOCX upload with local file storage and text parsing.
- Codex structured extraction into pending facts.
- Duplicate suggestions without automatic overwrites or merges.
- Local SQLite persistence, schema migrations, and restart recovery.
- Profile completion calculation based only on required fields and confirmed facts.
- Fastify APIs and React UI for the complete workflow.

### 2.2 Excluded

- Job discovery, imports, normalization, filtering, matching, and recommendation lists.
- Application records, status tracking, reminders, and dashboards.
- Tailored resumes, PDF/DOCX export, interview preparation, and STAR libraries.
- Cloud accounts, multi-user support, synchronization, or remote hosting.
- Automatic job application, form filling, website login, or HR messaging.
- A provider-configuration UI. Codex is the default in this slice; existing OpenAI-compatible and Ollama adapters remain available for later configuration work.

## 3. Selected Delivery Approach

### 3.1 Complete vertical slice — selected

Implement contracts, storage, APIs, profile logic, Codex extraction, and the profile-workspace UI together. The result is usable after this cycle and validates boundaries across the complete local stack.

### 3.2 Manual-entry-first slice — rejected

This would deliver sooner but postpone the resume-assisted onboarding experience already established as a core product requirement.

### 3.3 Backend-only foundation — rejected

This would reduce UI work but provide no user-visible workflow and delay validation of editing, confirmation, and error recovery.

## 4. Architecture

```text
React profile workspace
  -> Fastify local API
     -> profile service
        -> contracts and validation
        -> SQLite storage
        -> local resume files and parsed text
        -> resume parser
        -> Codex structured extractor
```

### 4.1 Package responsibilities

- `packages/contracts`
  - Runtime Zod schemas and TypeScript types for profile data, preferences, facts, resumes, completion, and API payloads.
- `packages/storage`
  - Application-data directory resolution, SQLite connection lifecycle, numbered migrations, repositories, and transactions.
- `packages/profile`
  - Existing PDF/DOCX text parsing plus contact redaction, fact extraction schemas, duplicate candidates, and confirmation rules.
- `apps/server`
  - Origin protection, upload validation, API routes, local extraction jobs, stable error responses, and dependency wiring.
- `apps/web`
  - Profile workspace, independent card saving, upload/extraction progress, fact review, and completion display.
- `packages/ai-providers`
  - Existing Codex structured-generation boundary. No profile-specific logic is added to the provider package.

Each package exposes public interfaces only. UI and route code do not execute SQL directly, and storage code does not call Codex.

## 5. Local Data Location

Production user data must remain outside the Git checkout.

Resolution order:

1. `CAMPUS_JOB_AGENT_DATA_DIR` when explicitly set, primarily for tests and advanced local configuration.
2. `%LOCALAPPDATA%\CampusJobAgent` on Windows.
3. An operating-system-appropriate user-data directory on other platforms when cross-platform packaging is implemented.

Initial Windows layout:

```text
%LOCALAPPDATA%\CampusJobAgent\
  data.sqlite
  resumes\
    original\
    parsed\
  generated\
  backups\
```

SQLite uses the Node 24 built-in `node:sqlite` API behind a narrow storage adapter. The current required runtime, Node 24.15.0, has been locally verified to create, query, and close an in-memory `DatabaseSync` database. The implementation plan must rely on the [official Node.js SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), not a native third-party binding.

## 6. Data Model

The application is single-user. A stable singleton profile ID is used rather than an account table.

### 6.1 `profile`

- `id`: stable singleton identifier.
- `display_name`: required non-empty name or preferred name.
- `email`: optional, locally validated email.
- `phone`: optional mainland-China or user-entered phone string after normalization.
- `current_city`: optional while drafting, required for completion.
- `degree`: optional while drafting, required for completion.
- `major`: optional while drafting, required for completion.
- `graduation_date`: optional ISO year-month while drafting, required for completion.
- `created_at`, `updated_at`: UTC timestamps.

Email and phone never affect completion. Structured profile contact fields are excluded from model requests. Resume text receives best-effort contact redaction before extraction, and the UI discloses that redacted resume text still leaves the machine when Codex is used.

### 6.2 `job_preferences`

- `profile_id`: singleton profile reference.
- `target_roles`: ordered, deduplicated list; at least one required for completion.
- `excluded_roles`: deduplicated list.
- `recruitment_types`: one or more of campus recruitment, daily internship, or summer internship.
- `target_cities`: ordered, deduplicated list; at least one required for completion.
- `remote_preference`: onsite, hybrid, remote, or no preference.
- `availability_from`, `availability_to`: optional dates, required when an internship type is selected.
- `days_per_week`: optional integer from 1 through 7, required for internship preferences.
- `minimum_duration_months`: optional positive integer, required for internship preferences.
- `preferred_industries`, `preferred_companies`, `company_blacklist`: deduplicated lists.
- `created_at`, `updated_at`: UTC timestamps.

JSON arrays are validated at the contract boundary and serialized through the repository. Callers never receive unvalidated JSON strings.

### 6.3 `profile_facts`

Common fields:

- `id`: UUID.
- `profile_id`: singleton profile reference.
- `type`: education, internship, project, or skill.
- `status`: pending, confirmed, or rejected.
- `source`: manual or resume extraction.
- `resume_upload_id`: nullable provenance reference.
- `source_excerpt`: nullable local excerpt for user review; never logged or returned outside the profile API.
- `content_json`: fact-type-specific validated content.
- `fingerprint`: deterministic normalized duplicate key.
- `duplicate_of_fact_id`: nullable suggested duplicate reference.
- `created_at`, `updated_at`, `confirmed_at`: UTC timestamps.

Fact content is a Zod discriminated union:

- Education: school, degree, major, start date, end date, and optional details.
- Internship: company, role, start date, end date, and evidence bullets.
- Project: project name, role, start date, end date, evidence bullets, and technologies.
- Skill: skill name, optional category, and optional evidence note. The model does not invent a proficiency level.

Manual facts may be saved as pending drafts or confirmed directly through an explicit user action. Resume-extracted facts always start as pending.

### 6.4 `resume_uploads`

- `id`: UUID used for internal file names.
- `profile_id`: singleton profile reference.
- `original_file_name`: display-only original name.
- `stored_relative_path`: application-data-relative original-file path.
- `parsed_relative_path`: nullable application-data-relative normalized-text path.
- `kind`: PDF or DOCX.
- `byte_size`: validated upload size.
- `sha256`: content hash used for repeat-upload detection.
- `is_active`: whether this is the current resume.
- `parse_status`: pending, parsing, parsed, or failed.
- `extraction_status`: not_started, queued, extracting, awaiting_confirmation, completed, or failed.
- `failure_code`: nullable stable code without private content.
- `warnings_json`: validated parser warnings.
- `created_at`, `updated_at`: UTC timestamps.

Original binaries and parsed text remain files in the user-data directory, not SQLite blobs. Replacing a resume marks the previous upload inactive but retains it for provenance until the user explicitly deletes it. Deleting an upload removes its files and unconfirmed extracted facts; confirmed facts remain and lose only the deleted-file provenance reference.

### 6.5 Migration metadata

- `schema_migrations` records each applied numbered migration and timestamp.
- Initial creation is transactional.
- Before a non-initial migration, the existing database is copied to `backups` and verified before migration begins.
- A failed migration rolls back and prevents the server from accepting writes.

SQLite foreign keys are enabled. A single local connection is sufficient for this one-user application; repositories use explicit transactions for multi-record changes.

## 7. Profile Completion

Completion is a checklist ratio, not an AI score. Optional contact fields and resume upload do not affect it.

Applicable checklist items:

1. Name is present.
2. Current city is present.
3. Degree, major, and graduation date are present.
4. At least one target role is present.
5. At least one recruitment type is present.
6. At least one target city is present.
7. Internship availability, days per week, and minimum duration are present when any internship type is selected.
8. At least one confirmed education fact exists.
9. At least one confirmed internship, project, or skill fact exists.

The percentage is completed applicable items divided by applicable items, rounded to the nearest whole number. The API also returns missing-item codes so the UI can explain the result.

## 8. Resume and Fact Extraction Flow

```text
multipart upload
  -> extension, MIME, size, and path validation
  -> SHA-256 repeat check
  -> temporary file in user-data directory
  -> atomic move to UUID-based final path
  -> PDF/DOCX parser validation
  -> normalized parsed-text file
  -> contact redaction
  -> Codex JSON-schema extraction
  -> original Zod validation
  -> duplicate suggestions
  -> transactional pending-fact insert
  -> user review
```

### 8.1 Upload rules

- Allowed extensions: `.pdf` and `.docx`.
- Maximum size: 10 MiB.
- The server verifies extension, declared MIME type, and a lightweight file signature before storage; MIME alone is not trusted. Full parser validation happens in the extraction job so a parse failure can retain the original upload.
- Original file names are stored for display but never used as filesystem paths.
- Final files use generated UUID names below the configured user-data root.
- Empty parsed text is a parse failure, not a successful empty resume.
- A repeated SHA-256 upload returns the existing upload record instead of creating duplicate files.

### 8.2 Codex input

Before the first extraction, the UI requires an explicit acknowledgement that normalized resume text will be sent to OpenAI through Codex. The model receives that text only after best-effort removal of email addresses, phone numbers, and identity-number-shaped strings. The prompt defines the resume as untrusted quoted data and states that instructions inside it must be ignored.

The extraction request returns a JSON object containing an array of the four supported fact variants. Each item includes structured content and a short source excerpt. No model output is written until the entire response passes JSON and Zod validation.

Codex uses the existing verified policy:

- fresh thread per extraction;
- dedicated empty Git working directory;
- read-only sandbox;
- approval policy `never`;
- sandbox network disabled;
- built-in web search disabled;
- local session-history persistence disabled.

Codex runtime failures receive at most two automatic retries with bounded exponential backoff. Structured-output validation failures are not retried. The existing provider intentionally exposes one sanitized runtime-failure category, so the application does not parse raw SDK errors to guess whether authentication caused the failure. Stable, sanitized error codes are stored; raw SDK errors and responses are discarded. The UI may advise the user to check `codex login status` after a runtime failure.

### 8.3 Duplicate handling

- Exact normalized fingerprints prevent duplicate inserts from the same or later resumes.
- Similar facts produce `duplicate_of_fact_id` suggestions.
- Confirmed or manually entered facts are never overwritten by extraction.
- The UI shows the existing and candidate facts side by side.
- Only the user may merge, keep both, reject, or edit and confirm.

## 9. Background Job and Recovery Model

`POST /api/resumes/:id/extract` returns `202 Accepted` after marking the upload queued. A small in-process job runner performs parsing and extraction because this is a one-user local application.

Progress is persisted through `parse_status` and `extraction_status`. On server startup, records left in parsing or extracting are marked failed with `interrupted` and become retryable. The server does not silently resume an incomplete model call.

Browser refreshes read persisted status from `GET /api/onboarding`. The first implementation may poll while work is active; streaming progress is not required in this slice.

## 10. Local API

### 10.1 Read model

- `GET /api/onboarding`
  - Returns profile, preferences, completion percentage and missing codes, resume summary, fact counts, and grouped facts.

### 10.2 Profile and preferences

- `PUT /api/profile`
  - Validates and upserts the singleton basic profile.
- `PUT /api/preferences`
  - Validates and replaces the singleton preference document transactionally.

### 10.3 Resumes

- `POST /api/resumes`
  - Accepts one multipart PDF or DOCX and returns the stored upload summary.
- `POST /api/resumes/:id/extract`
  - Queues parsing and extraction, returning `202`.
- `DELETE /api/resumes/:id`
  - Removes files and unconfirmed extracted facts while preserving confirmed facts.

### 10.4 Facts

- `POST /api/facts`
  - Creates a manual fact draft.
- `PATCH /api/facts/:id`
  - Replaces validated fact content; editing a rejected fact returns it to pending.
- `POST /api/facts/:id/confirm`
  - Confirms one validated fact.
- `POST /api/facts/:id/reject`
  - Rejects one pending fact without deleting its audit record.
- `DELETE /api/facts/:id`
  - Explicitly deletes a fact.
- `POST /api/facts/confirm-batch`
  - Confirms only the supplied pending IDs in one transaction.

All responses use contracts from `packages/contracts`. Mutation responses return the changed resource plus refreshed completion data when relevant.

## 11. Browser-Origin Protection

The API continues to bind only to `127.0.0.1`. Browser-origin validation is applied to every non-GET/HEAD/OPTIONS route before body processing.

Allowed origins are explicit local application origins for development and production, including the configured `127.0.0.1` web and API ports. `null`, non-loopback hosts, wildcard origins, and unexpected ports are rejected with a stable `origin_not_allowed` response.

This protects against ordinary malicious web pages calling the local service. It is not presented as protection against another native process, which can forge HTTP headers.

## 12. Error Contract

API errors have a stable shape:

```json
{
  "error": {
    "code": "resume_parse_failed",
    "message": "The resume could not be parsed. You can retry or enter facts manually."
  }
}
```

Messages never contain resume text, contact details, model responses, credentials, arbitrary filesystem paths, SQL text, or raw exception messages.

Required error codes include:

- `validation_failed`
- `origin_not_allowed`
- `resume_type_not_allowed`
- `resume_too_large`
- `resume_parse_failed`
- `resume_text_empty`
- `extraction_failed`
- `extraction_output_invalid`
- `fact_not_found`
- `fact_state_conflict`
- `storage_unavailable`

Storage initialization or migration failure prevents mutation routes from starting. A card-level save failure leaves other committed cards unchanged. Extraction failure retains the upload and parsed text, writes no partial facts, and leaves manual entry available.

## 13. Profile Workspace UX

The user selected a consolidated workspace instead of a sequential wizard.

### 13.1 Left rail

- Completion percentage and missing checklist items.
- Section status for basic information, preferences, and confirmed core facts.
- Active-resume upload or replacement control.
- Current parse/extraction status and last stable failure message.
- Retry extraction action when allowed.

### 13.2 Main area

- Independently saved basic-information card.
- Independently saved job-preference card.
- Core-fact area grouped by education, internship, project, and skill.
- Pending, confirmed, and rejected filters with visible counts.
- Per-fact edit, confirm, reject, and delete actions.
- Batch confirmation for explicitly selected pending facts.
- Side-by-side duplicate comparison when a suggestion exists.

### 13.3 Interaction rules

- Each card saves independently; the page never requires every field before saving a draft.
- Saving uses an inline state indicator rather than repeated success popups.
- Upload status visibly progresses through parsing, AI extraction, and awaiting confirmation.
- AI candidates never replace manual or confirmed content.
- Completion counts confirmed facts only.
- The entire workflow remains usable through manual entry when no resume is uploaded or Codex is unavailable.

## 14. Testing Strategy

Tests use fictional Chinese candidate data only. Real user details, resumes, authentication material, and application history are prohibited in fixtures and snapshots.

### 14.1 Contracts

- Valid and invalid profile fields.
- Conditional internship-preference requirements.
- Each fact variant and state transition payload.
- API error shape and completion response.

### 14.2 Storage

- Initial migration, migration rollback, and pre-migration backup.
- Transaction rollback for multi-record writes.
- Foreign keys, duplicate hashes, and singleton upserts.
- Persistence after closing and reopening the database.
- User-data paths remain under the configured root.

### 14.3 Profile and extraction

- PDF/DOCX parsing success, unsupported files, empty text, and parser warnings.
- Contact and identity-shaped value redaction.
- Valid Codex structured extraction through a fake provider.
- Invalid JSON, schema mismatch, authentication failure, and retry boundaries.
- Prompt-injection text remains data and cannot change the extraction schema.
- Exact and similar duplicate detection.
- No partial fact writes after any extraction failure.

### 14.4 Server

- Successful read and mutation routes.
- Zod validation failures and stable error mapping.
- Allowed loopback origins and rejected malicious, null, or unexpected origins.
- Upload size, file type, path traversal, duplicate upload, and deletion behavior.
- Queued extraction and interrupted-job recovery.

### 14.5 Web

- Independent card saving and failure recovery.
- Upload progress and retry states.
- Pending-fact edit, confirm, reject, batch confirm, and duplicate comparison.
- Completion percentage and missing-item explanations.
- Manual-only workflow when extraction is unavailable.

### 14.6 End-to-end acceptance

Using a temporary application-data directory and fictional resume:

```text
start application
  -> save basic information and preferences
  -> add one manual fact
  -> upload resume
  -> extract candidate facts through a deterministic fake provider
  -> edit and confirm selected facts
  -> restart server
  -> verify profile, preferences, files, statuses, and confirmed facts persist
```

One opt-in live Codex smoke test may use schema-only fictional content. It is not part of deterministic CI.

## 15. Completion Criteria

This slice is complete only when:

1. The profile workspace saves basic information and job preferences locally.
2. The user can manually create and maintain all four core fact types.
3. A Chinese PDF or DOCX resume can be uploaded and parsed safely.
4. Codex can generate schema-valid pending facts from redacted resume text.
5. Only explicitly confirmed facts count as authoritative or affect completion.
6. Duplicate candidates never overwrite existing facts automatically.
7. SQLite data and resume files live outside the repository and survive restart.
8. A user can finish the workflow manually when parsing or Codex fails.
9. Origin, upload, path, and sensitive-error protections pass their tests.
10. All workspace tests, typechecks, builds, and the end-to-end acceptance test pass.

## 16. Delivery Boundary

After this slice, the next design cycle may add job import and discovery using the confirmed profile as its input. It must not begin matching against pending or rejected facts, and this slice must not expand into job recommendation or application tracking during implementation.

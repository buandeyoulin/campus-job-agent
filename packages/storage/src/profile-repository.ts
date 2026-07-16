import type { DatabaseSync } from "node:sqlite";
import {
  JobPreferencesSchema,
  ProfileDraftSchema,
  type JobPreferences,
  type ProfileDraft,
} from "@campus-job-agent/contracts";

interface ProfileRow {
  display_name: string;
  email: string;
  phone: string;
  current_city: string;
  degree: string;
  major: string;
  graduation_date: string;
}

interface PreferencesRow {
  target_roles_json: string;
  excluded_roles_json: string;
  recruitment_types_json: string;
  target_cities_json: string;
  remote_preference: string;
  availability_from: string;
  availability_to: string;
  days_per_week: number | null;
  minimum_duration_months: number | null;
  preferred_industries_json: string;
  preferred_companies_json: string;
  company_blacklist_json: string;
}

export class ProfileRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getProfile(): ProfileDraft | null {
    const row = this.db.prepare(`
      select display_name, email, phone, current_city, degree, major, graduation_date
      from profile
      where id = 'default'
    `).get() as ProfileRow | undefined;

    if (!row) return null;
    return ProfileDraftSchema.parse({
      displayName: row.display_name,
      email: row.email,
      phone: row.phone,
      currentCity: row.current_city,
      degree: row.degree,
      major: row.major,
      graduationDate: row.graduation_date,
    });
  }

  saveProfile(value: ProfileDraft): ProfileDraft {
    const input = ProfileDraftSchema.parse(value);
    const timestamp = this.now().toISOString();

    this.db.prepare(`
      insert into profile (
        id, display_name, email, phone, current_city, degree, major, graduation_date, created_at, updated_at
      ) values ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        display_name = excluded.display_name,
        email = excluded.email,
        phone = excluded.phone,
        current_city = excluded.current_city,
        degree = excluded.degree,
        major = excluded.major,
        graduation_date = excluded.graduation_date,
        updated_at = excluded.updated_at
    `).run(
      input.displayName,
      input.email,
      input.phone,
      input.currentCity,
      input.degree,
      input.major,
      input.graduationDate,
      timestamp,
      timestamp,
    );

    return input;
  }

  getPreferences(): JobPreferences | null {
    const row = this.db.prepare("select * from job_preferences where profile_id = 'default'").get() as PreferencesRow | undefined;
    if (!row) return null;

    return JobPreferencesSchema.parse({
      targetRoles: JSON.parse(row.target_roles_json),
      excludedRoles: JSON.parse(row.excluded_roles_json),
      recruitmentTypes: JSON.parse(row.recruitment_types_json),
      targetCities: JSON.parse(row.target_cities_json),
      remotePreference: row.remote_preference,
      availabilityFrom: row.availability_from,
      availabilityTo: row.availability_to,
      daysPerWeek: row.days_per_week,
      minimumDurationMonths: row.minimum_duration_months,
      preferredIndustries: JSON.parse(row.preferred_industries_json),
      preferredCompanies: JSON.parse(row.preferred_companies_json),
      companyBlacklist: JSON.parse(row.company_blacklist_json),
    });
  }

  savePreferences(value: JobPreferences): JobPreferences {
    if (!this.getProfile()) {
      throw new Error("Profile must be saved before preferences");
    }

    const input = JobPreferencesSchema.parse(value);
    const timestamp = this.now().toISOString();

    this.db.prepare(`
      insert into job_preferences (
        profile_id, target_roles_json, excluded_roles_json, recruitment_types_json,
        target_cities_json, remote_preference, availability_from, availability_to,
        days_per_week, minimum_duration_months, preferred_industries_json,
        preferred_companies_json, company_blacklist_json, created_at, updated_at
      ) values ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(profile_id) do update set
        target_roles_json = excluded.target_roles_json,
        excluded_roles_json = excluded.excluded_roles_json,
        recruitment_types_json = excluded.recruitment_types_json,
        target_cities_json = excluded.target_cities_json,
        remote_preference = excluded.remote_preference,
        availability_from = excluded.availability_from,
        availability_to = excluded.availability_to,
        days_per_week = excluded.days_per_week,
        minimum_duration_months = excluded.minimum_duration_months,
        preferred_industries_json = excluded.preferred_industries_json,
        preferred_companies_json = excluded.preferred_companies_json,
        company_blacklist_json = excluded.company_blacklist_json,
        updated_at = excluded.updated_at
    `).run(
      JSON.stringify(input.targetRoles),
      JSON.stringify(input.excludedRoles),
      JSON.stringify(input.recruitmentTypes),
      JSON.stringify(input.targetCities),
      input.remotePreference,
      input.availabilityFrom,
      input.availabilityTo,
      input.daysPerWeek,
      input.minimumDurationMonths,
      JSON.stringify(input.preferredIndustries),
      JSON.stringify(input.preferredCompanies),
      JSON.stringify(input.companyBlacklist),
      timestamp,
      timestamp,
    );

    return input;
  }
}

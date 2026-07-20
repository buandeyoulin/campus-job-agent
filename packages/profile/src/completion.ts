import type {
  JobPreferences,
  ProfileCompletion,
  ProfileDraft,
  ProfileFact,
} from "@campus-job-agent/contracts";

export function calculateProfileCompletion(
  profile: ProfileDraft | null,
  preferences: JobPreferences | null,
  facts: ProfileFact[],
): ProfileCompletion {
  const state: Record<string, boolean> = {
    "profile.name": Boolean(profile?.displayName),
    "profile.city": Boolean(profile?.currentCity),
    "profile.education": Boolean(profile?.degree && profile.major && profile.graduationDate),
    "preferences.role": Boolean(preferences?.targetRoles.length),
    "preferences.recruitmentType": Boolean(preferences?.recruitmentTypes.length),
    "preferences.location": Boolean(preferences?.targetCities.length),
    "facts.education": facts.some((fact) => fact.status === "confirmed" && fact.content.type === "education"),
    "facts.experience": facts.some((fact) => (
      fact.status === "confirmed"
      && ["internship", "project", "skill"].includes(fact.content.type)
    )),
  };

  if (preferences?.recruitmentTypes.some((type) => type !== "campus")) {
    state["preferences.internshipAvailability"] = Boolean(
      preferences.availabilityFrom
      && preferences.availabilityTo
      && preferences.daysPerWeek
      && preferences.minimumDurationMonths,
    );
  }

  const entries = Object.entries(state);
  const completed = entries.filter(([, value]) => value).map(([key]) => key);
  const missing = entries.filter(([, value]) => !value).map(([key]) => key);
  return {
    percentage: Math.round((completed.length / entries.length) * 100),
    completed,
    missing,
  };
}

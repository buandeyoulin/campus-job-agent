import { evaluateJobMatch, rankJobMatches, type JobMatch } from "@campus-job-agent/matching";
import type { FactRepository, JobRepository, ProfileRepository } from "@campus-job-agent/storage";

export interface MatchServiceDependencies { profiles: ProfileRepository; facts: FactRepository; jobs: JobRepository }

export class MatchService {
  constructor(private readonly dependencies: MatchServiceDependencies) {}

  list(): JobMatch[] {
    const preferences = this.dependencies.profiles.getPreferences();
    if (!preferences) return [];
    const jobs = this.dependencies.jobs.list({ keyword: "", city: "", source: "", status: "active", page: 1, pageSize: 100 }).jobs;
    return rankJobMatches(jobs.map((job) => evaluateJobMatch(job, preferences, this.dependencies.facts.list())));
  }
}

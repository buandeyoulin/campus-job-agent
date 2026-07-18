import { tmpdir } from "node:os";
import path from "node:path";
import { CodexProvider, ensureCodexRuntimeDirectory, type StructuredAiProvider } from "@campus-job-agent/ai-providers";
import { parseResume } from "@campus-job-agent/profile";
import {
  FactRepository,
  ApplicationRepository,
  CompanyRepository,
  JobRepository,
  openDatabase,
  ProfileRepository,
  resolveDataPaths,
  ResumeRepository,
} from "@campus-job-agent/storage";
import { fetchOfferBiuCompanyDirectory, fetchOfferBiuJobs, fetchTencentJobs } from "@campus-job-agent/sources";
import { ExtractionJobRunner } from "./extraction-jobs.js";
import { OnboardingService } from "./onboarding-service.js";
import { ResumeFileStore } from "./resume-files.js";
import type { ResumeRouteDependencies } from "./resume-routes.js";
import { JobsService } from "./jobs-service.js";
import { MatchService } from "./matching-service.js";
import { ApplicationsService } from "./applications-service.js";
import { CompanyDirectoryService } from "./company-directory-service.js";
import { OfferBiuBridgeService } from "./offerbiu-bridge-service.js";

export interface ProductionServices {
  onboarding: OnboardingService;
  resumes: ResumeRepository;
  files: ResumeFileStore;
  runner: ExtractionJobRunner;
  resumeRoutes: ResumeRouteDependencies;
  jobs: JobsService;
  matches: MatchService;
  applications: ApplicationsService;
  companies: CompanyDirectoryService;
  offerBiuBridge: OfferBiuBridgeService;
  close(): void;
}

export interface ServiceOverrides {
  provider?: StructuredAiProvider;
  parse?: typeof parseResume;
  enqueue?: (work: () => Promise<void>) => void;
}

export async function createProductionServices(
  environment: NodeJS.ProcessEnv = process.env,
  overrides: ServiceOverrides = {},
): Promise<ProductionServices> {
  const paths = resolveDataPaths(environment.CAMPUS_JOB_AGENT_DATA_DIR);
  const storage = await openDatabase({ dataRoot: paths.root });

  try {
    let provider = overrides.provider;
    if (!provider) {
      const codexDirectory = await ensureCodexRuntimeDirectory(
        path.join(tmpdir(), "campus-job-agent", "codex-runtime"),
      );
      provider = new CodexProvider({ workingDirectory: codexDirectory });
    }
    const profiles = new ProfileRepository(storage.db);
    const jobsRepository = new JobRepository(storage.db);
    const applicationsRepository = new ApplicationRepository(storage.db);
    const companiesRepository = new CompanyRepository(storage.db);
    const facts = new FactRepository(storage.db);
    const resumes = new ResumeRepository(storage.db);
    const files = new ResumeFileStore(paths.root);
    const onboarding = new OnboardingService({ profiles, facts, resumes });
    const jobs = new JobsService({ repository: jobsRepository, fetchTencent: fetchTencentJobs, fetchOfferBiu: fetchOfferBiuJobs });
    const matches = new MatchService({ profiles, facts, jobs: jobsRepository });
    const applications = new ApplicationsService(applicationsRepository);
    const companies = new CompanyDirectoryService({ repository: companiesRepository, fetchOfferBiu: fetchOfferBiuCompanyDirectory });
    const offerBiuBridge = new OfferBiuBridgeService(jobs);
    const runner = new ExtractionJobRunner({
      resumes,
      facts,
      files,
      provider,
      parse: overrides.parse ?? parseResume,
    });
    runner.recoverInterrupted();

    const resumeRoutes: ResumeRouteDependencies = {
      profiles,
      resumes,
      files,
      runner,
      enqueue: overrides.enqueue ?? ((work) => { void work(); }),
    };
    return {
      onboarding,
      resumes,
      files,
      runner,
      resumeRoutes,
      jobs,
      matches,
      applications,
      companies,
      offerBiuBridge,
      close: () => storage.close(),
    };
  } catch (error) {
    storage.close();
    throw error;
  }
}

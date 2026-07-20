import { clearInterval as nodeClearInterval, setInterval as nodeSetInterval } from "node:timers";
import type { CompanyDirectoryService } from "./company-directory-service.js";
import type { CompanyJobSyncService } from "./company-job-sync-service.js";

export interface CompanyMaintenanceRunnerDependencies {
  companies: Pick<CompanyDirectoryService, "verifyPendingCandidates">;
  jobSync: Pick<CompanyJobSyncService, "sync">;
  intervalMs?: number;
  setIntervalFn?: (callback: () => void, milliseconds: number) => NodeJS.Timeout;
  clearIntervalFn?: (timer: NodeJS.Timeout) => void;
}

export class CompanyMaintenanceRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly dependencies: CompanyMaintenanceRunnerDependencies) {}

  start(): void {
    if (this.timer) return;
    const setTimer = this.dependencies.setIntervalFn ?? nodeSetInterval;
    const timer = setTimer(() => { void this.tick(); }, this.dependencies.intervalMs ?? 60 * 60 * 1_000);
    timer.unref();
    this.timer = timer;
  }

  async tick(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      await this.dependencies.companies.verifyPendingCandidates(20);
      await this.dependencies.jobSync.sync({ dueOnly: true });
      return true;
    } catch {
      return true;
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (!this.timer) return;
    (this.dependencies.clearIntervalFn ?? nodeClearInterval)(this.timer);
    this.timer = null;
  }
}

import { describe, expect, it, vi } from "vitest";
import { CompanyMaintenanceRunner } from "../src/company-maintenance-runner.js";

describe("CompanyMaintenanceRunner", () => {
  it("never overlaps ticks and synchronizes only due sources", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const verifyPendingCandidates = vi.fn(async () => { await gate; return {} as never; });
    const sync = vi.fn(async () => ({} as never));
    const runner = new CompanyMaintenanceRunner({ companies: { verifyPendingCandidates }, jobSync: { sync } });

    const first = runner.tick();
    await expect(runner.tick()).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
    expect(verifyPendingCandidates).toHaveBeenCalledWith(20);
    expect(sync).toHaveBeenCalledWith({ dueOnly: true });
  });

  it("starts idempotently, unreferences the timer, and stops it", () => {
    const handle = { unref: vi.fn() };
    const setIntervalFn = vi.fn(() => handle as unknown as NodeJS.Timeout);
    const clearIntervalFn = vi.fn();
    const runner = new CompanyMaintenanceRunner({
      companies: { verifyPendingCandidates: vi.fn() as never },
      jobSync: { sync: vi.fn() as never },
      setIntervalFn,
      clearIntervalFn,
    });
    runner.start();
    runner.start();
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(handle.unref).toHaveBeenCalled();
    runner.stop();
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
  });
});

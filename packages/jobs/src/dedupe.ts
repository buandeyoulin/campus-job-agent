import { StoredJobSchema, type NormalizedJob, type StoredJob } from "@campus-job-agent/contracts";
import { fingerprintJob, normalizeJob } from "./normalize.js";

export function mergeJob(existing: StoredJob, incoming: NormalizedJob): StoredJob {
  const next = normalizeJob(incoming);
  const sameSource = (source: NormalizedJob) => source.source === next.source && source.sourceJobId === next.sourceJobId;
  const sources = [
    ...existing.sources.filter((source) => !sameSource(source)),
    next,
  ];
  return StoredJobSchema.parse({
    ...existing,
    ...next,
    fingerprint: fingerprintJob(next),
    status: existing.status === "expired" ? "expired" : "active",
    firstCapturedAt: existing.firstCapturedAt,
    lastCapturedAt: next.capturedAt,
    sources,
  });
}

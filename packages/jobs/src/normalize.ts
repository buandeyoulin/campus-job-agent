import { createHash } from "node:crypto";
import { NormalizedJobSchema, type NormalizedJob } from "@campus-job-agent/contracts";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanUrl(value: string): string {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function normalizeJob(input: NormalizedJob): NormalizedJob {
  return NormalizedJobSchema.parse({
    ...input,
    source: cleanText(input.source).toLowerCase(),
    sourceJobId: cleanText(input.sourceJobId),
    sourceUrl: cleanUrl(input.sourceUrl),
    title: cleanText(input.title),
    company: cleanText(input.company),
    location: cleanText(input.location),
    description: cleanText(input.description),
  });
}

export function fingerprintJob(input: NormalizedJob): string {
  const job = normalizeJob(input);
  return createHash("sha256")
    .update([
      job.company,
      job.title.replace(/\s+/g, ""),
      job.location,
      job.description,
    ].map((part) => part.toLowerCase()).join("\n"), "utf8")
    .digest("hex");
}

import { z } from "zod";

export const ProbeResultSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["pass", "fail", "skip"]),
  summary: z.string().min(1),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  checkedAt: z.iso.datetime(),
});

export type ProbeResult = z.infer<typeof ProbeResultSchema>;

export const NormalizedJobSchema = z.object({
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  sourceUrl: z.url(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().default(""),
  description: z.string().min(1),
  postedAt: z.iso.datetime().optional(),
  capturedAt: z.iso.datetime(),
});

export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;

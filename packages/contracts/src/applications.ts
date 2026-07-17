import { z } from "zod";

export const ApplicationStatusSchema = z.enum([
  "saved", "preparing", "applied", "assessment", "interview", "offer", "rejected", "withdrawn", "expired",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationCreateSchema = z.object({ jobId: z.uuid() });
export type ApplicationCreate = z.infer<typeof ApplicationCreateSchema>;

export const ApplicationUpdateSchema = z.object({
  status: ApplicationStatusSchema,
  note: z.string().trim().max(2_000).default(""),
});
export type ApplicationUpdate = z.infer<typeof ApplicationUpdateSchema>;

export const ApplicationSchema = z.object({ id: z.uuid(), jobId: z.uuid(), status: ApplicationStatusSchema, note: z.string(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export type Application = z.infer<typeof ApplicationSchema>;
export const ApplicationEventSchema = z.object({ id: z.uuid(), applicationId: z.uuid(), status: ApplicationStatusSchema, note: z.string(), createdAt: z.iso.datetime() });
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

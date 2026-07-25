import { z } from 'zod';

// Query for GET /customers/stats/intake (utm-params 03): the month under
// review as YYYY-MM; omitted → current month, resolved server-side in UTC.
export const intakeStatsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM')
    .optional(),
});

export type IntakeStatsQuery = z.infer<typeof intakeStatsQuerySchema>;

// Query for GET /customers/stats/trend (CRM dashboard redesign 2026-07-22):
// how many calendar months the series covers, ending at the current one.
export const intakeTrendQuerySchema = z.object({
  months: z.coerce.number().int().min(3).max(12).default(6),
});

export type IntakeTrendQuery = z.infer<typeof intakeTrendQuerySchema>;

// Query for GET /customers/follow-ups — the dashboard agenda page size.
export const followUpsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export type FollowUpsQuery = z.infer<typeof followUpsQuerySchema>;

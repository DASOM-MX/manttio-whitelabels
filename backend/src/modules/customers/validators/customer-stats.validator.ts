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

import { z } from 'zod';

export const sendReportEmailSchema = z.object({
  to: z.string().email().optional(),
  cc: z.array(z.string().email()).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  message: z.string().max(2000).optional(),
});

export type SendReportEmailInput = z.infer<typeof sendReportEmailSchema>;

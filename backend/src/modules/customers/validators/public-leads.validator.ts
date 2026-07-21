import { z } from 'zod';
import { ClientType } from '../enums/customers.enum';
import {
  sanitizeAttributionValue,
  sanitizeLandingPage,
  sanitizeReferrer,
} from '../utils/sanitize-attribution';

// Attribution fields sanitize (never reject): oversized/dirty values are
// cleaned or dropped via .transform so a lead is never lost over attribution.
const attributionField = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : sanitizeAttributionValue(v, 255)));

export const createLeadSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email().optional(),
    phone: z
      .string()
      .max(50)
      .regex(/^\+?[\d\s().-]+$/)
      .refine(
        (v) => {
          const digits = v.replace(/\D/g, '').length;
          return digits >= 7 && digits <= 15;
        },
        { message: 'phone must contain 7-15 digits' },
      )
      .optional(),
    clientType: z.nativeEnum(ClientType),
    businessName: z.string().min(1).max(200).optional(),
    comments: z.string().max(250).optional(),
    turnstileToken: z.string().min(1),
    utmSource: attributionField,
    utmMedium: attributionField,
    utmCampaign: attributionField,
    utmTerm: attributionField,
    utmContent: attributionField,
    gclid: attributionField,
    fbclid: attributionField,
    referrer: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? undefined : sanitizeReferrer(v))),
    landingPage: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? undefined : sanitizeLandingPage(v))),
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: 'email or phone is required',
    path: ['email'],
  })
  .superRefine((v, ctx) => {
    if (v.clientType === ClientType.Business && !v.businessName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'businessName is required for business leads',
        path: ['businessName'],
      });
    }
  });

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

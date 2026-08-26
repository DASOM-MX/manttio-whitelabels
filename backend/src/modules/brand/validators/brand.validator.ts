import { z } from 'zod';
import { BRAND_SCALE_STEPS } from '../constants/scale-steps';
import { FONT_CATALOG_CODES } from '../constants/font-catalog';
import type { BrandScaleStep } from '../constants/scale-steps';

// Scale values are HSL components — the exact string dropped into
// `hsl(var(--brand-…))` (rule 2). The regex rejects hex outright; ranges are
// checked numerically (H ≤ 360, S/L ≤ 100).
const HSL_COMPONENTS_RE = /^(\d{1,3}(?:\.\d+)?) (\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/;

const hslComponents = z.string().refine((value) => {
  const m = HSL_COMPONENTS_RE.exec(value);
  if (!m) return false;
  return Number(m[1]) <= 360 && Number(m[2]) <= 100 && Number(m[3]) <= 100;
}, 'expected HSL components "H S% L%"');

// A materialized scale carries exactly the 11 steps 0…1000 by 100; z.object
// strips anything outside the ramp so stray steps never reach storage.
const hslScaleSchema = z.object(
  Object.fromEntries(BRAND_SCALE_STEPS.map((step) => [step, hslComponents])) as Record<
    BrandScaleStep,
    typeof hslComponents
  >,
);

const fontCode = z
  .string()
  .refine((code) => FONT_CATALOG_CODES.has(code), 'unknown font catalog code');

// Human-formatted phone numbers: optional +country code, separators allowed,
// 10–15 digits once stripped (MX numbers are 10). Empty fails (0 digits), so
// this is inherently required.
const phoneNumber = z
  .string()
  .max(20)
  .refine(
    (value) => /^\+?\d{10,15}$/.test(value.replace(/[\s\-().]/g, '')),
    'expected a phone number (10-15 digits)',
  );

// Social links are optional and editors send '' for untouched inputs, so blank
// entries are dropped before the URL check instead of failing it.
const socialSchema = z.preprocess(
  (value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, url]) => url !== ''))
      : value,
  z.record(z.string().url().max(300)),
);

// Length caps mirror the editor's maxlength attrs — see the superadmin brand
// editor; keep the two in sync.
export const saveBrandSchema = z.object({
  name: z.string().min(1).max(100),
  slogan: z.string().min(1).max(150),
  description: z.string().max(300).optional(),
  // siteUrl is manager-owned (the tenant site ships with the whitelabel
  // package) — the in-tenant editor omits it and the stored value survives.
  siteUrl: z.string().url().max(300).optional(),
  // R2 keys from POST /upload/image — never URLs (rule 6).
  logoKey: z.string().min(1).optional(),
  logoDarkKey: z.string().min(1).optional(),
  isologoKey: z.string().min(1).optional(),
  faviconKey: z.string().min(1).optional(),
  // Required and fully materialized — the editor runs the palette math, the
  // backend stores the scales verbatim (01 §1.4 reconciliation). Both scales
  // are mandatory (22 § Decisions ①): a writer still sending the retired
  // `surface` key fails loudly instead of half-applying, so the manager app
  // ships its two-picker editor in lockstep rather than pushing a key the
  // backend silently strips.
  colors: z.object({
    primary: hslScaleSchema,
    accent: hslScaleSchema,
  }),
  // Contact info is required brand data — every consumer surface renders it.
  contact: z.object({
    phone: phoneNumber,
    whatsapp: phoneNumber,
    email: z.string().email().max(254),
    address: z.string().min(1).max(250),
  }),
  social: socialSchema.optional(),
  font: z
    .object({
      body: fontCode.optional(),
      heading: fontCode.optional(),
    })
    .optional(),
});

export type SaveBrandInput = z.infer<typeof saveBrandSchema>;

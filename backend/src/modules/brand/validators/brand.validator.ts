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

export const saveBrandSchema = z.object({
  name: z.string().min(1),
  slogan: z.string().optional(),
  description: z.string().optional(),
  siteUrl: z.string().url().optional(),
  // R2 keys from POST /upload/image — never URLs (rule 6).
  logoKey: z.string().min(1).optional(),
  logoDarkKey: z.string().min(1).optional(),
  isologoKey: z.string().min(1).optional(),
  faviconKey: z.string().min(1).optional(),
  // Required and fully materialized — the editor runs the palette math, the
  // backend stores the scales verbatim (01 §1.4 reconciliation).
  colors: z.object({
    primary: hslScaleSchema,
    surface: hslScaleSchema,
  }),
  contact: z
    .object({
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
    })
    .optional(),
  social: z.record(z.string().url()).optional(),
  font: z
    .object({
      body: fontCode.optional(),
      heading: fontCode.optional(),
    })
    .optional(),
});

export type SaveBrandInput = z.infer<typeof saveBrandSchema>;

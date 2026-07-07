import { z } from 'zod';
import { SERVICE_ICON_CODES } from '../constants/service-icons';

// Home document (superadmin plan 04 §3 + §6 v1.1). The editor enforces the
// required core fields; the v1.1 section-copy groups are validator-free there
// and may arrive partially blank — so their fields accept empty strings, and
// all-blank groups simply never arrive (the editor omits them on save).
// z.object strips unknown keys, which also silently drops the `logoUrl` echo
// on manufacturers (materialized on read, never stored).

const sectionContentSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string(),
});

const badgeSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  unit: z.string().optional(),
});

const serviceSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()),
  icon: z.enum(SERVICE_ICON_CODES).optional(),
});

const manufacturerSchema = z.object({
  name: z.string().min(1),
  logoKey: z.string().optional(),
});

// The video lands in a <video src> on the public site — http(s) only.
const heroVideoUrlSchema = z
  .string()
  .url()
  .regex(/^https?:\/\//i, 'must be an http(s) URL');

export const cmsHomeSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  hero_video_url: heroVideoUrlSchema.optional(),
  service_targets: z.array(z.string().min(1)),
  badges: z.array(badgeSchema),
  services_content: z.object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().min(1),
  }),
  services: z.array(serviceSchema),
  service_area: z.string().optional(),
  contact_cta: z
    .object({
      title: z.string(),
      description: z.string(),
    })
    .optional(),
  clients_content: sectionContentSchema
    .extend({
      cta_title: z.string().optional(),
      cta_description: z.string().optional(),
    })
    .optional(),
  manufacturers_content: sectionContentSchema.optional(),
  manufacturers: z.array(manufacturerSchema).optional(),
  location_content: sectionContentSchema
    .extend({
      schedule: z.string().optional(),
    })
    .optional(),
});

export const createCmsClientSchema = z.object({
  name: z.string().min(1),
  legal: z.string().optional(),
  sector: z.string().optional(),
  logoKey: z.string().optional(),
  businessRelationDescription: z.string().optional(),
});

export const updateCmsClientSchema = createCmsClientSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export type CmsHomeDoc = z.infer<typeof cmsHomeSchema>;
export type CreateCmsClientInput = z.infer<typeof createCmsClientSchema>;
export type UpdateCmsClientInput = z.infer<typeof updateCmsClientSchema>;

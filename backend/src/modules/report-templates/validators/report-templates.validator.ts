import { z } from 'zod';
import { Magnitude, QuestionDatatype, TemplateStatus } from '../enums/report-templates.enum';

const constraintsSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().int().positive().optional(),
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
});

// `unit` is whitelisted against the Magnitude enum and only valid on `number`
// questions (06 §5.1 rule, 2026-07-09) — anything else is a 400, never
// stored as free text.
const questionSchema = z
  .object({
    id: z.string().optional(),
    order: z.number().int().min(0).optional(),
    label: z.string().min(1),
    datatype: z.nativeEnum(QuestionDatatype),
    required: z.boolean(),
    options: z.array(z.string().min(1)).optional(),
    unit: z.nativeEnum(Magnitude).optional(),
    constraints: constraintsSchema.optional(),
  })
  .refine((q) => q.unit === undefined || q.datatype === QuestionDatatype.Number, {
    message: 'unit is only valid on number questions',
  });

const sectionSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().min(0).optional(),
  title: z.string().min(1),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  questions: z.array(questionSchema),
});

export const saveTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sections: z.array(sectionSchema).min(1),
});

export const disableTemplateSchema = z.object({
  reason: z.string().trim().min(1),
});

export const listTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  // '' (superadmin "all") collapses to undefined = no filter.
  status: z
    .nativeEnum(TemplateStatus)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;
export type DisableTemplateInput = z.infer<typeof disableTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

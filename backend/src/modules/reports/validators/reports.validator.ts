import { z } from 'zod';
import { Magnitude, QuestionDatatype } from '../../report-templates/enums/report-templates.enum';

// Structural validation only: validates the snapshot's shape (sections/answers/datatypes),
// not whether answers satisfy live template constraints. Constraint enforcement
// is a field-app form concern at fill time.
export const capturedAnswerSchema = z.object({
  questionId: z.string().uuid(),
  label: z.string().min(1), // frozen at capture
  datatype: z.nativeEnum(QuestionDatatype),
  unit: z.nativeEnum(Magnitude).optional(),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.null(),
  ]),
});

export const capturedSectionSchema = z.object({
  title: z.string().min(1),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  answers: z.array(capturedAnswerSchema),
});

export const captureSchema = z.object({
  templateId: z.string().uuid(),
  templateName: z.string().min(1), // denormalized for display
  sections: z.array(capturedSectionSchema),
});

export type CapturedAnswer = z.infer<typeof capturedAnswerSchema>;
export type CapturedSection = z.infer<typeof capturedSectionSchema>;
export type ReportCapture = z.infer<typeof captureSchema>;

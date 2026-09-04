import { z } from 'zod';
import { ReasonContext } from '../enums/movements.enum';

/** `consumption` is NOT offerable (02 §5): it is reserved for `report_binding`,
 *  which the report-materials slice emits on its own. A custom reason in that
 *  context would be selectable nowhere and would only pollute history. */
const offerableContext = z.nativeEnum(ReasonContext).refine(
  (ctx) => ctx !== ReasonContext.Consumption,
  'el contexto de consumo está reservado para el consumo en reportes',
);

export const createMovementReasonSchema = z.object({
  label: z.string().trim().min(1).max(120),
  /** The `code` is deliberately absent: it is slugged from the label
   *  server-side and collision-suffixed, because `movements.reason` FKs it and
   *  a client-chosen code would be a permanent typo. */
  appliesTo: z.array(offerableContext).min(1).max(4),
});

/** Label and activation only — `code` is immutable, `appliesTo` is what history
 *  was validated against, and there is no DELETE route at all (02 §5). */
export const updateMovementReasonSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

export type CreateMovementReasonInput = z.infer<typeof createMovementReasonSchema>;
export type UpdateMovementReasonInput = z.infer<typeof updateMovementReasonSchema>;

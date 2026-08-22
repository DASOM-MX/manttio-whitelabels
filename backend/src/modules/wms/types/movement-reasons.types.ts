import type { ReasonContext } from '../enums/movements.enum';
import type { movementReasonDefs } from '../models/movement-reason-defs.model';

export type MovementReasonRow = typeof movementReasonDefs.$inferSelect;
export type NewMovementReason = typeof movementReasonDefs.$inferInsert;

export type UpdateMovementReasonFields = Partial<Pick<MovementReasonRow, 'label' | 'active'>>;

/** `GET /movement-reasons` returns ACTIVE AND INACTIVE rows (02 §5): selects
 *  filter to the active ones themselves, and a movement made under a reason
 *  that was later retired still has to render its label in history. */
export interface MovementReasonDTO {
  id: string;
  /** Immutable, server-slugged, and what `movements.reason` actually stores. */
  code: string;
  label: string;
  /** Built-ins are fully locked — no label edit, no deactivation. */
  builtIn: boolean;
  appliesTo: ReasonContext[];
  /** The movement validators reject a blank note under this reason
   *  (00 §6 #23). */
  requiresNote: boolean;
  active: boolean;
}

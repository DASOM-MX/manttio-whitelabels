import { z } from 'zod';
import { MovementType, ReadjustmentDirection } from '../enums/movements.enum';

/** Whole integers in v1 (00 §6 #22) held in `numeric(12,3)`, normalized to a
 *  plain integer string so the column never stores `5.000` for a five. A
 *  movement of zero is not a movement, so this one is strictly positive —
 *  unlike the catalog's `minStock`. */
const movedQuantity = z.coerce
  .number()
  .int()
  .positive()
  .max(999_999_999)
  .transform((n) => String(n));

/** Physical packages riding along with a lot quantity (user 2026-08-08). Zero
 *  is legal: drawing 200 nails out of an open bag moves content and no
 *  packages. */
const pieces = z.coerce.number().int().nonnegative().max(999_999);

const serials = z
  .array(z.string().trim().min(1).max(120))
  .min(1)
  .max(200)
  // A payload that names the same serial twice would insert one unit and
  // journal two, which is a balance that never reconciles.
  .refine((list) => new Set(list).size === list.length, 'los números de serie deben ser únicos');

const materialUnitIds = z
  .array(z.string().uuid())
  .min(1)
  .max(200)
  .refine((list) => new Set(list).size === list.length, 'las unidades deben ser únicas');

const lotNumber = z.string().trim().min(1).max(80);

/** A location payload. The node is validated to belong to the warehouse in the
 *  service (`400 node_warehouse_mismatch`) — the pair is only structural here. */
const location = z.object({
  warehouseId: z.string().uuid(),
  storageNodeId: z.string().uuid().optional(),
});

const reason = z.string().trim().min(1).max(80);
const notes = z.string().trim().min(1).max(2000);

/** The payload is a union the validator cannot fully decide: which shape is
 *  legal depends on the MATERIAL's tracking mode, which is a DB read away
 *  (`409 tracking_mismatch` in the service). What it can decide is that
 *  exactly one shape was sent — `serials`, `materialUnitIds`, a lot pair, or a
 *  bare quantity — so an ambiguous body never reaches the transaction. */
type PayloadCtx = {
  quantity?: string;
  serials?: string[];
  materialUnitIds?: string[];
  lotNumber?: string;
};

const refinePayload = (value: PayloadCtx, ctx: z.RefinementCtx) => {
  const shapes = [
    value.serials !== undefined && 'serials',
    value.materialUnitIds !== undefined && 'materialUnitIds',
    value.lotNumber !== undefined && 'lotNumber',
  ].filter(Boolean);

  if (shapes.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'envía una sola forma de carga: series, unidades o lote',
    });
    return;
  }

  const wantsQuantity = shapes.length === 0 || shapes[0] === 'lotNumber';
  if (wantsQuantity && value.quantity === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quantity'],
      message: 'la cantidad es obligatoria',
    });
  }
  if (!wantsQuantity && value.quantity !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quantity'],
      message: 'las piezas serializadas se envían por serie o por unidad, no por cantidad',
    });
  }
};

/** `POST /stock/inbound` (02 §4). Serialized inbound CREATES the units, so it
 *  takes serial strings — there are no unit ids to name yet. */
export const inboundSchema = z
  .object({
    materialId: z.string().uuid(),
    to: location,
    quantity: movedQuantity.optional(),
    serials: serials.optional(),
    lotNumber: lotNumber.optional(),
    pieces: pieces.optional(),
    /** First receipt of a lot sets its expiry; a top-up of an already-dated lot
     *  ignores it (01 §3). */
    expiresAt: z.coerce.date().optional(),
    reason,
    notes: notes.optional(),
  })
  .superRefine(refinePayload);

/** `POST /stock/transfer` (02 §4). No `serials`: a transfer moves pieces that
 *  already exist, named by id. No `expiresAt` either — the destination lot row
 *  inherits the source's expiry so a split lot never disagrees with itself. */
export const transferSchema = z
  .object({
    materialId: z.string().uuid(),
    from: location,
    to: location,
    quantity: movedQuantity.optional(),
    materialUnitIds: materialUnitIds.optional(),
    lotNumber: lotNumber.optional(),
    pieces: pieces.optional(),
    reason,
    notes: notes.optional(),
  })
  .superRefine(refinePayload);

/** `POST /stock/readjust` (02 §4) — the only correction instrument, so `notes`
 *  is REQUIRED here regardless of the reason's own `requiresNote`. An
 *  adjustment nobody explained is an adjustment nobody can audit. */
export const readjustSchema = z
  .object({
    direction: z.nativeEnum(ReadjustmentDirection),
    materialId: z.string().uuid(),
    at: location,
    quantity: movedQuantity.optional(),
    /** In-direction only: restores existing units to stock. */
    materialUnitIds: materialUnitIds.optional(),
    /** In-direction only: creates units that were never received (01 §4). */
    serials: serials.optional(),
    lotNumber: lotNumber.optional(),
    pieces: pieces.optional(),
    expiresAt: z.coerce.date().optional(),
    reason,
    notes,
  })
  .superRefine(refinePayload)
  .superRefine((value, ctx) => {
    // `serials` CREATES units, so it only makes sense inbound-ward: a
    // readjustment-out removes pieces that already exist, and those are named
    // by id (`materialUnitIds`).
    if (value.serials !== undefined && value.direction !== ReadjustmentDirection.In) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serials'],
        message: 'los números de serie solo pueden registrarse en un ajuste de entrada',
      });
    }
  });

/** `GET /movements` (02 §4). Paged and newest-first; `warehouseId` matches
 *  either side of a transfer. */
export const listMovementsQuerySchema = z.object({
  materialId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  nodeId: z.string().uuid().optional(),
  reportId: z.string().trim().min(1).optional(),
  replenishmentId: z.string().uuid().optional(),
  lotNumber: lotNumber.optional(),
  type: z.nativeEnum(MovementType).optional(),
  reason: reason.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type InboundInput = z.infer<typeof inboundSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type ReadjustInput = z.infer<typeof readjustSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;

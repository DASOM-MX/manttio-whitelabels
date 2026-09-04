import { z } from 'zod';

// Replenishment-import bodies (10-wms/02 §6). The upload itself is multipart
// and is validated in the controller — everything after it is JSON.

const fieldId = z.string().trim().min(1).max(40);
const reason = z.string().trim().min(1).max(2000);

/** `sku` is required and at least one of quantity / serial / lot must be
 *  mapped, or the file describes nothing we can receive (`400 invalid_mapping`).
 *  The service additionally proves every id is a field THIS file has — the
 *  shape is checkable here, the membership is not. */
export const processImportSchema = z.object({
  mapping: z
    .object({
      sku: fieldId,
      quantity: fieldId.optional(),
      pieces: fieldId.optional(),
      serial: fieldId.optional(),
      lot: fieldId.optional(),
      expiry: fieldId.optional(),
    })
    .superRefine((mapping, ctx) => {
      if (!mapping.quantity && !mapping.serial && !mapping.lot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'map at least one of quantity, serial or lot',
        });
      }
      // Expiry belongs to a lot; on its own it has nothing to date.
      if (mapping.expiry && !mapping.lot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expiry'],
          message: 'expiry is only meaningful alongside lot',
        });
      }
      // Same for the package count: pieces are packages OF a lot.
      if (mapping.pieces && !mapping.lot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pieces'],
          message: 'pieces is only meaningful alongside lot',
        });
      }
    }),
});

/** Any staged row is editable, not just an errored one (owner 2026-07-20): the
 *  "arrived 95, not 100" correction is first-class. `null` CLEARS a field —
 *  the server re-resolves and re-validates whatever the merge produces.
 *
 *  `code` is the material code (SKU or UPC) to re-resolve by; the row stores
 *  the resolved `materialId`, never the code the sheet happened to use. */
export const updateStagedRowSchema = z.object({
  code: z.string().trim().min(1).max(60).optional(),
  quantity: z.coerce.number().int().positive().max(999_999_999).nullable().optional(),
  pieces: z.coerce.number().int().nonnegative().max(999_999).nullable().optional(),
  serial: z.string().trim().min(1).max(120).nullable().optional(),
  lot: z.string().trim().min(1).max(80).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  storageNodeId: z.string().uuid().nullable().optional(),
});

/** Removal is owner/admin and the reason is REQUIRED (owner 2026-07-20):
 *  taking a line out of a document someone else prepared is exactly the act
 *  that needs a name attached. */
export const removeStagedRowSchema = z.object({ reason });

/** Approval-stage prep, staged on the import so office can prepare fully and an
 *  admin approves later. `null` clears the notes. */
export const prepImportSchema = z.object({
  evidencePhotos: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  notes: z.string().trim().min(1).max(4000).nullable().optional(),
});

/** The comment office reads — blank is a `400`, because "rejected, no reason"
 *  is not feedback. */
export const rejectImportSchema = z.object({ comment: reason });

/** Owner-only full cancel: immediate, reasoned, and it truncates the staging. */
export const cancelImportSchema = z.object({ reason });

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ProcessImportInput = z.infer<typeof processImportSchema>;
export type UpdateStagedRowInput = z.infer<typeof updateStagedRowSchema>;
export type RemoveStagedRowInput = z.infer<typeof removeStagedRowSchema>;
export type PrepImportInput = z.infer<typeof prepImportSchema>;
export type RejectImportInput = z.infer<typeof rejectImportSchema>;
export type CancelImportInput = z.infer<typeof cancelImportSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;

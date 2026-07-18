import { z } from 'zod';
import { EquipmentStatus } from '../enums/equipment.enum';

// Free-text fields are optional; the frontend requires none but `customerId`.
export const createEquipmentSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  kind: z.string().optional(),
  capacity: z.string().optional(),
  location: z.string().optional(),
  // `date` column — a plain 'YYYY-MM-DD' string.
  installDate: z.string().optional(),
  installedByUs: z.boolean().default(false),
  notes: z.string().optional(),
});

// PATCH: any create field plus the retire/reactivate status transition.
export const updateEquipmentSchema = createEquipmentSchema
  .partial()
  .extend({ status: z.nativeEnum(EquipmentStatus).optional() });

export const listEquipmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(EquipmentStatus).optional(),
});

// Soft delete carries an audit comment (reserved for created-by-mistake rows).
// (Retro-link needs no body — the link is PUT /:id/reports/:reportId, both ids
// in the path.)
export const deleteEquipmentSchema = z.object({ deleteComment: z.string().min(1) });

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
export type ListEquipmentQuery = z.infer<typeof listEquipmentQuerySchema>;
export type DeleteEquipmentInput = z.infer<typeof deleteEquipmentSchema>;

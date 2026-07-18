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

// Retro-link a report to equipment (11 §2): PUT /:id/reports with the report id
// in the body (the equipment id is the path). `reportId` is the folio-style text id.
export const linkReportSchema = z.object({ reportId: z.string().min(1) });

// Soft delete carries an audit comment (reserved for created-by-mistake rows).
export const deleteEquipmentSchema = z.object({ deleteComment: z.string().min(1) });

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
export type ListEquipmentQuery = z.infer<typeof listEquipmentQuerySchema>;
export type LinkReportInput = z.infer<typeof linkReportSchema>;
export type DeleteEquipmentInput = z.infer<typeof deleteEquipmentSchema>;

import { z } from 'zod';
import {
  ReportStatus,
  workTypes,
  type WorkType,
} from '../enums/reports.enum';

// Narrow the inferred types (zod's tuple signature loses literals through a bare cast).
const workTypeEnum = z.enum(workTypes as unknown as [WorkType, ...WorkType[]]);

// Multipart text fields (files are read separately via formData.getAll('pictures') etc.)
// Geo fields arrive as strings — coerce to number and bound to valid WGS84 ranges.
const latitudeField = z.coerce.number().min(-90).max(90);
const longitudeField = z.coerce.number().min(-180).max(180);
const accuracyField = z.coerce.number().nonnegative();

export const createReportMetaSchema = z.object({
  template_id: z.string().uuid(),
  work_type: workTypeEnum.optional(),
  client_id: z.string().uuid(),
  date_arrival: z.string().datetime().optional(),
  date_departure: z.string().datetime().optional(),
  assigned_to: z.string().uuid().optional(),
  // Original creator for reports captured offline and synced later (possibly under a
  // different logged-in user). Defaults to the authenticated uploader when omitted.
  created_by: z.string().uuid().optional(),
  signed_by: z.string().optional(),
  signed_latitude: latitudeField.optional(),
  signed_longitude: longitudeField.optional(),
  signed_accuracy: accuracyField.optional(),
});

export const patchReportSchema = z
  .object({
    work_type: workTypeEnum.optional(),
    date_arrival: z.string().datetime().optional(),
    date_departure: z.string().datetime().optional(),
    client_id: z.string().uuid().optional(),
    data: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export const assignReportSchema = z.object({
  assigned_to: z.string().uuid(),
});

export const signReportSchema = z.object({
  signed_by: z.string().min(1),
  signed_latitude: latitudeField,
  signed_longitude: longitudeField,
  signed_accuracy: accuracyField.optional(),
});

export const removePicturesSchema = z.object({
  urls: z.array(z.string().url()).min(1),
});

export const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.nativeEnum(ReportStatus).optional(),
  client_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  template_id: z.string().uuid().optional(),
  work_type: workTypeEnum.optional(),
  state: z.string().min(1).optional(),
  // Folio (report id) prefix match — e.g. `R-20260503` returns all of that day, `R-20260503-0001` returns one.
  folio: z.string().min(1).optional(),
  // Date range against `date_arrival`. Either bound is optional.
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  // Search across report id (folio), customer name, technician name
  search: z.string().min(1).optional(),
});

export type CreateReportMeta = z.infer<typeof createReportMetaSchema>;
export type PatchReportInput = z.infer<typeof patchReportSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
export type SignReportInput = z.infer<typeof signReportSchema>;

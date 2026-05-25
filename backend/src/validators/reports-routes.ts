import { z } from 'zod';
import { reportTypes, workTypes, type WorkType } from './reports';
import { REPORT_STATUSES } from '../lib/report-lifecycle';

// Narrow the inferred type to WorkType (zod's tuple signature loses literals through a bare cast).
const workTypeEnum = z.enum(workTypes as unknown as [WorkType, ...WorkType[]]);

// Multipart text fields (files are read separately via formData.getAll('pictures') etc.)
// Geo fields arrive as strings — coerce to number and bound to valid WGS84 ranges.
const latitudeField = z.coerce.number().min(-90).max(90);
const longitudeField = z.coerce.number().min(-180).max(180);
const accuracyField = z.coerce.number().nonnegative();

export const createReportMetaSchema = z.object({
  report_type: z.enum(reportTypes as [string, ...string[]]),
  work_type: workTypeEnum.optional(),
  client_id: z.string().uuid(),
  date_arrival: z.string().datetime().optional(),
  date_departure: z.string().datetime().optional(),
  assigned_to: z.string().uuid().optional(),
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
  status: z.enum(REPORT_STATUSES as readonly [string, ...string[]]).optional(),
  client_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  work_type: workTypeEnum.optional(),
  state: z.string().min(1).optional(),
  // Folio (report id) prefix match — e.g. `R-20260503` returns all of that day, `R-20260503-0001` returns one.
  folio: z.string().min(1).optional(),
  // Date range against `date_arrival`. Either bound is optional.
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

export type CreateReportMeta = z.infer<typeof createReportMetaSchema>;
export type PatchReportInput = z.infer<typeof patchReportSchema>;

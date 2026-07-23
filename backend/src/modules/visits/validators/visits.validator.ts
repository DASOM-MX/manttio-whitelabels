import { z } from 'zod';
import { VisitStatus } from '../enums/visits.enum';

// The calendar loads by visible range — `from`/`to` are required so the list
// stays range-bounded (12-calendar §5); `from` inclusive, `to` exclusive.
export const listVisitsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  technicianId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(VisitStatus).optional(),
});

export const createVisitSchema = z.object({
  customerId: z.string().uuid(),
  technicianId: z.string().uuid().nullable().optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
});

// technicianId is deliberately absent — reassignment only via POST /:id/assign;
// status only via POST /:id/status. Nullable fields clear with an explicit null.
export const updateVisitSchema = z
  .object({
    customerId: z.string().uuid(),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime().nullable(),
    title: z.string().min(1).nullable(),
    notes: z.string().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'no fields to update' });

export const assignVisitSchema = z.object({
  // null = move to the unassigned backlog lane.
  technicianId: z.string().uuid().nullable(),
});

// `rescheduled` is unreachable here — it is only produced by the reschedule
// transaction. `reason` is optional context on cancel/missed, ignored on
// complete/reopen (the service clears it on reopen).
export const changeVisitStatusSchema = z.object({
  status: z.enum([
    VisitStatus.Scheduled,
    VisitStatus.Completed,
    VisitStatus.Cancelled,
    VisitStatus.Missed,
  ]),
  reason: z.string().min(1).optional(),
});

// Could-not-serve reschedule (12 §1): closes the original (reason required) and
// opens a fresh scheduled record. technicianId omitted = inherit the original's.
export const rescheduleVisitSchema = z.object({
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  technicianId: z.string().uuid().nullable().optional(),
  reason: z.string().min(1),
});

export type ListVisitsQuery = z.infer<typeof listVisitsQuerySchema>;
export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;
export type AssignVisitInput = z.infer<typeof assignVisitSchema>;
export type ChangeVisitStatusInput = z.infer<typeof changeVisitStatusSchema>;
export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;

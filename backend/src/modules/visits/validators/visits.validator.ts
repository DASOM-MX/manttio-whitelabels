import { z } from 'zod';
import { VisitCloseReason, VisitStatus } from '../enums/visits.enum';

// Every datetime crosses the wire as an ISO-8601 string and becomes a `Date`
// here, so no service or repository ever parses one itself.
const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));

// `technicianId=unassigned` is the backlog lane — the calendar's "show me what
// nobody is on yet" toggle. Modeled as a sentinel on the one field rather than a
// separate `unassigned` boolean: two fields would let a caller ask for both a
// specific technician *and* nobody, and there is no sane answer to that.
const UNASSIGNED = 'unassigned' as const;
const technicianFilter = z.union([z.string().uuid(), z.literal(UNASSIGNED)]);

// `from`/`to` are **required**: the calendar always reads a bounded window
// (12 §5) and an unbounded visits scan has no legitimate caller.
export const listVisitsQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    technicianId: technicianFilter.optional(),
    customerId: z.string().uuid().optional(),
    status: z.nativeEnum(VisitStatus).optional(),
  })
  .refine((q) => q.to >= q.from, {
    message: 'to must be at or after from',
    path: ['to'],
  });

// An end before its start is the one scheduling error worth rejecting outright;
// everything else about *when* is the office's business.
const endAfterStart = (v: { scheduledStart: Date; scheduledEnd?: Date }) =>
  !v.scheduledEnd || v.scheduledEnd > v.scheduledStart;
const endAfterStartMessage = {
  message: 'scheduledEnd must be after scheduledStart',
  path: ['scheduledEnd'],
};

export const createVisitSchema = z
  .object({
    customerId: z.string().uuid(),
    // Optional until the service-orders module is finished; the plan's end
    // state makes it required and drops `customerId` in favour of deriving the
    // client from the order (12 §4, 2026-07-23 amendment). Until then both are
    // accepted and the service rejects a pair that disagrees — an order and a
    // client that don't match is a mis-scheduled job, not a preference.
    serviceOrderId: z.string().uuid().optional(),
    // Omitted = unassigned. The calendar shows it in the backlog lane until
    // someone takes it.
    technicianId: z.string().uuid().optional(),
    // The client's units this visit covers. Validated against the customer in
    // the service layer — a unit from another client is a 409, not a 400.
    equipmentIds: z.array(z.string().uuid()).optional(),
    scheduledStart: isoDate,
    scheduledEnd: isoDate.optional(),
    title: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
  })
  .refine(endAfterStart, endAfterStartMessage);

// Correction of an **open** visit (12 §4) — scheduling fields only. There is
// deliberately no `technicianId` (that is `/assign`), no `status`, no
// `customerId` and no `equipmentIds`: a visit's *what* and *who for* are fixed
// at creation, and changing them is a close + reschedule.
//
// `scheduledEnd` accepts an explicit `null` to clear a previously set end time;
// omitting the key leaves it untouched. Start/end coherence can't be checked
// here (the other half may be unchanged and live in the DB) — the service
// re-validates against the merged row.
export const correctVisitSchema = z
  .object({
    scheduledStart: isoDate.optional(),
    scheduledEnd: isoDate.nullable().optional(),
    title: z.string().trim().min(1).nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no correctable fields supplied' });

// `null` unassigns — putting a visit back in the backlog lane is a legitimate
// reassignment, not a special case.
export const assignVisitSchema = z.object({
  technicianId: z.string().uuid().nullable(),
});

// The report is optional: staff may mark a visit served without one, and the
// field app may link it afterwards. When present it is a report folio (`text`
// PK), not a uuid.
export const respondVisitSchema = z.object({
  reportId: z.string().trim().min(1).optional(),
});

// Category required, note optional — except on `other`, where a bare category
// would tell the client handoff nothing. That escape hatch has to carry its
// own explanation.
export const closeVisitSchema = z
  .object({
    reason: z.nativeEnum(VisitCloseReason),
    note: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.reason !== VisitCloseReason.Other || !!v.note, {
    message: 'note is required when reason is "other"',
    path: ['note'],
  });

// The successor of a closed visit. `technicianId` omitted = inherit the closed
// visit's assignee (the common case: same tech, new date); explicit `null`
// sends it back to the backlog.
export const rescheduleVisitSchema = z
  .object({
    scheduledStart: isoDate,
    scheduledEnd: isoDate.optional(),
    technicianId: z.string().uuid().nullable().optional(),
  })
  .refine(endAfterStart, endAfterStartMessage);

export type ListVisitsQuery = z.infer<typeof listVisitsQuerySchema>;
export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type CorrectVisitInput = z.infer<typeof correctVisitSchema>;
export type AssignVisitInput = z.infer<typeof assignVisitSchema>;
export type RespondVisitInput = z.infer<typeof respondVisitSchema>;
export type CloseVisitInput = z.infer<typeof closeVisitSchema>;
export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;

export { UNASSIGNED };

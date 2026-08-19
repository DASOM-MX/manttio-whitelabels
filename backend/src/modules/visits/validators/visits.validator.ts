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

// The code filter reaches the repository as a `LIKE '<term>%'` pattern, so the
// term is confined to the alphabet a code is actually made of. That is not
// cosmetic: `%` and `_` are LIKE wildcards, and without this a caller could send
// `internalCode=%` and get **every visit in the database**, unpaginated —
// walking straight through the "no unbounded scan" rule the filter below is half
// of. The upper-casing lets the repository use case-sensitive `LIKE`, which is
// the only form that gets a prefix seek out of the unique index.
//
// Capped at the length of a whole code: a prefix can never be longer than the
// thing it is a prefix of.
const VISIT_CODE_MAX_LENGTH = 'V-YYYYMMDD-NNNN'.length;
const internalCodePrefix = z
  .string()
  .trim()
  .min(1)
  .max(VISIT_CODE_MAX_LENGTH)
  .regex(/^[A-Za-z0-9-]+$/, 'internalCode may only contain letters, digits and hyphens')
  .transform((s) => s.toUpperCase());

// The read is always narrowed by **either** a bounded window (the calendar's
// viewport, 12 §5) **or** an `internalCode` prefix (owner 2026-08-02). One of
// the two is required: an unbounded visits scan still has no legitimate caller,
// but "paste a code and find the visit" is one — and it cannot be made to work
// if the caller has to already know which week the visit is in.
export const listVisitsQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    internalCode: internalCodePrefix.optional(),
    technicianId: technicianFilter.optional(),
    customerId: z.string().uuid().optional(),
    status: z.nativeEnum(VisitStatus).optional(),
  })
  .refine((q) => (q.from && q.to) || q.internalCode, {
    message: 'supply either from+to or internalCode',
    path: ['from'],
  })
  .refine((q) => !q.from || !q.to || q.to >= q.from, {
    message: 'to must be at or after from',
    path: ['to'],
  });

// The planned length (12 §1, owner 2026-07-31). Required with a 60-minute
// default: the calendar draws a visit as a block and a block needs a height, so
// a booking made without thinking about duration is an hour long — not
// undefined. Bounded at 24h because a longer "visit" is a multi-day job, which
// is several visits on one order, not one enormous block.
//
// `scheduledEnd` is deliberately **not** an input anywhere: the service derives
// it from start + duration on every write, which is the only way the two can
// never disagree. That supersedes the `scheduledEnd?` still listed for
// create/reschedule in 12 §5.
const MAX_EXPECTED_DURATION_MINUTES = 24 * 60;
const expectedDurationMinutes = z
  .number()
  .int()
  .positive()
  .max(MAX_EXPECTED_DURATION_MINUTES);

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
    expectedDurationMinutes: expectedDurationMinutes.default(60),
    title: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
  });

// Correction of a **scheduled** visit (12 §4) — scheduling fields plus the
// equipment links (owner 2026-08-06: office refining the unit list on a planned
// job is a correction, not a new scope). There is deliberately no
// `technicianId` (that is `/assign`), no `status` and no `customerId`: a
// visit's *who for* is fixed at creation, and changing it is a close +
// reschedule.
//
// `equipmentIds` is the **full replacement set**, same semantics as create —
// ownership is validated against the visit's customer in the service layer.
//
// Only reachable while `scheduled`: once a technician has tapped Iniciar the
// visit is `in_progress` and moving the date of a job being physically performed
// is nonsense (owner 2026-07-31) — the service 409s.
export const correctVisitSchema = z
  .object({
    scheduledStart: isoDate.optional(),
    expectedDurationMinutes: expectedDurationMinutes.optional(),
    title: z.string().trim().min(1).nullable().optional(),
    notes: z.string().nullable().optional(),
    equipmentIds: z.array(z.string().uuid()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no correctable fields supplied' });

// `null` unassigns — putting a visit back in the backlog lane is a legitimate
// reassignment, not a special case.
export const assignVisitSchema = z.object({
  technicianId: z.string().uuid().nullable(),
});

// Iniciar (12 §5, owner 2026-07-31) — the field app's "I'm starting". The
// timestamp is **client-supplied**, not `now()`: the field app queues this in
// IndexedDB and syncs on reconnect, so a technician who starts at 09:15 in a
// basement must not record 11:40 when the truck regains signal. Same trusted-
// field posture as `created_by` on synced offline reports — validated against
// the visit's own history in the service, then believed.
export const startVisitSchema = z.object({
  actualStart: isoDate,
});

// Terminar (12 §5). Both fields optional, for different reasons: the report
// because staff may mark a visit served without one and the field app may link
// it afterwards; `actualEnd` because office completing a visit from the admin
// has no tap to report, and inventing one would fabricate billing data.
// When present it is a report folio (`text` PK), not a uuid.
export const respondVisitSchema = z.object({
  actualEnd: isoDate.optional(),
  reportId: z.string().trim().min(1).optional(),
});

// Correcting the actuals on a terminal visit (12 §2, owner/admin only). This is
// the one edit that reaches past a terminal state, and it exists because a
// mis-tapped Iniciar would otherwise bill wrong forever. Neither field is
// nullable: this endpoint fixes a stamp, it does not erase one.
export const correctActualsSchema = z
  .object({
    actualStart: isoDate.optional(),
    actualEnd: isoDate.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no actual times supplied' });

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
// sends it back to the backlog. `expectedDurationMinutes` omitted likewise
// inherits — the same job on a new date takes the same time unless told
// otherwise.
export const rescheduleVisitSchema = z.object({
  scheduledStart: isoDate,
  expectedDurationMinutes: expectedDurationMinutes.optional(),
  technicianId: z.string().uuid().nullable().optional(),
});

export type ListVisitsQuery = z.infer<typeof listVisitsQuerySchema>;
export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type CorrectVisitInput = z.infer<typeof correctVisitSchema>;
export type AssignVisitInput = z.infer<typeof assignVisitSchema>;
export type StartVisitInput = z.infer<typeof startVisitSchema>;
export type RespondVisitInput = z.infer<typeof respondVisitSchema>;
export type CorrectActualsInput = z.infer<typeof correctActualsSchema>;
export type CloseVisitInput = z.infer<typeof closeVisitSchema>;
export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;

export { UNASSIGNED };

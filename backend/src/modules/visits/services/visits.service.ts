import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import { VisitStatus } from '../enums/visits.enum';
import { canTransitionVisitStatus } from '../utils/visit-status';
import {
  InvalidVisitStatusTransitionError,
  InvalidVisitWindowError,
  TechSwapNotAllowedError,
  VisitNotReassignableError,
  VisitNotReschedulableError,
} from '../http-errors/visits.error';
import {
  findVisitById,
  findVisitWithNames,
  insertVisit,
  listVisitEvents,
  listVisits,
  reassignVisit,
  rescheduleVisit,
  updateVisit,
  updateVisitStatus,
} from '../repository/visits.repository';
import type {
  AssignVisitInput,
  ChangeVisitStatusInput,
  CreateVisitInput,
  ListVisitsQuery,
  RescheduleVisitInput,
  UpdateVisitInput,
} from '../validators/visits.validator';
import type {
  RescheduleResult,
  UpdateVisitFields,
  VisitChanges,
  VisitRow,
  VisitWithHistory,
  VisitWithNames,
} from '../types/visits.types';

const assertWindow = (start: Date, end: Date | null): void => {
  if (end && end <= start) throw new InvalidVisitWindowError();
};

export const getVisits = async (db: Db, q: ListVisitsQuery): Promise<VisitWithNames[]> =>
  listVisits(db, {
    from: new Date(q.from),
    to: new Date(q.to),
    technicianId: q.technicianId,
    customerId: q.customerId,
    status: q.status,
  });

export const getVisitById = async (db: Db, id: string): Promise<VisitWithHistory | null> => {
  const visit = await findVisitWithNames(db, id);
  if (!visit) return null;
  return { ...visit, events: await listVisitEvents(db, id) };
};

export const createVisit = async (
  db: Db,
  input: CreateVisitInput,
  actorId: string,
): Promise<VisitRow> => {
  const scheduledStart = new Date(input.scheduledStart);
  const scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
  assertWindow(scheduledStart, scheduledEnd);
  return insertVisit(db, {
    customerId: input.customerId,
    technicianId: input.technicianId ?? null,
    scheduledStart,
    scheduledEnd,
    title: input.title?.trim() || null,
    notes: input.notes?.trim() || null,
    createdBy: actorId,
  });
};

export const editVisit = async (
  db: Db,
  id: string,
  input: UpdateVisitInput,
  actorId: string,
): Promise<VisitRow | null> => {
  const current = await findVisitById(db, id);
  if (!current) return null;
  const fields: UpdateVisitFields = {};
  const changes: VisitChanges = {};

  if (input.customerId !== undefined && input.customerId !== current.customerId) {
    fields.customerId = input.customerId;
    changes.customerId = { from: current.customerId, to: input.customerId };
  }
  if (input.scheduledStart !== undefined) {
    const next = new Date(input.scheduledStart);
    if (next.getTime() !== current.scheduledStart.getTime()) {
      fields.scheduledStart = next;
      changes.scheduledStart = {
        from: current.scheduledStart.toISOString(),
        to: next.toISOString(),
      };
    }
  }
  if (input.scheduledEnd !== undefined) {
    const next = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
    const currentMs = current.scheduledEnd ? current.scheduledEnd.getTime() : null;
    const nextMs = next ? next.getTime() : null;
    if (nextMs !== currentMs) {
      fields.scheduledEnd = next;
      changes.scheduledEnd = {
        from: current.scheduledEnd ? current.scheduledEnd.toISOString() : null,
        to: next ? next.toISOString() : null,
      };
    }
  }
  if (input.title !== undefined) {
    const next = input.title?.trim() || null;
    if (next !== current.title) {
      fields.title = next;
      changes.title = { from: current.title, to: next };
    }
  }
  if (input.notes !== undefined) {
    const next = input.notes?.trim() || null;
    if (next !== current.notes) {
      fields.notes = next;
      changes.notes = { from: current.notes, to: next };
    }
  }

  // Nothing actually changed — no update, no audit noise.
  if (Object.keys(fields).length === 0) return current;

  // Validate the merged window, not just the patched fields.
  assertWindow(
    fields.scheduledStart ?? current.scheduledStart,
    fields.scheduledEnd !== undefined ? fields.scheduledEnd : current.scheduledEnd,
  );
  return updateVisit(db, id, fields, changes, actorId);
};

export const assignVisit = async (
  db: Db,
  id: string,
  input: AssignVisitInput,
  actor: AuthUser,
): Promise<VisitRow | null> => {
  const current = await findVisitById(db, id);
  if (!current) return null;
  // Tech swap rule (12-calendar §2a): a technician may only hand off a visit
  // currently assigned to them — never pull from colleagues.
  if (actor.role === 'technician' && current.technicianId !== actor.id) {
    throw new TechSwapNotAllowedError();
  }
  if (current.status !== VisitStatus.Scheduled) {
    throw new VisitNotReassignableError(current.status);
  }
  // Same target — no-op, keep the audit trail free of noise.
  if (current.technicianId === input.technicianId) return current;
  return reassignVisit(db, id, current.technicianId, input.technicianId, actor.id);
};

export const changeVisitStatus = async (
  db: Db,
  id: string,
  input: ChangeVisitStatusInput,
  actorId: string,
): Promise<VisitRow | null> => {
  const current = await findVisitById(db, id);
  if (!current) return null;
  // Idempotent on a repeat submit of the same status (double-click), no 409.
  if (current.status === input.status) return current;
  if (!canTransitionVisitStatus(current.status, input.status)) {
    throw new InvalidVisitStatusTransitionError(current.status, input.status);
  }
  // Reopening clears the closing reason; cancel/missed keep the optional context.
  const reason = input.status === VisitStatus.Scheduled ? null : input.reason ?? null;
  return updateVisitStatus(db, id, current.status, input.status, reason, actorId);
};

export const rescheduleVisitService = async (
  db: Db,
  id: string,
  input: RescheduleVisitInput,
  actorId: string,
): Promise<RescheduleResult | null> => {
  const current = await findVisitById(db, id);
  if (!current) return null;
  // Only a live scheduled visit can be rescheduled — closed/rescheduled ones are done.
  if (current.status !== VisitStatus.Scheduled) {
    throw new VisitNotReschedulableError(current.status);
  }
  const scheduledStart = new Date(input.scheduledStart);
  const scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
  assertWindow(scheduledStart, scheduledEnd);
  return rescheduleVisit(db, current, {
    scheduledStart,
    scheduledEnd,
    // Omitted technicianId inherits the original's assignee; explicit null unassigns.
    technicianId: input.technicianId === undefined ? current.technicianId : input.technicianId,
    reason: input.reason,
    actorId,
  });
};

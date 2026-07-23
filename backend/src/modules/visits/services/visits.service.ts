import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import { VisitStatus } from '../enums/visits.enum';
import { canTransitionVisitStatus } from '../utils/visit-status';
import {
  InvalidVisitStatusTransitionError,
  InvalidVisitWindowError,
  TechSwapNotAllowedError,
  VisitNotReassignableError,
} from '../http-errors/visits.error';
import {
  findVisitById,
  findVisitWithNames,
  insertVisit,
  listVisitAssignments,
  listVisits,
  reassignVisit,
  updateVisit,
  updateVisitStatus,
} from '../repository/visits.repository';
import type {
  AssignVisitInput,
  ChangeVisitStatusInput,
  CreateVisitInput,
  ListVisitsQuery,
  UpdateVisitInput,
} from '../validators/visits.validator';
import type {
  UpdateVisitFields,
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
  return { ...visit, assignmentHistory: await listVisitAssignments(db, id) };
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
): Promise<VisitRow | null> => {
  const current = await findVisitById(db, id);
  if (!current) return null;
  const fields: UpdateVisitFields = {};
  if (input.customerId !== undefined) fields.customerId = input.customerId;
  if (input.scheduledStart !== undefined) fields.scheduledStart = new Date(input.scheduledStart);
  if (input.scheduledEnd !== undefined) {
    fields.scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
  }
  if (input.title !== undefined) fields.title = input.title?.trim() || null;
  if (input.notes !== undefined) fields.notes = input.notes?.trim() || null;
  // Validate the merged window, not just the patched fields.
  assertWindow(
    fields.scheduledStart ?? current.scheduledStart,
    fields.scheduledEnd !== undefined ? fields.scheduledEnd : current.scheduledEnd,
  );
  return updateVisit(db, id, fields);
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
): Promise<VisitRow | null> => {
  const current = await findVisitById(db, id);
  if (!current) return null;
  if (current.status === input.status) return current;
  if (!canTransitionVisitStatus(current.status, input.status)) {
    throw new InvalidVisitStatusTransitionError(current.status, input.status);
  }
  return updateVisitStatus(db, id, input.status);
};

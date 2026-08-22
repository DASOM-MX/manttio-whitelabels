import type { Db } from '../../database/client';
import { findCustomerById, updateCustomerWithRelations } from '../repository/customers.repository';
import {
  insertInteraction,
  listInteractions,
  listRecentInteractions,
} from '../repository/interactions.repository';
import { isLegalTransition } from '../utils/customer-status';
import { CUSTOMER_STATUS_LABELS } from '../constants/customer-status';
import { INTERACTION_MEDIUM_PHRASES } from '../constants/interaction-mediums';
import { InteractionRefKind } from '../enums/interactions.enum';
import { CustomerStatus } from '../enums/customers.enum';
import {
  BlacklistReasonRequiredError,
  InvalidStatusTransitionError,
} from '../http-errors/status-change.error';
import { notifyBestEffort } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notifications.enum';
import type { CustomerWithRelations, UpdateCustomerFields } from '../types/customers.types';
import type { InteractionDTO, RecentInteractionDTO } from '../types/interactions.types';
import type { AddInteractionInput, ChangeStatusInput } from '../validators/interactions.validator';

export const getInteractions = async (
  db: Db,
  customerId: string,
  page: number,
  limit: number,
  ref: { refKind?: InteractionRefKind; refId?: string } = {},
): Promise<{ items: InteractionDTO[]; total: number }> =>
  listInteractions(db, customerId, page, limit, ref);

/** Tenant-wide latest activity (utm-params 03 — owner/admin dashboard feed). */
export const getRecentInteractions = async (
  db: Db,
  limit: number,
): Promise<RecentInteractionDTO[]> => listRecentInteractions(db, limit);

/** Log a manual touch (08 §2). Returns null when the customer is missing/deleted
 *  so the controller can 404 instead of orphaning a row. */
export const addInteraction = async (
  db: Db,
  customerId: string,
  input: AddInteractionInput,
  actorId: string,
): Promise<InteractionDTO | null> => {
  const customer = await findCustomerById(db, customerId);
  if (!customer || customer.deletedAt) return null;
  const entry = await insertInteraction(db, {
    customerId,
    type: input.type,
    body: input.body.trim(),
    userId: actorId,
  });
  // Owner awareness feed: owner broadcast, the acting user excluded. The
  // interaction author is already resolved on the DTO; the body names the
  // medium the touch came through (owner ask, 2026-07-21).
  const medium = INTERACTION_MEDIUM_PHRASES[input.type];
  await notifyBestEffort(db, {
    role: 'owner',
    excludeUserId: actorId,
    type: NotificationType.ClientInteractionRegistered,
    title: 'Interacción registrada',
    body: entry.userName
      ? `${entry.userName} registró ${medium} ${customer.name}.`
      : `Se registró ${medium} ${customer.name}.`,
    data: { customerId },
  });
  return entry;
};

/** Dedicated status transition (08 §1/§4): validates the legal transition and
 *  the blacklist-reason rule, then updates status (+ blacklist reason / follow-up)
 *  and emits the `system` timeline entry in the same transaction. Returns null
 *  when the customer is missing/deleted. */
export const changeCustomerStatus = async (
  db: Db,
  id: string,
  input: ChangeStatusInput,
  actorId: string,
): Promise<CustomerWithRelations | null> => {
  const current = await findCustomerById(db, id);
  if (!current || current.deletedAt) return null;

  const target = input.status;
  if (!isLegalTransition(current.status, target)) {
    throw new InvalidStatusTransitionError(current.status, target);
  }
  const reason = input.reason?.trim();
  if (target === CustomerStatus.Blacklisted && !reason) {
    throw new BlacklistReasonRequiredError();
  }

  const fields: UpdateCustomerFields = {
    status: target,
    // A legal transition is always an actual change (isLegalTransition rejects
    // no-ops), so the stamp needs no compare here.
    statusChangedAt: new Date(),
    // Keep the reason only while blacklisted; clear it on any other target.
    blacklistReason: target === CustomerStatus.Blacklisted ? (reason ?? null) : null,
  };
  if (input.nextFollowUpAt !== undefined) {
    fields.nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
  }

  const body =
    `Estado: ${CUSTOMER_STATUS_LABELS[current.status]} → ${CUSTOMER_STATUS_LABELS[target]}` +
    (reason ? ` · ${reason}` : '');

  const updated = await updateCustomerWithRelations(db, id, fields, undefined, undefined, {
    userId: actorId,
    body,
    refKind: InteractionRefKind.StatusChange,
    refId: id,
  });
  // Only the blacklist transition is a notified event (plan §1 type set) —
  // ordinary status moves stay timeline-only.
  if (updated && target === CustomerStatus.Blacklisted) {
    await notifyBestEffort(db, {
      role: 'owner',
      excludeUserId: actorId,
      type: NotificationType.ClientBlacklisted,
      title: 'Cliente en lista negra',
      body: `${updated.name} fue puesto en lista negra · ${reason}`,
      data: { customerId: id },
    });
  }
  return updated;
};

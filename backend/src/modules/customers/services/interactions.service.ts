import type { Db } from '../../database/client';
import { findCustomerById, updateCustomerWithRelations } from '../repository/customers.repository';
import { insertInteraction, listInteractions } from '../repository/interactions.repository';
import { isLegalTransition } from '../utils/customer-status';
import { CUSTOMER_STATUS_LABELS } from '../constants/customer-status';
import { InteractionRefKind } from '../enums/interactions.enum';
import { CustomerStatus } from '../enums/customers.enum';
import {
  BlacklistReasonRequiredError,
  InvalidStatusTransitionError,
} from '../http-errors/status-change.error';
import type { CustomerWithRelations, UpdateCustomerFields } from '../types/customers.types';
import type { InteractionDTO } from '../types/interactions.types';
import type { AddInteractionInput, ChangeStatusInput } from '../validators/interactions.validator';

export const getInteractions = async (
  db: Db,
  customerId: string,
  page: number,
  limit: number,
): Promise<{ items: InteractionDTO[]; total: number }> =>
  listInteractions(db, customerId, page, limit);

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
  return insertInteraction(db, {
    customerId,
    type: input.type,
    body: input.body.trim(),
    userId: actorId,
  });
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
    // Keep the reason only while blacklisted; clear it on any other target.
    blacklistReason: target === CustomerStatus.Blacklisted ? (reason ?? null) : null,
  };
  if (input.nextFollowUpAt !== undefined) {
    fields.nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
  }

  const body =
    `Estado: ${CUSTOMER_STATUS_LABELS[current.status]} → ${CUSTOMER_STATUS_LABELS[target]}` +
    (reason ? ` · ${reason}` : '');

  return updateCustomerWithRelations(db, id, fields, undefined, undefined, {
    userId: actorId,
    body,
    refKind: InteractionRefKind.StatusChange,
    refId: id,
  });
};

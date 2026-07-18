import { CustomerStatus } from '../enums/customers.enum';
import { STATUS_TRANSITIONS } from '../constants/customer-status';

/** A transition is legal only if the target is listed for the current status
 *  (08 §1). A no-op (same status) is not a transition. */
export const isLegalTransition = (from: CustomerStatus, to: CustomerStatus): boolean =>
  from !== to && (STATUS_TRANSITIONS[from]?.includes(to) ?? false);

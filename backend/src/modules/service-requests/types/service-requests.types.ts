import type { serviceRequests } from '../models/service-requests.model';
import type { serviceRequestEvents } from '../models/service-request-events.model';

export type ServiceRequestRow = typeof serviceRequests.$inferSelect;
export type NewServiceRequest = typeof serviceRequests.$inferInsert;

export type ServiceRequestEventRow = typeof serviceRequestEvents.$inferSelect;
export type NewServiceRequestEvent = typeof serviceRequestEvents.$inferInsert;

/** The event `updateServiceRequestStatus` appends alongside the status change.
 *  Derived from the insert type so a new events column can't silently drift;
 *  `serviceRequestId` and `seq` are the repository's to fill. */
export type ServiceRequestStatusEventInput = Pick<
  NewServiceRequestEvent,
  'type' | 'actorId' | 'portalUserId' | 'note' | 'changes'
>;

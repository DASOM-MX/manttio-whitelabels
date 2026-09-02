import type { serviceRequests } from '../models/service-requests.model';
import type { serviceRequestEvents } from '../models/service-request-events.model';

export type ServiceRequestRow = typeof serviceRequests.$inferSelect;
export type NewServiceRequest = typeof serviceRequests.$inferInsert;

export type ServiceRequestEventRow = typeof serviceRequestEvents.$inferSelect;
export type NewServiceRequestEvent = typeof serviceRequestEvents.$inferInsert;

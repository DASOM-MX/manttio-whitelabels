import { ServiceOrderEventType } from '../../service-orders/enums/service-orders.enum';

/** The timeline event types the visit stream (12 CP-4) forwards — every
 *  lifecycle write that moves a calendar block. The stream reads the order
 *  timeline rather than the visits table precisely so this list is the only
 *  thing that has to know what "a visit event" is. A new visit event type
 *  must be added here to reach live calendars. */
export const VISIT_STREAM_EVENT_TYPES = [
  ServiceOrderEventType.VisitCreated,
  ServiceOrderEventType.VisitReassigned,
  ServiceOrderEventType.VisitCorrected,
  ServiceOrderEventType.VisitStarted,
  ServiceOrderEventType.VisitCompleted,
  ServiceOrderEventType.VisitClosed,
  ServiceOrderEventType.VisitRescheduled,
  ServiceOrderEventType.VisitActualsCorrected,
] as const;

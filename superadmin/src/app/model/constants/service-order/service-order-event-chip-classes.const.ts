import { ServiceOrderEventType } from '../../enums/service-order/service-order-event-type.enum';

// The feed chip's color families, dark pairings included. Color groups by
// meaning, never alone (the label + icon carry it too): brand primary for the
// order's own milestones, amber for mutations, emerald for good terminals,
// red for cancellation, sky for report children, violet for visits.
const PRIMARY = 'bg-primary-100 text-primary-800 dark:bg-primary-1000/60 dark:text-primary-300';
const AMBER = 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400';
const EMERALD = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400';
const RED = 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400';
const SKY = 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400';
const VIOLET = 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400';

/** Chip color per event type (19 §7) — paired with the per-type icon and the
 *  label, so color is reinforcement, not the only signal. */
export const SERVICE_ORDER_EVENT_CHIP_CLASSES: Record<ServiceOrderEventType, string> = {
  [ServiceOrderEventType.OrderCreated]: PRIMARY,
  [ServiceOrderEventType.OrderLineAdded]: PRIMARY,
  [ServiceOrderEventType.OrderCommentUpdated]: AMBER,
  [ServiceOrderEventType.OrderLocationChanged]: AMBER,
  [ServiceOrderEventType.OrderStatusChanged]: AMBER,
  [ServiceOrderEventType.OrderCompleted]: EMERALD,
  [ServiceOrderEventType.OrderCancelled]: RED,
  [ServiceOrderEventType.OrderContractGenerated]: VIOLET,
  [ServiceOrderEventType.OrderMailed]: SKY,
  [ServiceOrderEventType.VisitCreated]: VIOLET,
  [ServiceOrderEventType.VisitReassigned]: AMBER,
  [ServiceOrderEventType.VisitCorrected]: AMBER,
  [ServiceOrderEventType.VisitCompleted]: EMERALD,
  [ServiceOrderEventType.VisitClosed]: RED,
  [ServiceOrderEventType.VisitRescheduled]: VIOLET,
  [ServiceOrderEventType.ReportExploded]: SKY,
  [ServiceOrderEventType.ReportStatusChanged]: SKY,
  [ServiceOrderEventType.ReportFinished]: EMERALD,
};

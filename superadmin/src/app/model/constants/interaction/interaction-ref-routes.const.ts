import { InteractionRefKind } from '../../enums/interaction/interaction-ref-kind.enum';

/** Where a timeline entry's `ref` points. Kinds absent here render no link:
 *  `status_change` refers back to the client you are already looking at, and
 *  `bill` has no module yet (09). */
export const INTERACTION_REF_ROUTES: Partial<Record<InteractionRefKind, string>> = {
  [InteractionRefKind.Report]: '/reports',
  [InteractionRefKind.ServiceOrder]: '/service-orders',
  [InteractionRefKind.Quotation]: '/quotations',
  [InteractionRefKind.Contract]: '/contracts',
};

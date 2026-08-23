import { InteractionRefKind } from '../../enums/interaction/interaction-ref-kind.enum';

/** Link copy for a timeline entry's outbound `ref`. Same key set as
 *  `INTERACTION_REF_ROUTES` — a kind without a route has nothing to label. */
export const INTERACTION_REF_LABELS: Partial<Record<InteractionRefKind, string>> = {
  [InteractionRefKind.Report]: 'Ver reporte',
  [InteractionRefKind.ServiceOrder]: 'Ver orden',
  [InteractionRefKind.Quotation]: 'Ver cotización',
  [InteractionRefKind.Contract]: 'Ver contrato',
};

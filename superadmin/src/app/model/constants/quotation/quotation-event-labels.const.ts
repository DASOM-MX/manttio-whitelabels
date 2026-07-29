import { QuotationEventType } from '../../enums/quotation/quotation-event-type.enum';

/** Timeline row headings (20 §5). Written from the reader's side — "La abrió el
 *  cliente", not "viewed" — because this trail is what staff show when someone
 *  asks what happened. */
export const QUOTATION_EVENT_LABELS: Record<QuotationEventType, string> = {
  [QuotationEventType.Created]: 'Cotización creada',
  [QuotationEventType.LineAdded]: 'Partida agregada',
  [QuotationEventType.Sent]: 'Enviada al contacto',
  [QuotationEventType.Viewed]: 'Abierta por el cliente',
  [QuotationEventType.ReviewerResponded]: 'Respuesta del revisor',
  [QuotationEventType.StatusDerived]: 'Cambio de estado',
  [QuotationEventType.OrderCreated]: 'Orden creada',
  [QuotationEventType.Cancelled]: 'Cancelada',
  [QuotationEventType.Deleted]: 'Eliminada',
};

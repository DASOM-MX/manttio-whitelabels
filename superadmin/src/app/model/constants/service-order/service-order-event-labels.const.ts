import type { ServiceOrderEventType } from '../../enums/service-order/service-order-event-type.enum';

/** Feed sentence per event type (19 §7). The event's `note` renders beneath as
 *  the detail line, so labels stay short. */
export const SERVICE_ORDER_EVENT_LABELS: Record<ServiceOrderEventType, string> = {
  order_created: 'Orden creada',
  order_line_added: 'Servicio agregado',
  order_comment_updated: 'Comentarios actualizados',
  order_location_changed: 'Ubicación cambiada',
  order_priority_changed: 'Prioridad cambiada',
  order_promise_changed: 'Fecha compromiso cambiada',
  order_status_changed: 'Orden reabierta',
  order_completed: 'Orden completada',
  order_cancelled: 'Orden cancelada',
  // The stored event key stays `generated` (19 §7, persisted): the copy is
  // what was wrong. The app files a signed document, it does not produce one.
  order_contract_generated: 'Contrato adjuntado',
  order_mailed: 'Historial enviado al cliente',
  visit_created: 'Visita programada',
  visit_reassigned: 'Visita reasignada',
  visit_corrected: 'Visita corregida',
  visit_completed: 'Visita completada',
  visit_closed: 'Visita cerrada',
  visit_rescheduled: 'Visita reprogramada',
  report_exploded: 'Reporte generado',
  report_status_changed: 'Estado de reporte cambiado',
  report_finished: 'Reporte terminado',
};

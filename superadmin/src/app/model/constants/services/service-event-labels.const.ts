import { ServiceEventType } from '../../enums/services/service-event-type.enum';

/** Timeline row headings (18 §6.1) — reader-side Spanish, like the quotation
 *  trail: this is what an owner reads when asking who repriced what. */
export const SERVICE_EVENT_LABELS: Record<ServiceEventType, string> = {
  [ServiceEventType.Created]: 'Servicio registrado',
  [ServiceEventType.Updated]: 'Datos actualizados',
  [ServiceEventType.Deleted]: 'Servicio eliminado',
};

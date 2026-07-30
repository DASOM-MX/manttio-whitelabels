import { ServiceCreatedVia } from '../../enums/services/service-created-via.enum';

/** Detail cell for a `service_created` row — how the service entered the
 *  catalog. Clone and import copy land with CP-5/CP-6. */
export const SERVICE_CREATED_VIA_LABELS: Record<ServiceCreatedVia, string> = {
  [ServiceCreatedVia.Form]: 'Alta manual',
  [ServiceCreatedVia.Clone]: 'Duplicado de otro servicio',
  [ServiceCreatedVia.Import]: 'Importado de archivo',
};

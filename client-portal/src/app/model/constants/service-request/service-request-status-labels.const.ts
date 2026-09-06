import { ServiceRequestStatus } from '../../enums/service-request/service-request-status.enum';

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  [ServiceRequestStatus.Submitted]: 'Enviada',
  [ServiceRequestStatus.InReview]: 'En revisión',
  [ServiceRequestStatus.NeedsInfo]: 'Requiere información',
  [ServiceRequestStatus.Approved]: 'Aprobada',
  [ServiceRequestStatus.Rejected]: 'Rechazada',
  [ServiceRequestStatus.Closed]: 'Cerrada',
  [ServiceRequestStatus.Cancelled]: 'Cancelada',
};

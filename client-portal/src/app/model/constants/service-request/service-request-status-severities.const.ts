import { ServiceRequestStatus } from '../../enums/service-request/service-request-status.enum';

export const SERVICE_REQUEST_STATUS_SEVERITIES: Record<
  ServiceRequestStatus,
  'secondary' | 'info' | 'warn' | 'success' | 'danger' | 'contrast'
> = {
  [ServiceRequestStatus.Submitted]: 'info',
  [ServiceRequestStatus.InReview]: 'info',
  [ServiceRequestStatus.NeedsInfo]: 'warn',
  [ServiceRequestStatus.Approved]: 'success',
  [ServiceRequestStatus.Rejected]: 'danger',
  [ServiceRequestStatus.Closed]: 'contrast',
  [ServiceRequestStatus.Cancelled]: 'secondary',
};

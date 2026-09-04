import { Pipe, PipeTransform } from '@angular/core';
import { SERVICE_REQUEST_STATUS_LABELS } from '../model/constants/service-request/service-request-status-labels.const';
import { SERVICE_REQUEST_STATUS_SEVERITIES } from '../model/constants/service-request/service-request-status-severities.const';
import type { ServiceRequestStatus } from '../model/enums/service-request/service-request-status.enum';

@Pipe({ name: 'serviceRequestStatusLabel' })
export class ServiceRequestStatusLabelPipe implements PipeTransform {
  transform(status: ServiceRequestStatus): string {
    return SERVICE_REQUEST_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'serviceRequestStatusSeverity' })
export class ServiceRequestStatusSeverityPipe implements PipeTransform {
  transform(
    status: ServiceRequestStatus,
  ): 'secondary' | 'info' | 'warn' | 'success' | 'danger' | 'contrast' {
    return SERVICE_REQUEST_STATUS_SEVERITIES[status];
  }
}

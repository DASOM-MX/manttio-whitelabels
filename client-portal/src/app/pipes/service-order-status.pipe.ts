import { Pipe, PipeTransform } from '@angular/core';
import { SERVICE_ORDER_STATUS_LABELS } from '../model/constants/service-order/service-order-status-labels.const';
import { SERVICE_ORDER_STATUS_SEVERITIES } from '../model/constants/service-order/service-order-status-severities.const';
import type { ServiceOrderStatus } from '../model/enums/service-order/service-order-status.enum';

/** Pure per-row status mappings (no method calls in templates). */

@Pipe({ name: 'serviceOrderStatusLabel' })
export class ServiceOrderStatusLabelPipe implements PipeTransform {
  transform(status: ServiceOrderStatus): string {
    return SERVICE_ORDER_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'serviceOrderStatusSeverity' })
export class ServiceOrderStatusSeverityPipe implements PipeTransform {
  transform(status: ServiceOrderStatus): 'info' | 'success' | 'contrast' {
    return SERVICE_ORDER_STATUS_SEVERITIES[status];
  }
}

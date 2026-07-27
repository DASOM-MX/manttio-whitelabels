import { Pipe, PipeTransform } from '@angular/core';
import { SERVICE_ORDER_STATUS_LABELS } from '../model/constants/service-order/service-order-status-labels.const';
import { SERVICE_ORDER_STATUS_SEVERITIES } from '../model/constants/service-order/service-order-status-severities.const';
import { SERVICE_ORDER_EVENT_LABELS } from '../model/constants/service-order/service-order-event-labels.const';
import { REPORT_TYPE_OPTIONS } from '../model/constants/service-order/report-type-options.const';
import type { ServiceOrderStatus } from '../model/enums/service-order/service-order-status.enum';
import type { ServiceOrderEventType } from '../model/enums/service-order/service-order-event-type.enum';

/** Pure per-row mappings (01 Angular: no method calls in templates). */

@Pipe({ name: 'serviceOrderStatusLabel' })
export class ServiceOrderStatusLabelPipe implements PipeTransform {
  transform(status: ServiceOrderStatus): string {
    return SERVICE_ORDER_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'serviceOrderStatusSeverity' })
export class ServiceOrderStatusSeverityPipe implements PipeTransform {
  transform(status: ServiceOrderStatus): 'info' | 'success' | 'danger' {
    return SERVICE_ORDER_STATUS_SEVERITIES[status];
  }
}

@Pipe({ name: 'serviceOrderEventLabel' })
export class ServiceOrderEventLabelPipe implements PipeTransform {
  transform(type: ServiceOrderEventType): string {
    return SERVICE_ORDER_EVENT_LABELS[type] ?? type;
  }
}

@Pipe({ name: 'reportTypeLabel' })
export class ReportTypeLabelPipe implements PipeTransform {
  transform(value: string): string {
    return REPORT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }
}

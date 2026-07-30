import { Pipe, PipeTransform } from '@angular/core';
import type { LucideIcon } from '@lucide/angular';
import { SERVICE_ORDER_STATUS_LABELS } from '../model/constants/service-order/service-order-status-labels.const';
import { SERVICE_ORDER_STATUS_SEVERITIES } from '../model/constants/service-order/service-order-status-severities.const';
import { SERVICE_ORDER_PRIORITY_LABELS } from '../model/constants/service-order/service-order-priority-labels.const';
import { SERVICE_ORDER_EVENT_LABELS } from '../model/constants/service-order/service-order-event-labels.const';
import { SERVICE_ORDER_EVENT_ICONS } from '../model/constants/service-order/service-order-event-icons.const';
import { SERVICE_ORDER_EVENT_CHIP_CLASSES } from '../model/constants/service-order/service-order-event-chip-classes.const';
import { REPORT_TYPE_OPTIONS } from '../model/constants/service-order/report-type-options.const';
import { ServiceOrderEventType } from '../model/enums/service-order/service-order-event-type.enum';
import type { ServiceOrderPriority } from '../model/enums/service-order/service-order-priority.enum';
import type { ServiceOrderStatus } from '../model/enums/service-order/service-order-status.enum';

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

@Pipe({ name: 'serviceOrderPriorityLabel' })
export class ServiceOrderPriorityLabelPipe implements PipeTransform {
  transform(priority: ServiceOrderPriority): string {
    return SERVICE_ORDER_PRIORITY_LABELS[priority];
  }
}

@Pipe({ name: 'serviceOrderEventLabel' })
export class ServiceOrderEventLabelPipe implements PipeTransform {
  transform(type: ServiceOrderEventType): string {
    return SERVICE_ORDER_EVENT_LABELS[type] ?? type;
  }
}

@Pipe({ name: 'serviceOrderEventIcon' })
export class ServiceOrderEventIconPipe implements PipeTransform {
  transform(type: ServiceOrderEventType): LucideIcon {
    return SERVICE_ORDER_EVENT_ICONS[type] ?? SERVICE_ORDER_EVENT_ICONS[ServiceOrderEventType.OrderCreated];
  }
}

@Pipe({ name: 'serviceOrderEventChipClass' })
export class ServiceOrderEventChipClassPipe implements PipeTransform {
  transform(type: ServiceOrderEventType): string {
    return (
      SERVICE_ORDER_EVENT_CHIP_CLASSES[type] ??
      SERVICE_ORDER_EVENT_CHIP_CLASSES[ServiceOrderEventType.OrderCreated]
    );
  }
}

@Pipe({ name: 'reportTypeLabel' })
export class ReportTypeLabelPipe implements PipeTransform {
  transform(value: string): string {
    return REPORT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }
}

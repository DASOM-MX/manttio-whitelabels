import { Pipe, PipeTransform } from '@angular/core';
import type { LucideIcon } from '@lucide/angular';
import { SERVICE_CREATED_VIA_LABELS } from '../model/constants/services/service-created-via-labels.const';
import { SERVICE_EVENT_ICONS } from '../model/constants/services/service-event-icons.const';
import { SERVICE_EVENT_LABELS } from '../model/constants/services/service-event-labels.const';
import { SERVICE_FIELD_LABELS } from '../model/constants/services/service-field-labels.const';
import { SERVICE_TAX_RATE_LABELS } from '../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_UOM_LABELS } from '../model/constants/services/service-uom-labels.const';
import { ServiceCreatedVia } from '../model/enums/services/service-created-via.enum';
import { ServiceEventType } from '../model/enums/services/service-event-type.enum';
import { MoneyPipe } from './money.pipe';
import type { ServiceEvent, ServiceTaxRate, ServiceUom } from '../data/dtos/service';

/** `changes` is `Record<string, unknown>` on the wire, so every read narrows —
 *  an event written by a newer backend must degrade to a readable fallback,
 *  never to `undefined → undefined` (the quotation-event posture). */
const isFieldChange = (value: unknown): value is { old: unknown; new: unknown } =>
  typeof value === 'object' && value !== null && 'old' in value && 'new' in value;

const MONEY_FIELDS = new Set(['price', 'cost']);
/** Old→new dumps of paragraph fields would drown the row — for these the trail
 *  says *that* they changed; the current text is one click up on the detail. */
const LONG_FIELDS = new Set(['description', 'websiteDescription', 'websiteImageKey']);

@Pipe({ name: 'serviceEventLabel' })
export class ServiceEventLabelPipe implements PipeTransform {
  transform(type: ServiceEventType): string {
    return SERVICE_EVENT_LABELS[type];
  }
}

@Pipe({ name: 'serviceEventIcon' })
export class ServiceEventIconPipe implements PipeTransform {
  transform(type: ServiceEventType): LucideIcon {
    return SERVICE_EVENT_ICONS[type];
  }
}

/** The detail cell: how the service arrived on a create, the per-field
 *  old→new list on an update, the delete comment on a delete. */
@Pipe({ name: 'serviceEventDetail' })
export class ServiceEventDetailPipe implements PipeTransform {
  private readonly money = new MoneyPipe();

  transform(event: ServiceEvent): string {
    const changes = event.changes ?? {};

    if (event.type === ServiceEventType.Created) {
      const via = changes['via'];
      return typeof via === 'string' && via in SERVICE_CREATED_VIA_LABELS
        ? SERVICE_CREATED_VIA_LABELS[via as ServiceCreatedVia]
        : '—';
    }

    if (event.type === ServiceEventType.Updated) {
      const parts = Object.entries(changes).map(([field, change]) => {
        const label = SERVICE_FIELD_LABELS[field] ?? field;
        if (!isFieldChange(change)) return label;
        if (LONG_FIELDS.has(field)) return `${label}: actualizada`;
        return `${label}: ${this.value(field, change.old)} → ${this.value(field, change.new)}`;
      });
      return parts.length ? parts.join(' · ') : '—';
    }

    return event.note ?? '—';
  }

  private value(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (MONEY_FIELDS.has(field)) return this.money.transform(String(value));
    if (field === 'uom' && typeof value === 'string' && value in SERVICE_UOM_LABELS) {
      return SERVICE_UOM_LABELS[value as ServiceUom];
    }
    if (field === 'taxRate' && typeof value === 'string' && value in SERVICE_TAX_RATE_LABELS) {
      return SERVICE_TAX_RATE_LABELS[value as ServiceTaxRate];
    }
    return String(value);
  }
}

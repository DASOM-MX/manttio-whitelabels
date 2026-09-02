import { Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { FormControl } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { PORTAL_GRANT_LABELS } from '../../../model/constants/portal-user/portal-grant-labels.const';
import { PORTAL_USER_STATUS_LABELS } from '../../../model/constants/portal-user/portal-user-status-labels.const';
import type { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import type { PortalUserStatus } from '../../../model/enums/portal-user/portal-user-status.enum';
import { CustomerSelect } from '../../../shared/components/customer-select/customer-select';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';

/** The portal-access list's filter set (26 §1) — markup, option lists and the
 *  URL param names the popover clears, in one place.
 *
 *  The controls stay owned by the page: they are what its ListQueryService
 *  reads from the URL and writes back, so this component binds them rather
 *  than declaring them (the `scale-editor` idiom). `display: contents` keeps
 *  the popover trigger a direct child of the page-header's action row. */
@Component({
  selector: 'app-portal-users-filters',
  imports: [ReactiveFormsModule, SelectModule, InputTextModule, CustomerSelect, FiltersPopover],
  templateUrl: './portal-users-filters.html',
  host: { class: 'contents' },
})
export class PortalUsersFilters {
  search = input.required<FormControl<string>>();
  status = input.required<FormControl<PortalUserStatus | ''>>();
  customer = input.required<FormControl<string>>();
  grant = input.required<FormControl<PortalGrant | ''>>();

  protected readonly params = ['q', 'status', 'customerId', 'grant'];

  protected readonly statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(PORTAL_USER_STATUS_LABELS) as [PortalUserStatus, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];
  protected readonly grantOptions = [
    { label: 'Todos los permisos', value: '' },
    ...(Object.entries(PORTAL_GRANT_LABELS) as [PortalGrant, string][]).map(([value, label]) => ({
      label,
      value,
    })),
  ];
}

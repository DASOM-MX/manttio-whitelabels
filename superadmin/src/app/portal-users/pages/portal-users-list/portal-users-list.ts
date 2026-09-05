import { Component, inject, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LucideKeyRound, LucideUserPlus } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { PortalUsersState } from '../../../../state/portal-users/portal-users.state';
import { LoadPortalUsers } from '../../../../state/portal-users/portal-users.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { tableLoading } from '../../../services/table/table-loading';
import { PORTAL_GRANT_LABELS } from '../../../model/constants/portal-user/portal-grant-labels.const';
import { PORTAL_USER_STATUS_LABELS } from '../../../model/constants/portal-user/portal-user-status-labels.const';
import { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import { PortalUserStatus } from '../../../model/enums/portal-user/portal-user-status.enum';
import { InitialsPipe } from '../../../pipes/initials.pipe';
import { PortalGrantLabelPipe } from '../../../pipes/portal-grant-label.pipe';
import { PortalInviteUnusedPipe } from '../../../pipes/portal-invite-unused.pipe';
import { PortalUserNamePipe } from '../../../pipes/portal-user-name.pipe';
import { PortalUserStatusLabelPipe } from '../../../pipes/portal-user-status-label.pipe';
import { PortalUserStatusSeverityPipe } from '../../../pipes/portal-user-status-severity.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { PortalUsersFilters } from '../../components/portal-users-filters/portal-users-filters';
import { InvitePortalUserDialog } from '../../components/invite-portal-user-dialog/invite-portal-user-dialog';
import type { PortalUserListQuery } from '../../../data/dtos/portal-user/portal-user-requests';

/** Portal access list (26 §1) — every external person who can log into the
 *  tenant's portal, across all customers, because "who has access?" and "who
 *  was invited and never came in?" are cross-customer questions.
 *
 *  "Invitar" opens the dialog (26 CP-2) — the only door into the portal, and
 *  the only place that grants it (decision 27). Rows still carry no action:
 *  the grants editor and the lifecycle actions land in CP-3/CP-4. Filters +
 *  page persist as GET query params (?q&status&customerId&grant&page) through
 *  ListQueryService (users-list is canon). */
@Component({
  selector: 'app-portal-users-list',
  imports: [
    DatePipe,
    RouterLink,
    TableModule,
    TagModule,
    InitialsPipe,
    PortalGrantLabelPipe,
    PortalInviteUnusedPipe,
    PortalUserNamePipe,
    PortalUserStatusLabelPipe,
    PortalUserStatusSeverityPipe,
    PageHeader,
    PortalUsersFilters,
    InvitePortalUserDialog,
    LucideKeyRound,
    LucideUserPlus,
  ],
  providers: [ListQueryService],
  templateUrl: './portal-users-list.html',
})
export class PortalUsersList {
  private store = inject(Store);
  protected list = inject(ListQueryService);

  protected portalUsers = select(PortalUsersState.items);
  protected total = select(PortalUsersState.total);
  protected loading = select(PortalUsersState.loading);
  protected tableBusy = tableLoading(this.loading, this.portalUsers);

  protected inviteDialog = viewChild<InvitePortalUserDialog>('inviteDialog');

  protected search = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<PortalUserStatus | ''>('', { nonNullable: true });
  protected customerFilter = new FormControl('', { nonNullable: true });
  protected grantFilter = new FormControl<PortalGrant | ''>('', { nonNullable: true });

  protected readonly skeletonColumns = [0, 1, 2, 3, 4, 5, 6, 7];

  constructor() {
    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.statusFilter.setValue(keyIn(PORTAL_USER_STATUS_LABELS, params.get('status')), {
          emitEvent: false,
        });
        this.customerFilter.setValue(params.get('customerId') ?? '', { emitEvent: false });
        this.grantFilter.setValue(keyIn(PORTAL_GRANT_LABELS, params.get('grant')), {
          emitEvent: false,
        });
      },
      write: () => ({
        q: this.search.value || null,
        status: this.statusFilter.value || null,
        customerId: this.customerFilter.value || null,
        grant: this.grantFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new LoadPortalUsers(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.statusFilter, this.customerFilter, this.grantFilter],
    });
  }

  private query(page: number): PortalUserListQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
      customerId: this.customerFilter.value || undefined,
      grant: this.grantFilter.value || undefined,
    };
  }

  protected openInvite(): void {
    this.inviteDialog()?.open();
  }

  /** No item to step back from — an invite only ever adds a row — so any
   *  non-zero count just reloads the current page (`ListQueryService.refresh`). */
  protected onInvited(): void {
    this.list.refresh(this.portalUsers().length + 1);
  }
}

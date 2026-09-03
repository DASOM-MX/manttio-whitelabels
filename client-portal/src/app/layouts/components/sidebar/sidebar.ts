import { Component, computed, inject, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { LucideChevronLeft, LucideChevronRight, LucideDynamicIcon, LucideX } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { SetSidebarCollapsed } from '../../../../state/app/app.actions';
import { AppState } from '../../../../state/app/app.state';
import { AuthState } from '../../../../state/auth/auth.state';
import { BrandState } from '../../../../state/brand/brand.state';
import { PORTAL_NAV } from '../../../model/constants/nav/portal-nav.const';

/** The nav panel (ported from superadmin's `Sidebar`, 03 CP-3, A11: drift
 *  accepted). Rendered twice — the desktop aside (drives `collapsed` from
 *  `AppState.sidebarCollapsed`) and the mobile drawer (always expanded).
 *  Collapsed = icon rail; each row reveals a label-only flyout on
 *  hover/focus. The portal nav is FLAT (00 §4) — no groups, no children — so
 *  there is no active-trail/expand-state machinery to port. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterModule, LucideDynamicIcon, LucideChevronLeft, LucideChevronRight, LucideX],
  templateUrl: './sidebar.html',
  // `relative` anchors the floating collapse handle on the panel edge.
  host: { class: 'relative flex min-h-0 flex-1 flex-col' },
})
export class Sidebar {
  private readonly store = inject(Store);

  /** Icon-rail mode (desktop aside only — the drawer leaves the default). */
  collapsed = input(false);
  /** Mobile drawer close request (the X button). */
  closed = output<void>();

  private readonly grants = select(AuthState.grants);
  private readonly brand = select(BrandState.data);
  private readonly darkMode = select(AppState.darkMode);

  /** The header's tenant identity. Waits for `/brand` to settle so the panel
   *  never flashes a fallback at a branded tenant. */
  protected readonly brandLoaded = select(BrandState.loaded);
  protected readonly brandName = computed(() => this.brand()?.name ?? 'Portal de clientes');
  protected readonly brandLogoUrl = computed(() => {
    const brand = this.brand();
    if (!brand) return undefined;
    return this.darkMode() ? (brand.logoDarkUrl ?? brand.logoUrl) : brand.logoUrl;
  });
  /** Square mark for the collapsed rail — omitted when the tenant has none. */
  protected readonly brandMarkUrl = computed(() => this.brand()?.isologoUrl);

  /** Grant-filtered rows — a section the portal user has no grant for is not
   *  rendered at all (00 §4/03 §4). Facturas carries no `grant`, so it
   *  always survives the filter alongside Inicio (00 §4b.24). */
  protected readonly navEntries = computed(() =>
    PORTAL_NAV.filter((entry) => !entry.grant || this.grants().includes(entry.grant)),
  );

  protected toggleCollapse(): void {
    this.store.dispatch(new SetSidebarCollapsed(!this.collapsed()));
  }
}

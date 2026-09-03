import { Component, computed } from '@angular/core';
import { select } from '@ngxs/store';
import { LucideLockKeyhole } from '@lucide/angular';
import { AuthState } from '../../../../state/auth/auth.state';
import { PageHeader } from '../../../shared/components/page-header/page-header';

/** `/home` — the authenticated landing page (03 CP-3). For a portal user
 *  with zero grants this is an explanatory empty state, not a dead app
 *  (00 §3 decision 7 / 03 §4). The fuller "Inicio panel" content for a
 *  granted user (summaries pulled from the read sections) is plan 04's own
 *  checkpoint — this page stays a welcome, not a dashboard. */
@Component({
  selector: 'app-home',
  imports: [PageHeader, LucideLockKeyhole],
  templateUrl: './home.html',
})
export class HomeComponent {
  protected readonly user = select(AuthState.user);
  protected readonly grants = select(AuthState.grants);

  protected readonly hasGrants = computed(() => this.grants().length > 0);
  protected readonly contactName = computed(() => this.user()?.user?.name ?? null);
  protected readonly customerName = computed(() => this.user()?.customer?.name ?? null);
  protected readonly description = computed(() => {
    const name = this.customerName();
    return name ? `Portal de ${name}` : undefined;
  });
}

import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder } from '@angular/forms';
import { map } from 'rxjs';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { select, Store } from '@ngxs/store';
import { PortalUsersState } from '../../../../state/portal-users/portal-users.state';
import { LoadPortalUser, UpdatePortalUserGrants } from '../../../../state/portal-users/portal-users.actions';
import { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import { PortalUserStatusLabelPipe } from '../../../pipes/portal-user-status-label.pipe';
import { PortalUserStatusSeverityPipe } from '../../../pipes/portal-user-status-severity.pipe';
import { errorMessage } from '../../../data/utils';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { PortalGrantsFieldset } from '../../components/portal-grants-fieldset/portal-grants-fieldset';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';

/** The standalone grants editor (26 CP-3) — a portal user's permissions and
 *  admin status, reached from a list row. `GET /portal-users/:id` is
 *  deliberately thin (26 §3's DTO comment): no customer name, no last-login
 *  — those stay on the list row (26 §1); this page is the grants/admin
 *  surface only. Lifecycle actions (resend, reset, suspend, reactivate,
 *  revoke) land in CP-4.
 *
 *  `is_admin` renders outside the grants block, exactly as read (26 §3b) —
 *  **not** an editable control here: the backend has no route to change it
 *  after invite (client-portal 02 CP-4 never shipped one, despite 01 §1
 *  calling it "editable in superadmin 26"). Flagged as a backend gap in the
 *  CP-3 report rather than invented. The no-request-grant warning still
 *  works off the real, loaded value. */
@Component({
  selector: 'app-portal-user-detail',
  imports: [
    TagModule,
    PortalUserStatusLabelPipe,
    PortalUserStatusSeverityPipe,
    PageHeader,
    PortalGrantsFieldset,
  ],
  templateUrl: './portal-user-detail.html',
})
export class PortalUserDetail implements HasPendingChanges {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected selected = select(PortalUsersState.selected);

  private userId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  protected saving = signal(false);

  /** Keyed by the grant string values themselves (26 §3 — see
   *  `PortalGrantsFieldset`), built once from the full grant list so a
   *  future ninth grant needs no touch here. */
  protected grantsForm = this.fb.nonNullable.group(
    Object.fromEntries(Object.values(PortalGrant).map((grant) => [grant, false])),
  );

  private hasCreateServiceRequests = toSignal(
    this.grantsForm.controls[PortalGrant.CreateServiceRequests].valueChanges,
    { initialValue: this.grantsForm.controls[PortalGrant.CreateServiceRequests].value },
  );

  /** §3b: an admin with no request grant sees no requests to close — warned,
   *  not blocked. Live off the form, so it shows before Guardar is even
   *  clicked, not just after. */
  protected showAdminWarning = computed(
    () => !!this.selected()?.isAdmin && !this.hasCreateServiceRequests(),
  );

  constructor() {
    effect(() => {
      const id = this.userId();
      if (!id) return;
      this.store.dispatch(new LoadPortalUser(id)).subscribe({
        error: (err) => {
          this.messages.add(
            err?.status === 404
              ? { severity: 'warn', summary: 'Usuario de portal no encontrado' }
              : {
                  severity: 'error',
                  summary: 'No se pudo cargar',
                  detail: errorMessage(err, 'Inténtalo de nuevo.'),
                },
          );
          this.router.navigate(['/portal-users']);
        },
      });
    });

    effect(() => {
      const user = this.selected();
      if (!user) return;
      const patch = Object.fromEntries(
        Object.values(PortalGrant).map((grant) => [grant, user.grants.includes(grant)]),
      );
      this.grantsForm.patchValue(patch);
      this.grantsForm.markAsPristine();
    });
  }

  hasPendingChanges(): boolean {
    return this.grantsForm.dirty && !this.saving();
  }

  protected submit(): void {
    const user = this.selected();
    if (!user || this.saving()) return;

    const raw = this.grantsForm.getRawValue();
    const grants = Object.entries(raw)
      .filter(([, checked]) => checked)
      .map(([grant]) => grant as PortalGrant);

    this.saving.set(true);
    this.store.dispatch(new UpdatePortalUserGrants(user.id, grants)).subscribe({
      next: () => {
        this.saving.set(false);
        this.grantsForm.markAsPristine();
        if (user.isAdmin && !grants.includes(PortalGrant.CreateServiceRequests)) {
          this.messages.add({
            severity: 'warn',
            summary: 'Permisos guardados',
            detail:
              'Este administrador no tiene Crear solicitudes de servicio — no verá solicitudes que cerrar.',
            life: 8000,
          });
          return;
        }
        this.messages.add({ severity: 'success', summary: 'Permisos guardados' });
      },
      error: (err) => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudieron guardar los permisos',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}

import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { TagModule } from 'primeng/tag';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  LucideKeyRound,
  LucideMailPlus,
  LucideShieldOff,
  LucideUserCheck,
  LucideUserX,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { PortalUsersState } from '../../../../state/portal-users/portal-users.state';
import {
  LoadPortalUser,
  ResetPortalUserPassword,
  ResumePortalUser,
  SuspendPortalUser,
  UpdatePortalUserGrants,
} from '../../../../state/portal-users/portal-users.actions';
import { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import { PortalUserStatusLabelPipe } from '../../../pipes/portal-user-status-label.pipe';
import { PortalUserStatusSeverityPipe } from '../../../pipes/portal-user-status-severity.pipe';
import { errorMessage } from '../../../data/utils';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { PortalGrantsFieldset } from '../../components/portal-grants-fieldset/portal-grants-fieldset';
import { RevokePortalUserAccessDialog } from '../../components/revoke-portal-user-access-dialog/revoke-portal-user-access-dialog';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';

/** The standalone grants + lifecycle page (26 CP-3/CP-4/§3b) — a portal
 *  user's permissions, admin status and account state, reached from a list
 *  row. `GET /portal-users/:id` is deliberately thin (26 §3's DTO comment):
 *  no customer name, no last-login — those stay on the list row (26 §1).
 *
 *  `is_admin` renders outside the grants block (26 §3b), in the same form
 *  and the same "Guardar" as the grants below, but visually separated by
 *  its own heading and a divider — it is a checkbox on `portal_users`, not
 *  a `portal_user_grants` row. `isAdmin` rides the same `PATCH .../grants`
 *  request (PR #215): optional with no default, so omitting it would leave
 *  the column untouched — this page always sends its current value since it
 *  always displays and edits both together. The no-request-grant warning is
 *  live off the checkbox, not the loaded value, so it reacts before Guardar
 *  is even clicked.
 *
 *  Lifecycle (26 §4): reenviar/restablecer are the same backend action
 *  (`POST /:id/password`) shown under two contexts; suspend/resume are the
 *  reversible pair, single-confirm; revoke is the permanent one, behind its
 *  own comment-required dialog in a separated "Zona crítica" section —
 *  harder to reach on purpose. No "eliminar" wording anywhere, and no temp
 *  password is ever rendered (26 §5) — a toast confirms an email went out
 *  and says nothing more. */
@Component({
  selector: 'app-portal-user-detail',
  imports: [
    ReactiveFormsModule,
    TagModule,
    CheckboxModule,
    PortalUserStatusLabelPipe,
    PortalUserStatusSeverityPipe,
    PageHeader,
    PortalGrantsFieldset,
    RevokePortalUserAccessDialog,
    LucideKeyRound,
    LucideMailPlus,
    LucideShieldOff,
    LucideUserCheck,
    LucideUserX,
  ],
  templateUrl: './portal-user-detail.html',
})
export class PortalUserDetail implements HasPendingChanges {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);

  protected selected = select(PortalUsersState.selected);

  private userId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  protected saving = signal(false);
  /** Separate from `saving` — a lifecycle action and a grants save are
   *  unrelated operations and shouldn't grey out each other's button. */
  protected lifecycleBusy = signal(false);

  protected revokeDialog = viewChild<RevokePortalUserAccessDialog>('revokeDialog');

  /** Keyed by the grant string values themselves (26 §3 — see
   *  `PortalGrantsFieldset`), built once from the full grant list so a
   *  future ninth grant needs no touch here. */
  protected grantsForm = this.fb.nonNullable.group(
    Object.fromEntries(Object.values(PortalGrant).map((grant) => [grant, false])),
  );

  /** Outside the grants block on purpose (26 §3b) — a column on
   *  `portal_users`, not a grant row. Editable since PR #215. */
  protected isAdminControl = new FormControl(false, { nonNullable: true });

  private hasCreateServiceRequests = toSignal(
    this.grantsForm.controls[PortalGrant.CreateServiceRequests].valueChanges,
    { initialValue: this.grantsForm.controls[PortalGrant.CreateServiceRequests].value },
  );

  private isAdminValue = toSignal(this.isAdminControl.valueChanges, {
    initialValue: this.isAdminControl.value,
  });

  /** §3b: an admin with no request grant sees no requests to close — warned,
   *  not blocked. Live off both controls, so it reacts to a tick in either
   *  direction before Guardar is even clicked, not just after. */
  protected showAdminWarning = computed(
    () => this.isAdminValue() && !this.hasCreateServiceRequests(),
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
      // Default emitEvent (true): `isAdminValue` above is a `valueChanges`
      // signal and must see this write, exactly like the grants form's own
      // hydration above.
      this.isAdminControl.setValue(user.isAdmin);
      this.isAdminControl.markAsPristine();
    });
  }

  hasPendingChanges(): boolean {
    return (this.grantsForm.dirty || this.isAdminControl.dirty) && !this.saving();
  }

  protected submit(): void {
    const user = this.selected();
    if (!user || this.saving()) return;

    const raw = this.grantsForm.getRawValue();
    const grants = Object.entries(raw)
      .filter(([, checked]) => checked)
      .map(([grant]) => grant as PortalGrant);
    const isAdmin = this.isAdminControl.value;

    this.saving.set(true);
    this.store.dispatch(new UpdatePortalUserGrants(user.id, grants, isAdmin)).subscribe({
      next: () => {
        this.saving.set(false);
        this.grantsForm.markAsPristine();
        this.isAdminControl.markAsPristine();
        if (isAdmin && !grants.includes(PortalGrant.CreateServiceRequests)) {
          this.messages.add({
            severity: 'warn',
            summary: 'Cambios guardados',
            detail:
              'Este administrador no tiene Crear solicitudes de servicio — no verá solicitudes que cerrar.',
            life: 8000,
          });
          return;
        }
        this.messages.add({ severity: 'success', summary: 'Cambios guardados' });
      },
      error: (err) => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudieron guardar los cambios',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  /** Only for `invited` (26 §4) — an active or suspended row gets
   *  "Restablecer contraseña" instead. Same backend call either way. */
  protected resendInvite(): void {
    const user = this.selected();
    if (!user || this.lifecycleBusy()) return;
    this.confirmation.confirm({
      header: 'Reenviar invitación',
      message: `Se generará una nueva contraseña temporal y se enviará por correo a ${user.email}. La invitación anterior deja de funcionar.`,
      acceptLabel: 'Reenviar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => this.runPasswordReset('Invitación reenviada'),
    });
  }

  protected resetPassword(): void {
    const user = this.selected();
    if (!user || this.lifecycleBusy()) return;
    this.confirmation.confirm({
      header: 'Restablecer contraseña',
      message: `Se generará una nueva contraseña temporal y se enviará por correo a ${user.email}; su contraseña actual deja de funcionar.`,
      acceptLabel: 'Restablecer',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-danger',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => this.runPasswordReset('Contraseña restablecida'),
    });
  }

  /** Same call for both rows above (`POST /:id/password`) — never a
   *  password in the response, so the toast confirms an email went out and
   *  says nothing more (26 §5). */
  private runPasswordReset(successSummary: string): void {
    const user = this.selected();
    if (!user) return;
    this.lifecycleBusy.set(true);
    this.store.dispatch(new ResetPortalUserPassword(user.id)).subscribe({
      next: () => {
        this.lifecycleBusy.set(false);
        this.messages.add({
          severity: 'success',
          summary: successSummary,
          detail: 'Se envió un correo con instrucciones.',
        });
      },
      error: (err) => {
        this.lifecycleBusy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo enviar el correo',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  /** Reversible — refuses login on the next request; the record and its
   *  history stay untouched (26 §4). */
  protected suspend(): void {
    const user = this.selected();
    if (!user || this.lifecycleBusy()) return;
    this.confirmation.confirm({
      header: 'Suspender acceso',
      message: `El acceso de ${user.name} queda bloqueado de inmediato; su contacto y su historial se conservan. Puedes reactivarlo cuando quieras.`,
      acceptLabel: 'Suspender',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-danger',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.lifecycleBusy.set(true);
        this.store.dispatch(new SuspendPortalUser(user.id)).subscribe({
          next: () => {
            this.lifecycleBusy.set(false);
            this.messages.add({ severity: 'success', summary: 'Acceso suspendido' });
          },
          error: (err) => {
            this.lifecycleBusy.set(false);
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo suspender',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            });
          },
        });
      },
    });
  }

  protected resume(): void {
    const user = this.selected();
    if (!user || this.lifecycleBusy()) return;
    this.confirmation.confirm({
      header: 'Reactivar acceso',
      message: `${user.name} podrá iniciar sesión de nuevo con sus credenciales actuales.`,
      acceptLabel: 'Reactivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.lifecycleBusy.set(true);
        this.store.dispatch(new ResumePortalUser(user.id)).subscribe({
          next: () => {
            this.lifecycleBusy.set(false);
            this.messages.add({ severity: 'success', summary: 'Acceso reactivado' });
          },
          error: (err) => {
            this.lifecycleBusy.set(false);
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo reactivar',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            });
          },
        });
      },
    });
  }

  /** The permanent one — its own dialog, its own required comment, its own
   *  section (26 §4): harder to reach than the reversible actions above on
   *  purpose. */
  protected openRevoke(): void {
    const user = this.selected();
    if (!user) return;
    this.revokeDialog()?.open(user);
  }

  /** Nothing left to edit on this page once access is revoked. */
  protected onRevoked(): void {
    this.router.navigate(['/portal-users']);
  }
}

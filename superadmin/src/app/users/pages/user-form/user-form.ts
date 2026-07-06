import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LucideArrowLeft, LucideKeyRound } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { AuthState } from '../../../../state/auth/auth.state';
import { UsersState } from '../../../../state/users/users.state';
import {
  CreateUser,
  LoadUser,
  ResetUserPassword,
  UpdateUser,
} from '../../../../state/users/users.actions';
import { canManageUser, canResetPassword } from '../../../access';
import { ROLE_LABELS } from '../../user-labels';
import { TempPasswordDialog } from '../../components/temp-password-dialog/temp-password-dialog';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { Role } from '../../../data/dtos/auth';

/** Add + edit in one page (05 §3); the route param decides. Edit mode is
 *  tabbed — the last tab is "Crítico" (danger zone: role-gated password
 *  reset). Owner protection hides forbidden edits from admins. */
@Component({
  selector: 'app-user-form',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    CheckboxModule,
    TempPasswordDialog,
    LucideArrowLeft,
    LucideKeyRound,
  ],
  templateUrl: './user-form.html',
})
export class UserForm implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);

  private me = select(AuthState.me);
  protected selected = select(UsersState.selected);
  private tempPassword = select(UsersState.tempPassword);

  protected userId: string | null = this.route.snapshot.paramMap.get('id');
  protected isEdit = !!this.userId;

  protected tab = signal<'datos' | 'critico'>('datos');
  protected busy = signal(false);
  protected tempDialog = viewChild<TempPasswordDialog>('tempDialog');
  /** Where to go after the one-time password is acknowledged. */
  private afterPasswordRoute: string | null = null;

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    role: ['technician' as Role, Validators.required],
    active: [true],
  });

  /** Admins can't grant `owner` (14 §2 note 1). */
  protected roleOptions = computed(() => {
    const actor = this.me()?.role;
    return (Object.entries(ROLE_LABELS) as [Role, string][])
      .filter(([value]) => value !== 'owner' || actor === 'owner')
      .map(([value, label]) => ({ label, value }));
  });

  /** Editing the owner as a non-owner → whole page read-only. */
  protected readOnly = computed(() => {
    const target = this.selected();
    if (!this.isEdit || !target) return false;
    return !canManageUser(this.me()?.role ?? null, target.role);
  });

  protected canReset = computed(() => {
    const target = this.selected();
    return !!target && canResetPassword(this.me()?.role ?? null, target.role);
  });

  constructor() {
    if (this.userId) this.store.dispatch(new LoadUser(this.userId));

    effect(() => {
      const user = this.selected();
      if (!user || !this.isEdit) return;
      this.form.patchValue(
        {
          name: user.name,
          email: user.email,
          phone: user.phone ?? '',
          role: user.role,
          active: user.active,
        },
        { emitEvent: false },
      );
      this.form.markAsPristine();
    });

    effect(() => {
      if (this.readOnly()) this.form.disable({ emitEvent: false });
    });
  }

  hasPendingChanges(): boolean {
    return this.form.dirty && !this.busy();
  }

  protected submit(): void {
    if (this.form.invalid || this.busy() || this.readOnly()) return;
    const raw = this.form.getRawValue();
    this.busy.set(true);

    if (this.isEdit && this.userId) {
      this.store
        .dispatch(
          new UpdateUser(this.userId, {
            name: raw.name,
            email: raw.email,
            phone: raw.phone || undefined,
            role: raw.role,
            active: raw.active,
          }),
        )
        .subscribe({
          next: () => {
            this.busy.set(false);
            this.form.markAsPristine();
            this.messages.add({ severity: 'success', summary: 'Usuario actualizado' });
            this.router.navigate(['/users']);
          },
          error: (err) => {
            this.busy.set(false);
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo actualizar',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            });
          },
        });
      return;
    }

    this.store
      .dispatch(
        new CreateUser({
          name: raw.name,
          email: raw.email,
          phone: raw.phone || undefined,
          role: raw.role,
        }),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.form.markAsPristine();
          this.messages.add({ severity: 'success', summary: 'Usuario creado' });
          const temp = this.tempPassword();
          if (temp) {
            this.afterPasswordRoute = '/users';
            this.tempDialog()?.open(temp, 'Contraseña inicial');
          } else {
            this.router.navigate(['/users']);
          }
        },
        error: (err) => {
          this.busy.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo crear',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }

  protected resetPassword(): void {
    const target = this.selected();
    if (!target || !this.canReset() || this.busy()) return;
    this.confirmation.confirm({
      header: 'Restablecer contraseña',
      message: `Se generará una contraseña temporal para ${target.name}; su contraseña actual deja de funcionar y deberá crear una nueva al entrar.`,
      acceptLabel: 'Restablecer',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-danger',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.busy.set(true);
        this.store.dispatch(new ResetUserPassword(target.id)).subscribe({
          next: () => {
            this.busy.set(false);
            const temp = this.tempPassword();
            if (temp) {
              this.afterPasswordRoute = null;
              this.tempDialog()?.open(temp, 'Contraseña temporal');
            }
          },
          error: (err) => {
            this.busy.set(false);
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo restablecer',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            });
          },
        });
      },
    });
  }

  protected onTempPasswordClosed(): void {
    if (this.afterPasswordRoute) this.router.navigate([this.afterPasswordRoute]);
  }
}

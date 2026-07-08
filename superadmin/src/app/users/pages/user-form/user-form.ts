import {
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
  type ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
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
import { ROLE_LABELS } from '../../../model/constants/user/role-labels.const';
import { GRANTABLE_ROLES } from '../../../model/constants/user/grantable-roles.const';
import { TempPasswordDialog } from '../../components/temp-password-dialog/temp-password-dialog';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { Role } from '../../../data/dtos/auth';

const TAB_ORDER = ['datos', 'critico'] as const;
type Tab = (typeof TAB_ORDER)[number];

/** Add + edit in one page (05 §3); the route param decides. Edit mode is
 *  tabbed — the last tab is "Crítico" (danger zone: role-gated password
 *  reset). Owner rows are immutable in-tenant (whitelabel-manager
 *  provisioning): the whole page goes read-only on the owner account. */
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

  /** Reactive so router-reused instances (edit → edit) rehydrate. */
  private userId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });
  protected isEdit = computed(() => !!this.userId());

  protected tab = signal<Tab>('datos');
  protected busy = signal(false);
  protected tempDialog = viewChild<TempPasswordDialog>('tempDialog');
  private tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');
  /** Where to go after the one-time password is acknowledged. */
  private afterPasswordRoute: string | null = null;

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    role: ['technician' as Role, Validators.required],
    active: [true],
  });

  /** In-tenant grantable roles only — `owner` is never offered (14 §2 note 1). */
  protected roleOptions = GRANTABLE_ROLES.map((value) => ({ label: ROLE_LABELS[value], value }));

  /** The owner account is immutable in-tenant → whole page read-only. */
  protected readOnly = computed(() => {
    const target = this.selected();
    if (!this.isEdit() || !target) return false;
    return !canManageUser(target.role);
  });

  protected canReset = computed(() => {
    const target = this.selected();
    return !!target && canResetPassword(this.me()?.role ?? null, target.role);
  });

  constructor() {
    effect(() => {
      const id = this.userId();
      if (id) {
        this.tab.set('datos');
        this.store.dispatch(new LoadUser(id)).subscribe({
          // The page is useless without the user → back to the list either
          // way (QA 2026-07-08); 404 gets the specific message.
          error: (err) => {
            this.messages.add(
              err?.status === 404
                ? { severity: 'warn', summary: 'Usuario no encontrado' }
                : {
                    severity: 'error',
                    summary: 'No se pudo cargar el usuario',
                    detail: errorMessage(err, 'Inténtalo de nuevo.'),
                  },
            );
            this.router.navigate(['/users']);
          },
        });
      }
    });

    effect(() => {
      const user = this.selected();
      if (!user || !this.isEdit()) return;
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

  /** ARIA tabs pattern: arrow keys / Home / End move + activate + focus. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const current = TAB_ORDER.indexOf(this.tab());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % TAB_ORDER.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.tab.set(TAB_ORDER[next]);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  protected submit(): void {
    if (this.form.invalid || this.busy() || this.readOnly()) return;
    const raw = this.form.getRawValue();
    this.busy.set(true);

    const id = this.userId();
    if (id) {
      this.store
        .dispatch(
          new UpdateUser(id, {
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

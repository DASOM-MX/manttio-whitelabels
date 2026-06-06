import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  Actions,
  Store,
  ofActionErrored,
  ofActionSuccessful,
  select,
} from '@ngxs/store';
import { map } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import {
  LoadCurrentUser,
  LoadUser,
  UpdateUser,
} from '../../../../state/users/users.actions';
import { UsersState } from '../../../../state/users/users.state';
import type { PublicUser, UpdateUserRequest } from '../../../data/dtos/user';
import type { UserType } from '../../../data/types/user';
import { passwordMatchValidator } from '../../../validators/password-match.validator';
import { ROLE_OPTIONS } from '../../constants/roles';

@Component({
  selector: 'app-user-edit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
  ],
  templateUrl: './user-edit.html',
  styleUrl: './user-edit.scss',
})
export class UserEdit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);
  private fb = inject(FormBuilder);

  readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  readonly roleOptions = ROLE_OPTIONS;

  private selected = select(UsersState.selected);
  private me = select(UsersState.me);

  user = computed<PublicUser | null>(() => {
    const sel = this.selected();
    return sel && sel.id === this.id() ? sel : null;
  });

  isSelf = computed(() => {
    const u = this.user();
    const me = this.me();
    return !!u && !!me && u.id === me.id;
  });

  // Hint shown when the role select is disabled because you're editing yourself.
  selfNotice = computed(() => this.isSelf());

  submitting = signal(false);

  form: FormGroup = this.fb.group(
    {
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      role: ['technician' as UserType, [Validators.required]],
      password: [''],
      confirmPassword: [''],
    },
    { validators: passwordMatchValidator },
  );

  private formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  passwordMismatch = computed(() => {
    void this.formStatus();
    return (
      this.form.hasError('passwordMismatch') &&
      (this.form.get('confirmPassword')?.touched || false)
    );
  });

  constructor() {
    const id = this.id();
    if (id) this.store.dispatch(new LoadUser(id));
    if (!this.me()) this.store.dispatch(new LoadCurrentUser());

    // Conditional password validators: only required when the user starts typing.
    this.form.controls['password'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value: string) => {
        const confirmCtrl = this.form.controls['confirmPassword'];
        if (value && value.length > 0) {
          this.form.controls['password'].setValidators([Validators.minLength(8)]);
          confirmCtrl.setValidators([Validators.required]);
        } else {
          this.form.controls['password'].clearValidators();
          confirmCtrl.clearValidators();
          confirmCtrl.setValue('', { emitEvent: false });
        }
        this.form.controls['password'].updateValueAndValidity({ emitEvent: false });
        confirmCtrl.updateValueAndValidity({ emitEvent: false });
      });

    // Repopulate when the loaded user or "me" resolves; also toggle role-disabled
    // for self-edit (so the only admin can't accidentally demote themselves).
    effect(() => {
      const u = this.user();
      if (!u) return;
      this.form.reset({
        name: u.name,
        email: u.email,
        role: u.role,
        password: '',
        confirmPassword: '',
      });
      const roleCtrl = this.form.controls['role'];
      if (this.isSelf()) {
        roleCtrl.disable({ emitEvent: false });
      } else {
        roleCtrl.enable({ emitEvent: false });
      }
    });

    this.actions$
      .pipe(ofActionSuccessful(UpdateUser), takeUntilDestroyed())
      .subscribe(() => {
        this.submitting.set(false);
        this.messages.add({ severity: 'success', summary: 'Usuario actualizado' });
        this.router.navigate(['/users']);
      });

    this.actions$
      .pipe(ofActionErrored(UpdateUser), takeUntilDestroyed())
      .subscribe(() => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo actualizar el usuario',
        });
      });
  }

  onSubmit(): void {
    const id = this.id();
    if (!id || this.form.invalid || this.submitting()) return;

    const payload: UpdateUserRequest = {};
    const nameCtrl = this.form.controls['name'];
    const emailCtrl = this.form.controls['email'];
    const roleCtrl = this.form.controls['role'];
    const passwordCtrl = this.form.controls['password'];

    if (nameCtrl.dirty) payload.name = (nameCtrl.value as string).trim();
    if (emailCtrl.dirty) {
      payload.email = (emailCtrl.value as string).trim().toLowerCase();
    }
    if (roleCtrl.dirty && !this.isSelf()) {
      payload.role = roleCtrl.value as UserType;
    }
    const pw = (passwordCtrl.value as string) ?? '';
    if (pw.length > 0) payload.password = pw;

    if (Object.keys(payload).length === 0) {
      this.messages.add({ severity: 'info', summary: 'No hay cambios para guardar' });
      return;
    }

    this.submitting.set(true);
    this.store.dispatch(new UpdateUser(id, payload));
  }
}

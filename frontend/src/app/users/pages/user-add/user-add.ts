import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Actions, Store, ofActionErrored, ofActionSuccessful } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { CreateUser } from '../../../../state/users/users.actions';
import type { UserType } from '../../../data/types/user';
import { passwordMatchValidator } from '../../../validators/password-match.validator';
import { ROLE_OPTIONS } from '../../constants/roles';

@Component({
  selector: 'app-user-add',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
  ],
  templateUrl: './user-add.html',
  styleUrl: './user-add.scss',
})
export class UserAdd {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);

  readonly roleOptions = ROLE_OPTIONS;

  form = this.fb.group(
    {
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      role: ['technician' as UserType, Validators.required],
    },
    { validators: passwordMatchValidator },
  );

  submitting = signal(false);

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
    this.actions$
      .pipe(ofActionSuccessful(CreateUser), takeUntilDestroyed())
      .subscribe(() => {
        this.submitting.set(false);
        this.messages.add({ severity: 'success', summary: 'Usuario creado' });
        this.router.navigate(['/users']);
      });

    this.actions$
      .pipe(ofActionErrored(CreateUser), takeUntilDestroyed())
      .subscribe(() => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo crear el usuario',
        });
      });
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const { name, email, password, role } = this.form.value;
    this.submitting.set(true);
    this.store.dispatch(
      new CreateUser({
        name: name!.trim(),
        email: email!.trim().toLowerCase(),
        password: password!,
        role: role as UserType,
      }),
    );
  }
}

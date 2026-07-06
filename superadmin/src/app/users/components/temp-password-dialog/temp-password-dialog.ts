import { Component, inject, output, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { LucideCopy, LucideTriangleAlert } from '@lucide/angular';
import { Store } from '@ngxs/store';
import { ClearTempPassword } from '../../../../state/users/users.actions';

/** One-time temp-password display (05 §2/§3): shown exactly once with a copy
 *  button and a "won't be shown again" warning; wipes the value from state on
 *  close. Used after create and after a Crítico-tab reset. */
@Component({
  selector: 'app-temp-password-dialog',
  imports: [DialogModule, LucideCopy, LucideTriangleAlert],
  templateUrl: './temp-password-dialog.html',
})
export class TempPasswordDialog {
  /** Fires when the user acknowledges (parent may navigate). */
  readonly closed = output<void>();

  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected password = signal('');
  protected title = signal('Contraseña temporal');

  open(password: string, title = 'Contraseña temporal'): void {
    this.password.set(password);
    this.title.set(title);
    this.dialogOpen.set(true);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.password());
      this.messages.add({ severity: 'success', summary: 'Copiada al portapapeles' });
    } catch {
      this.messages.add({
        severity: 'warn',
        summary: 'No se pudo copiar',
        detail: 'Selecciona y copia la contraseña manualmente.',
      });
    }
  }

  protected acknowledge(): void {
    this.dialogOpen.set(false);
    this.password.set('');
    this.store.dispatch(new ClearTempPassword());
    this.closed.emit();
  }
}

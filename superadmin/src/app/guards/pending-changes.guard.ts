import { CanDeactivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

/** Dirty-navigation guard (04 CP-3, reusable): pages expose
 *  `hasPendingChanges()`; leaving with unsaved work asks through the global
 *  `<p-confirmdialog>` (never `alert()` — 01 PrimeNG rules). */
export interface HasPendingChanges {
  hasPendingChanges(): boolean;
}

export const pendingChangesGuard: CanDeactivateFn<HasPendingChanges> = (component) => {
  if (!component.hasPendingChanges()) return true;
  const confirmation = inject(ConfirmationService);
  return new Observable<boolean>((sub) => {
    confirmation.confirm({
      header: 'Cambios sin guardar',
      message: 'Tienes cambios sin guardar. ¿Salir y descartarlos?',
      acceptLabel: 'Salir sin guardar',
      rejectLabel: 'Seguir editando',
      acceptButtonStyleClass: 'btn-danger',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        sub.next(true);
        sub.complete();
      },
      reject: () => {
        sub.next(false);
        sub.complete();
      },
    });
  });
};

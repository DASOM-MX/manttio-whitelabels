import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ToastMessage } from '../app/interfaces/toast-message';

export type { ToastMessage };

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toast$ = new BehaviorSubject<ToastMessage | null>(null);
  toast$ = this._toast$.asObservable();

  show(text: string, type: ToastMessage['type'] = 'info') {
    this._toast$.next({ text, type });
    setTimeout(() => this._toast$.next(null), 3000);
  }
}

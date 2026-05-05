import { Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { ToastService, ToastMessage } from '../../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgClass],
  template: `
    @if (toast) {
      <div
        class="fixed top-5 right-5 px-4 py-3 rounded-lg shadow-lg text-white transition-all duration-300 animate-fade-in"
        [ngClass]="{
          'bg-green-500': toast.type === 'success',
          'bg-red-500': toast.type === 'error',
          'bg-blue-500': toast.type === 'info',
          'bg-yellow-500': toast.type === 'warning'
        }"
      >
        {{ toast.text }}
      </div>
    }
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fadeIn 0.3s ease-out;
    }
  `]
})
export class ToastComponent {
  private toastService = inject(ToastService);
  toast: ToastMessage | null = null;

  constructor() {
    this.toastService.toast$.subscribe(msg => {
      this.toast = msg;
    });
  }
}

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ForcePasswordDialogComponent } from './shared/components/force-password-dialog/force-password-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ForcePasswordDialogComponent],
  template: `
    <router-outlet />
    <app-force-password-dialog />
  `,
})
export class App { }

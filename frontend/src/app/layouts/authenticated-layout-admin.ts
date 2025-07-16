import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BottomNav } from '../shared/bottom-nav';

@Component({
  selector: 'app-authenticated-layout-admin',
  standalone: true,
  imports: [RouterModule, BottomNav],
  template: `
    <main class="pb-16">
      <router-outlet></router-outlet>
    </main>
    <app-bottom-nav></app-bottom-nav>
  `,
  styleUrl: './authenticated-layout-admin.scss'
})
export class AuthenticatedLayoutAdmin {

}

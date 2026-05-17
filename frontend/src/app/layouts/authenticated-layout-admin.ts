import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BottomNav } from '../shared/bottom-nav';

@Component({
  selector: 'app-authenticated-layout-admin',
  standalone: true,
  imports: [RouterModule, BottomNav],
  template: `
    <div class="h-screen flex flex-col bg-background">
      <main class="flex-1 min-h-0 overflow-y-auto">
        <router-outlet></router-outlet>
      </main>
      <app-bottom-nav></app-bottom-nav>
    </div>
  `,
  styleUrl: './authenticated-layout-admin.scss'
})
export class AuthenticatedLayoutAdmin {

}

import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BottomNav } from '../shared/bottom-nav';

@Component({
  selector: 'app-authenticated-layout-admin',
  standalone: true,
  imports: [RouterModule, BottomNav],
  templateUrl: './authenticated-layout-admin.html',
  styleUrl: './authenticated-layout-admin.scss'
})
export class AuthenticatedLayoutAdmin {

}

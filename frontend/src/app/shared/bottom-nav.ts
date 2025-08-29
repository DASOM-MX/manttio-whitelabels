import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule, NgClass } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router'
import { filter } from 'rxjs/operators'

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterModule, NgClass, CommonModule],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss'
})
export class BottomNav {
  role: boolean | null = null;
  email: string | null = null;


  showMenu = false;

  constructor(private router: Router) {
    this.email = localStorage.getItem('email');
    const storedRole = localStorage.getItem('role');
    this.role = storedRole === 'true'

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.showMenu = false;
      })
  }

  toggleMenu() {
    this.showMenu = !this.showMenu;
    console.log("menu");
  }

  logout() {
    console.log("Cerrar sesión");
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('email');
    this.router.navigate(['/login'])
  }

}

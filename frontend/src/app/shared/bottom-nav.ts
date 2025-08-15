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


  showMenu = false;

  constructor(private router: Router) {
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
    // Aquí va tu lógica de logout
  }

}

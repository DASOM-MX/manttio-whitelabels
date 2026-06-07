import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { BottomNav } from '../shared/bottom-nav';

@Component({
  selector: 'app-authenticated-layout-admin',
  standalone: true,
  imports: [RouterModule, BottomNav],
  templateUrl: './authenticated-layout-admin.html',
  styleUrl: './authenticated-layout-admin.scss',
})
export class AuthenticatedLayoutAdmin {
  private router = inject(Router);
  /** The actual scrollable element is the layout's <main>, not the window —
   *  Angular's router-level `withInMemoryScrolling` won't reach it. Reset
   *  scroll-to-top here on every navigation so each page lands at its header. */
  private scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.scrollContainer()?.nativeElement.scrollTo({ top: 0 }));
  }
}

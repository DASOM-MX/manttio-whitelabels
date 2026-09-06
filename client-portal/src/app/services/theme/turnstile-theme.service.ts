import { inject, Injectable } from '@angular/core';
import { Store } from '@ngxs/store';
import { from, Observable, throwError } from 'rxjs';
import { AppState } from '../../../state/app/app.state';
import { runtimeConfig } from '../../config/runtime-config';
import { TurnstileService } from '../turnstile/turnstile.service';

/** Renders the Turnstile challenge with this deploy's key and the app's current
 *  theme — the part both public auth pages need and neither should own. It sits
 *  beside `BrandThemeService` because what it contributes is the theme half:
 *  Cloudflare draws the widget, so it can only match dark mode if told at
 *  render time.
 *
 *  The site key comes from `/__config` (03 §6), never a literal. It is public,
 *  but per-tenant — a compiled key would send every tenant's portal through one
 *  Cloudflare account. */
@Injectable({ providedIn: 'root' })
export class TurnstileThemeService {
  private readonly store = inject(Store);
  private readonly turnstile = inject(TurnstileService);

  /** Whether this deploy has a Turnstile key at all. `/__config` ships an
   *  empty key when the tenant has none, and 25 §3's contract is that an empty
   *  key means the public auth pages must not draw a challenge — so they must
   *  not demand a token either, or the page blocks on a widget that was never
   *  drawn. The backend still decides: it refuses the request unless it is
   *  itself configured to skip verification. */
  get configured(): boolean {
    return !!runtimeConfig.turnstileSiteKey;
  }

  /** Emits once the visitor passes the challenge. An Observable rather than the
   *  promise underneath: the caller subscribes and returns, so a challenge that
   *  never resolves cannot hold a component's `ngOnInit` open, and the
   *  subscription dies with the component.
   *
   *  No key configured → errors without drawing anything. A widget wired to an
   *  empty key fails at submit instead, which reads as a broken login. */
  render(containerId: string): Observable<void> {
    const sitekey = runtimeConfig.turnstileSiteKey;
    if (!sitekey) {
      return throwError(() => new Error('No Turnstile site key configured for this deploy'));
    }
    // Snapshot, not a subscription: Turnstile bakes the theme in at render time,
    // so reacting to a later toggle would mean tearing the widget down anyway.
    const darkMode = this.store.selectSnapshot(AppState.darkMode);
    return from(
      this.turnstile.render(containerId, { sitekey, theme: darkMode ? 'dark' : 'light' }),
    );
  }
}

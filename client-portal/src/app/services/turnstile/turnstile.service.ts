import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { TurnstileOptions } from '../../data/types/turnstile/turnstile-options';

/** Service for managing Cloudflare Turnstile CAPTCHA widgets.
 *  The script URL is hardcoded to the official CDN — Turnstile keys are public
 *  and the script must be loaded from Cloudflare to be secure.
 */
@Injectable({ providedIn: 'root' })
export class TurnstileService {
  private readonly platformId = inject(PLATFORM_ID);
  private scriptLoaded = false;
  private scriptPromise: Promise<void> | null = null;
  private tokens = new Map<string, string>();

  /** Ensure the Turnstile script is loaded. Safe to call multiple times. */
  async ensureScriptLoaded(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.scriptLoaded) return;
    if (!this.scriptPromise) {
      this.scriptPromise = this.loadScript();
    }

    await this.scriptPromise;
    this.scriptLoaded = true;
  }

  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.turnstile) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Turnstile script'));
      document.head.appendChild(script);
    });
  }

  /** Render a Turnstile widget in the specified container and return a promise
   *  that resolves when the token is ready. */
  async render(containerId: string, options: TurnstileOptions): Promise<void> {
    await this.ensureScriptLoaded();
    if (!window.turnstile) {
      throw new Error('Turnstile script not loaded');
    }

    return new Promise((resolve) => {
      window.turnstile!.render(containerId, {
        ...options,
        callback: (token: string) => {
          this.tokens.set(containerId, token);
          options.callback?.(token);
          resolve();
        },
      });
    });
  }

  /** Get the current token from the widget. Returns empty string if widget not
   *  rendered or not ready. */
  getToken(containerId: string): string {
    if (!window.turnstile) return '';
    // Try to get from our cached map first
    const cached = this.tokens.get(containerId);
    if (cached) return cached;
    // Fall back to the window API
    const token = window.turnstile.getResponse(containerId);
    if (token) {
      this.tokens.set(containerId, token);
      return token;
    }
    return '';
  }

  /** Reset the Turnstile widget. */
  reset(containerId: string): void {
    if (window.turnstile) {
      window.turnstile.reset(containerId);
      this.tokens.delete(containerId);
    }
  }

  /** Remove the Turnstile widget. */
  remove(containerId: string): void {
    if (window.turnstile) {
      window.turnstile.remove(containerId);
    }
    this.tokens.delete(containerId);
  }
}

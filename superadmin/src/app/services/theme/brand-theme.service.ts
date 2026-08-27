import { Injectable } from '@angular/core';
import { BRAND_SCALE_STEPS } from '../../model/constants/brand/scale-steps.const';
import type { Brand, BrandColorScale } from '../../data/dtos/brand';

const HSL_COMPONENTS_RE = /^\d{1,3}(?:\.\d+)? \d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/;

/** Brand → runtime theming (03 §4, plan 22 CP-2): sets the `--brand-primary-*` /
 *  `--brand-accent-*` CSS variables that the Tailwind palette **and** the
 *  PrimeNG preset both read (each resolves `hsl(var(--brand-…))`, so no
 *  runtime preset update is needed). `surface` is fixed at build time —
 *  no `--brand-surface-*` variables emitted. Scale values are HSL components
 *  ("H S% L%", steps 0…1000 — branding rule 2) set verbatim; anything else
 *  (hex, rgb) is skipped. With no brand (or missing steps) the variables are
 *  cleared so the neutral fallbacks baked into `tailwind.config.js` /
 *  `manttio-preset.ts` take over.
 *
 *  The editor's live preview reuses this same service against draft values
 *  (03 §7); typography never applies to superadmin chrome — Figtree is
 *  the product voice (01 Typography). */
@Injectable({ providedIn: 'root' })
export class BrandThemeService {
  apply(brand: Brand | null): void {
    const root = document.documentElement;
    this.setScaleVars(root, 'primary', brand?.colors?.primary);
    this.setScaleVars(root, 'accent', brand?.colors?.accent);
  }

  private setScaleVars(
    root: HTMLElement,
    prefix: 'primary' | 'accent',
    scale: BrandColorScale | undefined,
  ): void {
    for (const step of BRAND_SCALE_STEPS) {
      const components = scale?.[step]?.trim();
      if (components && HSL_COMPONENTS_RE.test(components)) {
        root.style.setProperty(`--brand-${prefix}-${step}`, components);
      } else {
        root.style.removeProperty(`--brand-${prefix}-${step}`);
      }
    }
  }
}

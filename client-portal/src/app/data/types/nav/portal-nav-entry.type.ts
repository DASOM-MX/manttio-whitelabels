import type { LucideIcon } from '@lucide/angular';
import type { PortalGrant } from '../../../model/enums/portal-auth/portal-grants.enum';

/** A sidebar row. `route`/`grant` are both omitted only for the disabled
 *  Facturas row (00 §4b.24, 03 §4): no path, no guard, no endpoint, visible
 *  to every portal user regardless of grants. Every other entry omits only
 *  `grant` (Inicio, always visible) or carries both. */
export interface PortalNavEntry {
  label: string;
  icon: LucideIcon;
  route?: string;
  grant?: PortalGrant;
  /** Exact-match highlight — set on entries with route-prefixed siblings. */
  exact?: boolean;
  /** "Próximamente" — its own field, never the `badge` slot (which only
   *  ever holds a real number from a real read). Presence marks the row
   *  disabled: plain text, no routerLink, not focusable, never the active
   *  highlight. */
  disabledLabel?: string;
}

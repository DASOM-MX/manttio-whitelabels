import type { Role } from '../../../data/dtos/auth';

/** Role visual language (QA 2026-07-08): one blue ladder, darker = higher in
 *  the hierarchy. Built on the static `navy`/`cyan` scales — never the
 *  brand-driven `sky` — so roles read identically on every tenant. Pairs with
 *  `.role-pill` (styles.scss); the label always rides along (color-not-only). */
export const ROLE_PILL_CLASSES: Record<Role, string> = {
  owner: 'bg-navy-900 text-cyan-100',
  admin: 'bg-cyan-700 text-white',
  office: 'bg-cyan-300 text-cyan-950',
  technician: 'bg-cyan-100 text-cyan-900',
};

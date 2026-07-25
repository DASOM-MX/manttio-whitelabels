import type { Role } from '../../../data/dtos/auth';

/** Role visual language (QA 2026-07-08): one blue ladder, darker = higher in
 *  the hierarchy. The ladder is static — literal values in styles.scss
 *  (`.role-pill--*`), never the brand-driven `primary` scale — so roles read
 *  identically on every tenant. The label always rides along (color-not-only). */
export const ROLE_PILL_CLASSES: Record<Role, string> = {
  owner: 'role-pill--owner',
  admin: 'role-pill--admin',
  office: 'role-pill--office',
  technician: 'role-pill--technician',
};

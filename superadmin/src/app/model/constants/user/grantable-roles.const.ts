import type { Role } from '../../../data/dtos/auth';

/** Roles assignable in-tenant (mirrors the backend's GRANTABLE_ROLES).
 *  `owner` is provisioned from the whitelabel manager only — never granted
 *  through the superadmin, by anyone (14 §2 note 1). */
export const GRANTABLE_ROLES: readonly Role[] = ['admin', 'office', 'technician'];

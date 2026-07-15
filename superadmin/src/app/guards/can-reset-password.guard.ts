import type { Role } from '../data/dtos/auth';

/** Password-reset pairings (14 §2 note 1): owner resets admins/office/techs;
 *  admins reset office/techs only; nobody in-tenant resets the owner. The
 *  backend enforces the same pairs — this only gates the UI. */
export const canResetPassword = (actor: Role | null, target: Role): boolean => {
  if (target === 'owner') return false;
  if (actor === 'owner') return true;
  return actor === 'admin' && (target === 'office' || target === 'technician');
};

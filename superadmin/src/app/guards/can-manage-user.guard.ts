import type { Role } from '../data/dtos/auth';

/** Owner protection (14 §2 note 1, hardened 2026-07-08): owner rows are
 *  immutable in-tenant for everyone — the owner included. Owner accounts are
 *  provisioned from the whitelabel manager; changes/invalidation go through
 *  the support team (an in-tenant slip could lock out the whole tenant). The
 *  backend enforces the same rule (`cannot_modify_owner`). */
export const canManageUser = (target: Role): boolean => target !== 'owner';

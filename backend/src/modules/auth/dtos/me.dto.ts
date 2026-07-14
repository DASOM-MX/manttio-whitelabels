import type { Role } from '../../users/enums/users.enum';

// Response shape for GET /auth/me (backend plan §1) — the gating input the
// superadmin boots on. No zod equivalent (never parsed from a request), so it
// lives in dtos/ like users' PublicUser.
//
// Deliberately no tenantConfig: the tenant module-flag feature is a pending
// item (2026-07-14) addressed later — it won't live in the auth/users surface.
export type MeResponse = {
  user: { id: string; name: string; email: string };
  role: Role;
  mustChangePassword: boolean;
};

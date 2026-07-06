/** Auth DTOs — expected API surface (02-app-shell.md §3; backend obligations
 *  recorded in `backend/manttio-whitelabeled-backend-plan.md`). Built against
 *  typed services so mocks can back them until the endpoints exist. */

export type Role = 'owner' | 'admin' | 'office' | 'technician';

/** Per-tenant feature flags set by the manager push (14-access-control.md §1).
 *  Users, reports and clients are core and always on. */
export interface TenantModules {
  billing: boolean;
  wms: boolean;
  crm: boolean;
  cms: boolean;
  scheduling: boolean;
}

export interface TenantConfig {
  modules: TenantModules;
}

export interface MeUser {
  id: string;
  name: string;
  email: string;
}

/** `GET /auth/me` — the single gating input for nav, guards and in-page @ifs. */
export interface MeResponse {
  user: MeUser;
  role: Role;
  tenantConfig: TenantConfig;
  /** True when the account carries a temporary password (reset / new account):
   *  the shell interposes the unskippable change dialog (02 §3). */
  mustChangePassword: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

/** `POST /auth/password` — change own password; clears `mustChangePassword`. */
export interface ChangePasswordRequest {
  password: string;
}

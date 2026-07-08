// `owner` is the tenant principal (whitelabel fork): everything an admin can do
// plus owner-only surfaces (CMS editing today; `PUT /brand` per backend plan §3).
// Provisioning-time only — never grantable through the users API, and owner rows
// are never editable/deletable in-tenant (backend plan §1).
export const ROLES = ['owner', 'admin', 'office', 'technician'] as const;
export type Role = (typeof ROLES)[number];

// Roles assignable in-tenant via POST/PATCH /users. `owner` is provisioned
// from the whitelabel manager only — never granted here.
export const GRANTABLE_ROLES = ['admin', 'office', 'technician'] as const;

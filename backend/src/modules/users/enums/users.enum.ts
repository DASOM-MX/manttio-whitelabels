// `owner` is the tenant principal (whitelabel fork): everything an admin can do
// plus owner-only surfaces (CMS editing today; `PUT /brand` per backend plan §3).
// Provisioning-time only — never grantable through the users API, and owner rows
// are never editable/deletable in-tenant (backend plan §1).
export const ROLES = ['owner', 'admin', 'technician'] as const;
export type Role = (typeof ROLES)[number];

// Roles an admin may assign via POST/PUT /users.
export const GRANTABLE_ROLES = ['admin', 'technician'] as const;

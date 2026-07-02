export const ROLES = ['admin', 'technician'] as const;
export type Role = (typeof ROLES)[number];

import type { Role } from '../data/dtos/auth';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  office: 'Oficina',
  technician: 'Técnico',
};

/** p-tag severities per role — pills always pair color with a label. */
export const ROLE_SEVERITIES: Record<Role, 'warn' | 'info' | 'secondary' | 'success'> = {
  owner: 'warn',
  admin: 'info',
  office: 'secondary',
  technician: 'success',
};

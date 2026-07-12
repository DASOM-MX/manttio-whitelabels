import type { Role } from '../../../data/dtos/auth';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  office: 'Oficina',
  technician: 'Técnico',
};

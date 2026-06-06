import type { RoleOption } from '../../interfaces/role-option';
import type { UserType } from '../../data/types/user';

export const ROLE_LABELS: Record<UserType, string> = {
  admin: 'Administrador',
  technician: 'Técnico',
};

export const ROLE_OPTIONS: RoleOption[] = [
  { label: ROLE_LABELS.admin, value: 'admin' },
  { label: ROLE_LABELS.technician, value: 'technician' },
];

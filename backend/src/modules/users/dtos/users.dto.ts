import type { Role } from '../enums/users.enum';
import type { UserRow } from '../types/users.types';

// Response shape for a user — drops passwordHash and the soft-delete audit columns.
// No zod equivalent (users are never created from this shape), so it lives in dtos/.
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
};

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

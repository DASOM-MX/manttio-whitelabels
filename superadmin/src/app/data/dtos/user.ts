import type { Role } from './auth';

/** Users DTOs (05-users.md §1) — mirrors the frontend's `users/` shapes with
 *  the whitelabel additions (phone, active, role enum from 14 §1, temp
 *  passwords). Soft-delete audit trail is backend convention. */
export interface User {
  id: string;
  name: string;
  /** Mexican two-surname convention (2026-07-21); null on rows that predate
   *  the split — their full name lives in `name`. */
  paternalLastName?: string | null;
  maternalLastName?: string | null;
  email: string;
  phone?: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deleteComment?: string;
  deletedBy?: string;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role | '';
  active?: boolean | '';
}

export interface CreateUserRequest {
  name: string;
  /** Required by the form (the API tolerates absence for the legacy field app). */
  paternalLastName: string;
  maternalLastName: string;
  email: string;
  phone?: string;
  role: Role;
}

/** `POST /users` hands back the initial temp password exactly once — there is
 *  no email flow; the creator relays it (05 §2). */
export interface CreateUserResponse {
  user: User;
  tempPassword: string;
}

export interface UpdateUserRequest {
  name?: string;
  paternalLastName?: string;
  maternalLastName?: string;
  email?: string;
  phone?: string;
  role?: Role;
  active?: boolean;
}

export interface DeleteUserRequest {
  deleteComment: string;
}

/** `POST /users/:id/password` — role-gated reset (14 §2 note 1); shown once. */
export interface ResetPasswordResponse {
  tempPassword: string;
}

/** A roster row trimmed to what assignment pickers need. */
export interface AssignableUser {
  id: string;
  name: string;
  paternalLastName?: string | null;
  /** Precomposed display name for select labels + filtering. */
  fullName: string;
}

import type { UserType } from '../../types/user';

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  role?: UserType;
}

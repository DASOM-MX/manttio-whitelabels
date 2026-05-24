import type { UserType } from '../../types/user';

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: UserType;
  timezone?: string;
}

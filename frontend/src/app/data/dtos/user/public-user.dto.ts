import type { UserType } from '../../types/user';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserType;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

import type { UserType } from '../../types/user';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserType;
  createdAt: string;
  updatedAt: string;
}

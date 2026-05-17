import { AuthUser } from './auth-user';

export interface AuthStateModel {
  token: string | null;
  user: AuthUser | null;
}

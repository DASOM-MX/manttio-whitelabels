import type { UserType } from '../../types/user';

export interface JwtPayload {
  sub: string;
  role: UserType;
  iat: number;
  exp: number;
}

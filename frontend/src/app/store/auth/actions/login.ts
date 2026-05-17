export class Login {
  static readonly type = '[Auth] Login';
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}

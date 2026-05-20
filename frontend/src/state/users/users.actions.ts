import type { CreateUserRequest } from '../../app/data/dtos/user';

export class LoadCurrentUser {
  static readonly type = '[Users] Load Current';
}

export class CreateUser {
  static readonly type = '[Users] Create';
  constructor(public payload: CreateUserRequest) {}
}

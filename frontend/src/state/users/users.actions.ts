import type {
  CreateUserRequest,
  DeleteUserRequest,
  PublicUser,
  UpdateUserRequest,
} from '../../app/data/dtos/user';

export class LoadCurrentUser {
  static readonly type = '[Users] Load Current';
}

export class LoadUsers {
  static readonly type = '[Users] Load List';
}

export class LoadUser {
  static readonly type = '[Users] Load One';
  constructor(public id: string) {}
}

export class SelectUser {
  static readonly type = '[Users] Select';
  constructor(public user: PublicUser | null) {}
}

export class CreateUser {
  static readonly type = '[Users] Create';
  constructor(public payload: CreateUserRequest) {}
}

export class UpdateUser {
  static readonly type = '[Users] Update';
  constructor(public id: string, public payload: UpdateUserRequest) {}
}

export class DeleteUser {
  static readonly type = '[Users] Delete';
  constructor(public id: string, public payload: DeleteUserRequest) {}
}

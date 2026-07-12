import type {
  CreateUserRequest,
  DeleteUserRequest,
  UpdateUserRequest,
  UserListQuery,
} from '../../app/data/dtos/user';

export class LoadUsers {
  static readonly type = '[Users] Load List';
  constructor(public query: UserListQuery = {}) {}
}

export class LoadUser {
  static readonly type = '[Users] Load One';
  constructor(public id: string) {}
}

/** Response carries the initial temp password → `UsersState.tempPassword`,
 *  shown exactly once by the form (05 §2). */
export class CreateUser {
  static readonly type = '[Users] Create';
  constructor(public payload: CreateUserRequest) {}
}

export class UpdateUser {
  static readonly type = '[Users] Update';
  constructor(
    public id: string,
    public payload: UpdateUserRequest,
  ) {}
}

export class DeleteUser {
  static readonly type = '[Users] Delete';
  constructor(
    public id: string,
    public payload: DeleteUserRequest,
  ) {}
}

/** Role-gated reset (14 §2 note 1); temp password lands in state once. */
export class ResetUserPassword {
  static readonly type = '[Users] Reset Password';
  constructor(public id: string) {}
}

/** Wipe the one-time temp password out of state after display. */
export class ClearTempPassword {
  static readonly type = '[Users] Clear Temp Password';
}

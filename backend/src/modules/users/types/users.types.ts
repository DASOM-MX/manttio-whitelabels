import type { users } from '../models/users.model';

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UpdateUserFields = Partial<
  Pick<
    UserRow,
    | 'name'
    | 'paternalLastName'
    | 'maternalLastName'
    | 'email'
    | 'passwordHash'
    | 'role'
    | 'mustChangePassword'
  >
>;

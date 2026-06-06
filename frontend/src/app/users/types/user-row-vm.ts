import type { PublicUser } from '../../data/dtos/user';

/** View model the users-list page builds on top of `PublicUser`:
 *  - `searchHaystack` lowercases `name + email + role label` for the text filter.
 *  - `isSelf` marks the current admin's own row (hides delete, drives the "tú" chip).
 *  - `roleLabel` is the localized label shown in the `<p-tag>` body. */
export interface UserRowVM extends PublicUser {
  searchHaystack: string;
  isSelf: boolean;
  roleLabel: string;
}

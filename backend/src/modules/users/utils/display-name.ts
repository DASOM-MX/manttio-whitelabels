import type { UserRow } from '../types/users.types';

/** "Nombre ApellidoPaterno ApellidoMaterno" — tolerates legacy rows whose
 *  surnames predate the split (their full name lives in `name`). */
export const displayName = (
  u: Pick<UserRow, 'name' | 'paternalLastName' | 'maternalLastName'>,
): string => [u.name, u.paternalLastName, u.maternalLastName].filter(Boolean).join(' ');

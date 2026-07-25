/** "Nombre ApellidoPaterno ApellidoMaterno" — composes whatever parts exist:
 *  legacy rows whose surnames predate the split (their full name lives in
 *  `name`) and left-joined author columns that are all null ('' out). */
export const displayName = (u: {
  name: string | null;
  paternalLastName: string | null;
  maternalLastName: string | null;
}): string => [u.name, u.paternalLastName, u.maternalLastName].filter(Boolean).join(' ');

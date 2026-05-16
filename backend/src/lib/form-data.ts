// `@cloudflare/workers-types` mistypes FormData.get/getAll as returning only `string`,
// but at runtime they return `string | File | null`. These helpers bridge that gap so
// route handlers don't need to scatter `as unknown as ...` casts everywhere.

export type FormValue = string | File | null;

export const fdGet = (fd: FormData, name: string): FormValue =>
  fd.get(name) as unknown as FormValue;

export const fdGetAll = (fd: FormData, name: string): Array<string | File> =>
  fd.getAll(name) as unknown as Array<string | File>;

export const isFile = (v: unknown): v is File =>
  typeof v === 'object' && v !== null && 'arrayBuffer' in v && 'name' in v;

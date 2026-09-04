/** GET query params — the shape `toParams` serializes. Empty, null and
 *  undefined values drop off the URL rather than sending blanks. */
export type Query = Record<string, string | number | boolean | undefined | null>;

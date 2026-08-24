// Upload limits + the shape of what the request path is allowed to read
// (10-wms/02 §6, 11 §1).

/** 1 MB (02 §6). A stock list is text; anything larger is a different kind of
 *  document, and the cap is what keeps the request path cheap enough to stay
 *  inside a Worker's CPU budget before the queue takes over. */
export const IMPORT_FILE_MAX_BYTES = 1024 * 1024;

/** The request path sniffs the header row and at most this many values per
 *  column — never the whole file (11 §1). Full parsing is the consumer's job,
 *  behind a raised CPU limit and platform retries. */
export const IMPORT_SAMPLE_ROWS = 5;

/** Delimiter-sniffed text, or a spreadsheet (02 §6). */
export const IMPORT_ACCEPTED_EXTENSIONS = ['.csv', '.txt', '.xlsx'] as const;

/** Candidate delimiters, most specific first — a tab never appears by accident,
 *  a semicolon is the es-MX Excel default, a comma is everything else. */
export const IMPORT_DELIMITERS = ['\t', ';', ','] as const;

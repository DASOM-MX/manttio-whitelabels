import * as XLSX from 'xlsx';
import { IMPORT_DELIMITERS } from '../constants/import-limits';
import { UnparseableFileError } from '../http-errors/replenishment-imports.error';

// Turning an uploaded file into rows of strings (10-wms/11 §2). ONE
// implementation, two callers: the request path asks for a handful of rows to
// build the field mapper, the queue consumer asks for all of them. Splitting
// those would mean two answers to "what does this file say", which is exactly
// the bug class the plan's `detected_fields` snapshot exists to avoid.

/** Excel writes one, and it would otherwise ride along inside the first header
 *  and quietly break every mapping keyed by header text. */
const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** A delimited parser that understands RFC-4180 quoting and stops once it has
 *  the rows it was asked for. Hand-rolled because the alternative is a second
 *  dependency for ~40 lines, and because stopping early matters: reading a
 *  whole file in the request path is what the async pipeline exists to avoid. */
export const parseDelimited = (text: string, delimiter: string, maxRows: number): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field.trim());
    field = '';
  };
  const endRow = () => {
    endField();
    // A trailing newline yields one empty cell, which is not a row.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length && rows.length < maxRows; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        // An escaped quote inside a quoted field.
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) endField();
    else if (char === '\n') endRow();
    else if (char !== '\r') field += char;
  }
  if (rows.length < maxRows && (field !== '' || row.length > 0)) endRow();

  return rows;
};

/** Whichever candidate splits the header into the most columns wins, and a
 *  header that never splits is not a table (02 §6: "delimiter-sniffed"). Tried
 *  most-specific-first so a tab-separated file whose values contain commas is
 *  not read as CSV. */
export const sniffDelimiter = (text: string): string => {
  let best = '';
  let columns = 1;
  for (const candidate of IMPORT_DELIMITERS) {
    const [header] = parseDelimited(text, candidate, 1);
    if (header && header.length > columns) {
      best = candidate;
      columns = header.length;
    }
  }
  if (best === '') {
    throw new UnparseableFileError('no delimiter splits the first row into columns');
  }
  return best;
};

export const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
};

/** SheetJS, per 11 §2. `raw: false` so every cell arrives as its DISPLAYED
 *  text: a lot number typed as `00123` must not come back as the number 123,
 *  and a date must not come back as an Excel serial. The whole workbook is
 *  materialized because SheetJS has no cheap partial read — the 1 MB upload cap
 *  (02 §6) is what keeps that honest, in the request path as much as here. */
const readWorkbookRows = (bytes: ArrayBuffer): string[][] => {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  } catch {
    throw new UnparseableFileError('the workbook could not be opened');
  }
  const first = workbook.SheetNames[0];
  const sheet = first === undefined ? undefined : workbook.Sheets[first];
  if (!sheet) throw new UnparseableFileError('the workbook has no sheets');

  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  });
};

/** Spreadsheets carry ghost columns — a cell that was once typed in and cleared
 *  leaves the sheet wider than its data. Trailing empty headers are dropped
 *  (and their cells with them) rather than refused, because to the person who
 *  made the file those columns are not there. An empty header BETWEEN two real
 *  ones is a different thing and still refused: it cannot be mapped, and it
 *  cannot key the remembered mapping either. */
const trimGhostColumns = (rows: string[][]): string[][] => {
  const [header, ...body] = rows;
  if (!header) return rows;

  let width = header.length;
  while (width > 0 && (header[width - 1] ?? '') === '') width -= 1;
  if (width === header.length) return rows;

  return [header.slice(0, width), ...body.map((row) => row.slice(0, width))];
};

/** Every row of the file as strings, header first. `maxRows` caps the read for
 *  the request path; the consumer passes nothing and walks the lot. */
export const readRows = (
  fileName: string,
  bytes: ArrayBuffer,
  maxRows = Number.POSITIVE_INFINITY,
): string[][] => {
  const extension = extensionOf(fileName);

  if (extension === '.xlsx') {
    const rows = readWorkbookRows(bytes);
    return trimGhostColumns(
      Number.isFinite(maxRows) ? rows.slice(0, maxRows) : rows,
    );
  }
  if (extension !== '.csv' && extension !== '.txt') {
    throw new UnparseableFileError(`unsupported extension "${extension}"`);
  }

  const text = stripBom(new TextDecoder().decode(bytes));
  if (text.trim() === '') throw new UnparseableFileError('the file is empty');
  return trimGhostColumns(parseDelimited(text, sniffDelimiter(text), maxRows));
};

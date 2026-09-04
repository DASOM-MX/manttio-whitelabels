import {
  IMPORT_DELIMITERS,
  IMPORT_SAMPLE_ROWS,
} from '../constants/import-limits';
import { UnparseableFileError } from '../http-errors/replenishment-imports.error';
import type { DetectedField } from '../types/replenishment-imports.types';

// Field detection for the mapper screen (10-wms/02 §6). The REQUEST PATH reads
// a header row and at most `IMPORT_SAMPLE_ROWS` values per column — never the
// whole file. Full parsing belongs to the queue consumer (11 §1), which runs
// with a raised CPU limit and platform retries behind it.

/** Excel writes one, and it would otherwise ride along inside the first header
 *  and quietly break every mapping keyed by header text. */
const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** A delimited parser that understands RFC-4180 quoting, stopping once it has
 *  the rows it was asked for. Hand-rolled because the alternative is a
 *  dependency for ~40 lines, and because it must stop early: reading the whole
 *  file here is precisely what the async pipeline exists to avoid. */
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
const sniffDelimiter = (text: string): string => {
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

const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
};

const fieldsFromRows = (rows: string[][]): DetectedField[] => {
  const [header, ...samples] = rows;
  if (!header || header.length === 0) throw new UnparseableFileError('no header row');
  if (header.some((h) => h === '')) {
    // A blank header cannot be mapped, and cannot key the remembered mapping
    // either — better to refuse than to invent `Column 3`.
    throw new UnparseableFileError('every column needs a header');
  }

  return header.map((head, column) => ({
    // Per-import by design (01 §2): the durable mapping memory keys by header
    // text instead, because these ids mean nothing to the next upload.
    id: `f${column}`,
    header: head,
    samples: samples
      .map((sample) => sample[column] ?? '')
      .filter((value) => value !== '')
      .slice(0, IMPORT_SAMPLE_ROWS),
  }));
};

/** Reads the header row and a few sample values. Throws
 *  `UnparseableFileError` for anything it cannot make a table out of — the
 *  caller answers `400 unparseable_file` and creates no import row. */
export const detectFields = (fileName: string, bytes: ArrayBuffer): DetectedField[] => {
  const extension = extensionOf(fileName);

  if (extension === '.xlsx') {
    // NOT YET: reading a workbook means unzipping and walking sheet XML, and
    // the consumer (11) has to do the full-file version of exactly that. Both
    // sides land together in the processing slice so the file is read by one
    // implementation, not two. Until then a spreadsheet is refused honestly
    // rather than half-read.
    throw new UnparseableFileError('xlsx support lands with the import processor');
  }
  if (extension !== '.csv' && extension !== '.txt') {
    throw new UnparseableFileError(`unsupported extension "${extension}"`);
  }

  const text = stripBom(new TextDecoder().decode(bytes));
  if (text.trim() === '') throw new UnparseableFileError('the file is empty');

  const delimiter = sniffDelimiter(text);
  return fieldsFromRows(parseDelimited(text, delimiter, IMPORT_SAMPLE_ROWS + 1));
};

import { IMPORT_SAMPLE_ROWS } from '../constants/import-limits';
import { UnparseableFileError } from '../http-errors/replenishment-imports.error';
import type { DetectedField } from '../types/replenishment-imports.types';
import { readRows } from './sheet-parse.helpers';

// Field detection for the mapper screen (10-wms/02 §6). The request path reads
// a header row and at most `IMPORT_SAMPLE_ROWS` values per column — the full
// walk belongs to the queue consumer (11 §1), which runs behind a raised CPU
// limit with platform retries.

/** Reads the header row and a few sample values. Throws `UnparseableFileError`
 *  for anything it cannot make a table out of — the caller answers
 *  `400 unparseable_file` and creates no import row. */
export const detectFields = (fileName: string, bytes: ArrayBuffer): DetectedField[] => {
  const [header, ...samples] = readRows(fileName, bytes, IMPORT_SAMPLE_ROWS + 1);

  if (!header || header.length === 0) throw new UnparseableFileError('no header row');
  if (header.length < 2) throw new UnparseableFileError('a single column is not a table');
  if (header.some((head) => head === '')) {
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

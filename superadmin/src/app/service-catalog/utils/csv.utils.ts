/** Minimal RFC 4180 CSV engine (18 §6.3) — hand-rolled on purpose: the files
 *  are Excel "save as CSV" price lists, and a parsing dependency for quotes +
 *  CRLF handling wouldn't pull its weight. UTF-8 only, per the plan. */

export interface CsvRecord {
  /** 1-based record ordinal in the source file — blank records counted, so it
   *  is exactly the row number Excel shows (embedded newlines in quoted cells
   *  don't advance it, same as Excel). */
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  headers: string[];
  /** Data records, in file order — header record excluded, fully-empty
   *  records dropped (their ordinals are *not* reused: a price list's blank
   *  section separators must never shift the line numbers the owner sees).
   *  Cells are raw strings; interpretation is the mapper's job. */
  rows: CsvRecord[];
}

/** Quote-aware split: `""` escapes a quote inside a quoted cell, CR/LF inside
 *  quotes stays literal, a leading BOM (Excel's UTF-8 signature) is dropped. */
export const parseCsv = (text: string): ParsedCsv => {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = (): void => {
    record.push(cell);
    cell = '';
  };
  const endRecord = (): void => {
    endCell();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\n') {
      endRecord();
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell !== '' || record.length > 0) endRecord();

  const nonEmpty = records
    .map((cells, i) => ({ line: i + 1, cells }))
    .filter((r) => r.cells.some((c) => c.trim() !== ''));
  const [header, ...rows] = nonEmpty;
  return { headers: (header?.cells ?? []).map((h) => h.trim()), rows };
};

const escapeCell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export const toCsv = (headers: string[], rows: string[][]): string =>
  [headers, ...rows].map((record) => record.map(escapeCell).join(',')).join('\r\n');

/** Browser download of a UTF-8 CSV. The BOM is for Excel: without it, a
 *  double-clicked file mangles every accent. */
export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

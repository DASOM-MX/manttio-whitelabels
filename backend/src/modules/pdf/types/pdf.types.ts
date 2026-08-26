import { rgb } from 'pdf-lib';
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';

export type Cell = {
  text: string;
  bold?: boolean;
  fill?: ReturnType<typeof rgb>;
  align?: 'left' | 'center' | 'right';
  border?: boolean;
  colSpan?: number;
};

/** A cell that stacks its value under its label, instead of pairing them across
 *  two table columns. This is what a form column *is* on screen — the question
 *  with its answer beneath it — so a section rendered at N columns puts N of
 *  these side by side. */
export type StackedCell = {
  label: string;
  value: string;
  /** Filler cells that pad a short final row draw no box. */
  border?: boolean;
};

// Document theme — the whitelabel seam. Layouts derive one from the tenant
// brand scales per render (falling back to DEFAULT_PDF_THEME in constants).
// `fill`/`border` are the **fixed** chrome neutrals since 22 CP-1 — only
// `text` and `accentFill` still move with the tenant.
export type PdfTheme = {
  /** Table header cells — fixed neutral. */
  fill: ReturnType<typeof rgb>;
  /** Rules and cell borders — fixed neutral. */
  border: ReturnType<typeof rgb>;
  /** Body ink — the brand primary. */
  text: ReturnType<typeof rgb>;
  /** Section-header band — the brand accent, this document's one categorical
   *  cue (22 CP-1, plan 23 § palette roles). */
  accentFill: ReturnType<typeof rgb>;
};

// Mutable draw cursor threaded through the toolkit. `y` is the top of the next thing to
// draw (the cursor moves downward as content is added).
export type Renderer = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  theme: PdfTheme;
  y: number;
};

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

// Document theme — the whitelabel seam. Layouts derive one from the tenant
// brand scales per render (falling back to DEFAULT_PDF_THEME in constants).
export type PdfTheme = {
  fill: ReturnType<typeof rgb>;
  border: ReturnType<typeof rgb>;
  text: ReturnType<typeof rgb>;
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

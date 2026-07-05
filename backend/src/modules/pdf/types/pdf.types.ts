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

// Mutable draw cursor threaded through the toolkit. `y` is the top of the next thing to
// draw (the cursor moves downward as content is added).
export type Renderer = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
};

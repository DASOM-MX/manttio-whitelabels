// Generic, domain-agnostic PDF toolkit built on pdf-lib. Runs on Cloudflare Workers with
// no Node compat shim. Provides the low-level primitives — document + font setup, page
// pagination, table/row/cell drawing, section headers, image grids, remote-image embedding
// — that document layouts (e.g. reports/helpers/report-pdf.helpers.ts) compose. Any new
// document type (invoices, quotes, work orders) reuses this instead of re-implementing it.

import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFFont, PDFImage } from 'pdf-lib';
import {
  CONTENT_WIDTH,
  DEFAULT_PDF_THEME,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from '../constants/pdf-layout';
import type { Cell, PdfTheme, Renderer, StackedCell } from '../types/pdf.types';

// Create a document with Helvetica (+ bold) embedded and a first page, returning the
// draw cursor. Callers draw with the primitives below, then `r.doc.save()`. The theme
// (usually derived from the tenant brand) colors every primitive.
export const createRenderer = async (
  theme: PdfTheme = DEFAULT_PDF_THEME,
): Promise<Renderer> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  return {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    font,
    fontBold,
    theme,
    y: PAGE_HEIGHT - MARGIN,
  };
};

// --- remote image embedding ---

const safeFetchBytes = async (url: string): Promise<Uint8Array | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
};

const detectImageKind = (url: string, bytes: Uint8Array): 'png' | 'jpg' => {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
};

export const embedImageFromUrl = async (
  doc: PDFDocument,
  url: string,
): Promise<PDFImage | null> => {
  const bytes = await safeFetchBytes(url);
  if (!bytes) return null;
  try {
    return detectImageKind(url, bytes) === 'png'
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
};

// --- pagination ---

const newPage = (r: Renderer) => {
  r.page = r.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  r.y = PAGE_HEIGHT - MARGIN;
};

export const ensureSpace = (r: Renderer, needed: number) => {
  if (r.y - needed < MARGIN) newPage(r);
};

// --- text + tables ---

/** Naive greedy word-wrap. Single source for measuring a cell and for drawing
 *  it — the two used to carry separate copies of this loop, which is how a cell
 *  ends up measuring one height and painting another. */
const wrapText = (font: PDFFont, text: string, innerWidth: number, size: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > innerWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

const drawCellText = (
  r: Renderer,
  cell: Cell,
  x: number,
  yTop: number,
  width: number,
  height: number,
  size = 9,
) => {
  const font = cell.bold ? r.fontBold : r.font;
  const padX = 4;
  const innerW = width - padX * 2;
  const lines = wrapText(font, cell.text, innerW, size);

  const lineH = size * 1.25;
  let y = yTop - size - 2; // baseline of first line
  for (const ln of lines) {
    let xText = x + padX;
    if (cell.align === 'center') {
      const w = font.widthOfTextAtSize(ln, size);
      xText = x + (width - w) / 2;
    } else if (cell.align === 'right') {
      const w = font.widthOfTextAtSize(ln, size);
      xText = x + width - w - padX;
    }
    if (y - 2 < yTop - height) break; // overflow guard
    r.page.drawText(ln, { x: xText, y, size, font, color: r.theme.text });
    y -= lineH;
  }
};

const measureRowHeight = (
  font: Renderer['font'],
  fontBold: Renderer['fontBold'],
  cells: Cell[],
  widths: number[],
  size = 9,
): number => {
  let maxLines = 1;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const w = c.colSpan
      ? widths.slice(i, i + c.colSpan).reduce((a, b) => a + (b ?? widths[widths.length - 1]!), 0)
      : (widths[i] ?? widths[widths.length - 1]!);
    const f = c.bold ? fontBold : font;
    const lines = wrapText(f, c.text, w - 8, size).length;
    if (lines > maxLines) maxLines = lines;
    if (c.colSpan && c.colSpan > 1) i += c.colSpan - 1;
  }
  const lineH = size * 1.25;
  return Math.max(20, maxLines * lineH + 8);
};

// Draw a row of cells. Widths are in points and span CONTENT_WIDTH.
export const drawRow = (r: Renderer, widths: number[], cells: Cell[], size = 9) => {
  const height = measureRowHeight(r.font, r.fontBold, cells, widths, size);
  ensureSpace(r, height);
  let x = MARGIN;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const w = (c.colSpan ? widths.slice(i, i + c.colSpan).reduce((a, b) => a + b, 0) : widths[i]) ?? widths[widths.length - 1]!;
    if (c.fill) {
      r.page.drawRectangle({ x, y: r.y - height, width: w, height, color: c.fill, borderColor: r.theme.border, borderWidth: c.border === false ? 0 : 0.5 });
    } else if (c.border !== false) {
      r.page.drawRectangle({ x, y: r.y - height, width: w, height, borderColor: r.theme.border, borderWidth: 0.5 });
    }
    drawCellText(r, c, x, r.y, w, height, size);
    x += w;
    if (c.colSpan && c.colSpan > 1) i += c.colSpan - 1;
  }
  r.y -= height;
};

/** Draw a row of stacked label/value cells at the given column widths.
 *
 *  Every cell in the row shares one height (the tallest), so the boxes line up
 *  across the row however unevenly the text wraps. */
export const drawStackedRow = (
  r: Renderer,
  widths: number[],
  cells: StackedCell[],
  size = 9,
) => {
  const padX = 4;
  const lineH = size * 1.25;
  const gap = 3; // between the label and its value

  const wrapped = cells.map((c, i) => {
    const innerW = (widths[i] ?? widths[widths.length - 1]!) - padX * 2;
    return {
      label: wrapText(r.fontBold, c.label, innerW, size),
      value: wrapText(r.font, c.value, innerW, size),
    };
  });

  const height = Math.max(
    24,
    ...wrapped.map((w) => (w.label.length + w.value.length) * lineH + gap + 8),
  );
  ensureSpace(r, height);

  let x = MARGIN;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    const w = widths[i] ?? widths[widths.length - 1]!;
    const lines = wrapped[i]!;

    if (cell.border !== false) {
      r.page.drawRectangle({
        x,
        y: r.y - height,
        width: w,
        height,
        borderColor: r.theme.border,
        borderWidth: 0.5,
      });
    }

    let y = r.y - size - 2;
    for (const ln of lines.label) {
      r.page.drawText(ln, { x: x + padX, y, size, font: r.fontBold, color: r.theme.text });
      y -= lineH;
    }
    y -= gap;
    for (const ln of lines.value) {
      r.page.drawText(ln, { x: x + padX, y, size, font: r.font, color: r.theme.text });
      y -= lineH;
    }

    x += w;
  }
  r.y -= height;
};

// Full-width (optionally multi-column) bold, gray-filled, centered header row.
export const drawSectionHeader = (r: Renderer, label: string, totalCols = 1) => {
  const widths =
    totalCols === 1
      ? [CONTENT_WIDTH]
      : Array.from({ length: totalCols }, () => CONTENT_WIDTH / totalCols);
  drawRow(r, widths, [
    { text: label, bold: true, fill: r.theme.fill, align: 'center', colSpan: totalCols },
    ...Array.from({ length: totalCols - 1 }, () => ({ text: '' }) as Cell),
  ]);
};

// Draw a `cols`-up grid of images (default 3-up), fetching + embedding each URL. Missing
// images leave an empty bordered cell. Does not draw a header — the caller owns that.
export const drawImageGrid = async (r: Renderer, urls: string[], cols = 3) => {
  const cellW = CONTENT_WIDTH / cols;
  const cellH = 150 * 0.75; // approximate aspect
  for (let i = 0; i < urls.length; i += cols) {
    ensureSpace(r, cellH + 8);
    const slice = urls.slice(i, i + cols);
    const imgs = await Promise.all(slice.map((u) => embedImageFromUrl(r.doc, u)));
    let x = MARGIN;
    for (let j = 0; j < cols; j++) {
      const img = imgs[j];
      r.page.drawRectangle({
        x,
        y: r.y - cellH,
        width: cellW,
        height: cellH,
        borderColor: r.theme.border,
        borderWidth: 0.5,
      });
      if (img) {
        const ratio = Math.min(cellW / img.width, cellH / img.height);
        const drawW = img.width * ratio;
        const drawH = img.height * ratio;
        const dx = x + (cellW - drawW) / 2;
        const dy = r.y - cellH + (cellH - drawH) / 2;
        r.page.drawImage(img, { x: dx, y: dy, width: drawW, height: drawH });
      }
      x += cellW;
    }
    r.y -= cellH;
  }
};

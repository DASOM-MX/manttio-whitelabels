// Server-side PDF renderer that mirrors the visual format produced by the frontend's
// pdfmake renderer (`frontend/src/app/pages/report-detail/report-detail.ts`). Pure JS via
// pdf-lib so it runs on Cloudflare Workers with no Node compat shim.
//
// Layout follows the same docDefinition shape: header bar (customer | folio), customer
// info table, activities table, variant-specific table, 3-up picture grid, signature.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const FILL_GRAY = rgb(0.863, 0.863, 0.863); // #DCDCDC
const BORDER = rgb(0.6, 0.6, 0.6);
const TEXT = rgb(0.1, 0.13, 0.2);

const formatDate = (d: Date | null, timezone: string) => {
  if (!d) return '';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(d);
};

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

const embedImageFromUrl = async (
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

export type RenderReportPdfParams = {
  report: {
    id: string;
    reportType: string;
    workType: string | null;
    dateArrival: Date | null;
    dateDeparture: Date | null;
    finishedAt: Date | null;
    signedBy: string | null;
    signedLatitude: number | null;
    signedLongitude: number | null;
    signedAccuracy: number | null;
  };
  data: Record<string, unknown>;
  customer: {
    name: string;
    identification: string | null;
    phone: string | null;
    email: string | null;
    observation: string | null;
    /** IANA timezone used for date/time rendering throughout the PDF. */
    timezone: string;
  };
  reportUserName: string;
  pictureUrls: string[];
  signatureUrl: string | null;
};

type Cell = {
  text: string;
  bold?: boolean;
  fill?: ReturnType<typeof rgb>;
  align?: 'left' | 'center' | 'right';
  border?: boolean;
  colSpan?: number;
};

type Renderer = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  /** y is the top of the next thing to draw (cursor moves downward). */
  y: number;
};

const newPage = (r: Renderer) => {
  r.page = r.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  r.y = PAGE_HEIGHT - MARGIN;
};

const ensureSpace = (r: Renderer, needed: number) => {
  if (r.y - needed < MARGIN) newPage(r);
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
  const txt = cell.text;
  const padX = 4;
  const innerW = width - padX * 2;

  // Naive word-wrap.
  const words = txt.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > innerW && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

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
    r.page.drawText(ln, { x: xText, y, size, font, color: TEXT });
    y -= lineH;
  }
};

const measureRowHeight = (
  font: PDFFont,
  fontBold: PDFFont,
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
    const innerW = w - 8;
    const words = c.text.split(/\s+/);
    let line = '';
    let lines = 1;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) > innerW && line) {
        lines += 1;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (lines > maxLines) maxLines = lines;
    if (c.colSpan && c.colSpan > 1) i += c.colSpan - 1;
  }
  const lineH = size * 1.25;
  return Math.max(20, maxLines * lineH + 8);
};

// Render a row of cells. Widths are in points and span CONTENT_WIDTH.
const drawRow = (r: Renderer, widths: number[], cells: Cell[], size = 9) => {
  const height = measureRowHeight(r.font, r.fontBold, cells, widths, size);
  ensureSpace(r, height);
  let x = MARGIN;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const w = (c.colSpan ? widths.slice(i, i + c.colSpan).reduce((a, b) => a + b, 0) : widths[i]) ?? widths[widths.length - 1]!;
    if (c.fill) {
      r.page.drawRectangle({ x, y: r.y - height, width: w, height, color: c.fill, borderColor: BORDER, borderWidth: c.border === false ? 0 : 0.5 });
    } else if (c.border !== false) {
      r.page.drawRectangle({ x, y: r.y - height, width: w, height, borderColor: BORDER, borderWidth: 0.5 });
    }
    drawCellText(r, c, x, r.y, w, height, size);
    x += w;
    if (c.colSpan && c.colSpan > 1) i += c.colSpan - 1;
  }
  r.y -= height;
};

const drawSectionHeader = (r: Renderer, label: string, span = 1, totalCols = 1) => {
  const widths =
    totalCols === 1
      ? [CONTENT_WIDTH]
      : Array.from({ length: totalCols }, () => CONTENT_WIDTH / totalCols);
  drawRow(r, widths, [
    { text: label, bold: true, fill: FILL_GRAY, align: 'center', colSpan: totalCols },
    ...Array.from({ length: totalCols - 1 }, () => ({ text: '' }) as Cell),
  ]);
  void span;
};

const drawTitleBar = (r: Renderer, customerName: string, folio: string) => {
  ensureSpace(r, 36);
  // Two-cell row with bottom border only — emulate pdfmake's title bar.
  const half = CONTENT_WIDTH / 2;
  const height = 36;
  // Bottom border line
  r.page.drawLine({
    start: { x: MARGIN, y: r.y - height + 0.5 },
    end: { x: MARGIN + CONTENT_WIDTH, y: r.y - height + 0.5 },
    thickness: 0.6,
    color: BORDER,
  });
  // Customer name (left, h1)
  r.page.drawText(customerName, {
    x: MARGIN + 4,
    y: r.y - 22,
    size: 18,
    font: r.fontBold,
    color: TEXT,
  });
  // Folio (right, h2)
  const folioWidth = r.fontBold.widthOfTextAtSize(folio, 14);
  r.page.drawText(folio, {
    x: MARGIN + CONTENT_WIDTH - folioWidth - 4,
    y: r.y - 22,
    size: 14,
    font: r.fontBold,
    color: TEXT,
  });
  r.y -= height + 6;
};

const drawCustomerTable = (r: Renderer, customer: RenderReportPdfParams['customer']) => {
  const cols = [CONTENT_WIDTH / 2, CONTENT_WIDTH / 2];
  drawRow(r, cols, [
    { text: 'Datos del Cliente', bold: true, fill: FILL_GRAY, align: 'center', colSpan: 2 },
    { text: '' },
  ]);
  drawRow(r, cols, [
    { text: 'Identificación', bold: true },
    { text: customer.identification || '' },
  ]);
  drawRow(r, cols, [
    { text: 'Teléfono', bold: true },
    { text: customer.phone || '' },
  ]);
  drawRow(r, cols, [
    { text: 'Email', bold: true },
    { text: customer.email || '' },
  ]);
  drawRow(r, cols, [
    { text: 'Observación', bold: true },
    { text: customer.observation || '' },
  ]);
  r.y -= 8;
};

const drawActivitiesTable = (r: Renderer, p: RenderReportPdfParams) => {
  const w = CONTENT_WIDTH / 4;
  const cols = [w, w, w, w];
  drawRow(r, cols, [
    { text: 'Informaciones de las actividades', bold: true, fill: FILL_GRAY, align: 'center', colSpan: 4 },
    { text: '' },
    { text: '' },
    { text: '' },
  ]);
  drawRow(r, cols, [
    { text: 'Para:', bold: true },
    { text: p.reportUserName },
    { text: 'Tipo de tarea:', bold: true },
    { text: p.report.workType || '' },
  ]);
  drawRow(r, cols, [
    { text: 'Fecha Llegada:', bold: true },
    { text: formatDate(p.report.dateArrival, p.customer.timezone) },
    { text: 'Fecha Salida', bold: true },
    { text: formatDate(p.report.dateDeparture, p.customer.timezone) },
  ]);
  drawRow(r, cols, [
    { text: 'Observaciones', bold: true },
    { text: (p.data['observations'] as string) || '', colSpan: 3 },
  ]);
  r.y -= 8;
};

const drawVariantTable = (r: Renderer, reportType: string, data: Record<string, unknown>) => {
  const v = (k: string) => {
    const val = data[k];
    if (val === true) return 'Sí';
    if (val === false) return 'No';
    if (val === null || val === undefined) return '';
    return String(val);
  };
  const w = CONTENT_WIDTH / 4;
  const cols4 = [w, w, w, w];

  if (reportType === 'minisplit') {
    drawRow(r, cols4, [
      { text: 'Formulario: Mantenimiento Minisplit', bold: true, fill: FILL_GRAY, align: 'center', colSpan: 4 },
      { text: '' },
      { text: '' },
      { text: '' },
    ]);
    drawRow(r, cols4, [
      { text: 'Equipo se encuentra operando', bold: true },
      { text: v('is_operating') },
      { text: 'Cuenta con filtro evaporador', bold: true },
      { text: v('filter') },
    ]);
    drawRow(r, cols4, [
      { text: 'Control remoto funciona', bold: true },
      { text: v('remote_working') },
      { text: 'Voltaje de entrada', bold: true },
      { text: v('inner_voltage') },
    ]);
    drawRow(r, cols4, [
      { text: 'Amperaje general', bold: true },
      { text: v('amperage') },
      { text: 'Ruido fuera de lo normal', bold: true },
      { text: v('unusual_noise') },
    ]);
    drawRow(r, cols4, [
      { text: 'Observaciones', bold: true },
      { text: v('observations') || 'Ninguna', colSpan: 3 },
    ]);
  } else if (reportType === 'chiller') {
    const cols = [
      CONTENT_WIDTH * 0.35,
      CONTENT_WIDTH * 0.15,
      CONTENT_WIDTH * 0.35,
      CONTENT_WIDTH * 0.15,
    ];
    drawRow(r, cols, [
      { text: 'Informaciones de las actividades', bold: true, fill: FILL_GRAY, align: 'center', colSpan: 4 },
      { text: '' },
      { text: '' },
      { text: '' },
    ]);
    drawRow(r, cols, [
      { text: 'Equipo se encuentra operando', bold: true },
      { text: v('is_operating') },
      { text: 'Switch de flujo funciona', bold: true },
      { text: v('flux_switch_working') },
    ]);
    drawRow(r, cols, [
      { text: 'Temperatura de entrada', bold: true },
      { text: v('inner_temperature') },
      { text: 'Temperatura de salida', bold: true },
      { text: v('outer_temperature') },
    ]);
    drawRow(r, cols, [
      { text: 'Teclas del PLC funcionan', bold: true },
      { text: v('plc_keys_working') },
      { text: 'Voltaje de entrada', bold: true },
      { text: v('inner_voltage') },
    ]);
    drawRow(r, cols, [
      { text: 'Amperaje de motor condensador general', bold: true },
      { text: v('motor_amperage') },
      { text: 'Presiones del sistema 1', bold: true },
      { text: v('system_pressure_1') },
    ]);
    drawRow(r, cols, [
      { text: 'Presiones del sistema 2', bold: true },
      { text: v('system_pressure_2') },
      { text: 'Presiones del sistema 3', bold: true },
      { text: v('system_pressure_3') },
    ]);
    drawRow(r, cols, [
      { text: 'Presión de aceite', bold: true },
      { text: v('oil_pressure') },
      { text: 'Nivel de aceite', bold: true },
      { text: v('oil_level') },
    ]);
    drawRow(r, cols, [
      { text: 'Observaciones', bold: true },
      { text: v('observations') || 'Ninguna', colSpan: 3 },
    ]);
  } else if (reportType === 'uma') {
    drawRow(r, cols4, [
      { text: 'Formulario UMAS', bold: true, fill: FILL_GRAY, align: 'center', colSpan: 4 },
      { text: '' },
      { text: '' },
      { text: '' },
    ]);
    drawRow(r, cols4, [
      { text: 'Equipo se encuentra operando', bold: true },
      { text: v('is_operating') },
      { text: 'Se ajustó la banda de la UMA', bold: true },
      { text: v('air_band_adjustment') },
    ]);
    drawRow(r, cols4, [
      { text: 'Temperatura de entrada', bold: true },
      { text: v('inner_temperature') },
      { text: 'Temperatura de salida', bold: true },
      { text: v('outer_temperature') },
    ]);
    drawRow(r, cols4, [
      { text: 'Rejilla de aire en buenas condiciones', bold: true },
      { text: v('air_good_quality') },
      { text: 'Voltaje de entrada', bold: true },
      { text: v('inner_voltage') },
    ]);
    drawRow(r, cols4, [
      { text: 'Amperaje del motor', bold: true },
      { text: v('motor_amperage') },
      { text: 'Ruido fuera de lo normal', bold: true },
      { text: v('unusual_noise') },
    ]);
    drawRow(r, cols4, [
      { text: 'Observaciones', bold: true },
      { text: v('observations') || 'Ninguna', colSpan: 3 },
    ]);
  } else {
    drawRow(r, [CONTENT_WIDTH], [
      { text: 'Sin datos específicos de mantenimiento', align: 'center' },
    ]);
  }
  r.y -= 8;
};

const drawPicturesGrid = async (r: Renderer, urls: string[]) => {
  if (urls.length === 0) return;
  drawSectionHeader(r, 'Fotos del Reporte', 1, 3);

  const cellW = CONTENT_WIDTH / 3;
  const cellH = 150 * 0.75; // approximate aspect
  for (let i = 0; i < urls.length; i += 3) {
    ensureSpace(r, cellH + 8);
    const slice = urls.slice(i, i + 3);
    const imgs = await Promise.all(slice.map((u) => embedImageFromUrl(r.doc, u)));
    let x = MARGIN;
    for (let j = 0; j < 3; j++) {
      const img = imgs[j];
      r.page.drawRectangle({
        x,
        y: r.y - cellH,
        width: cellW,
        height: cellH,
        borderColor: BORDER,
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
  r.y -= 8;
};

const drawSignature = async (
  r: Renderer,
  signatureUrl: string | null,
  createdByName: string,
  signedByName: string,
  location: { latitude: number | null; longitude: number | null; accuracy: number | null },
) => {
  if (!signatureUrl) return;
  const sig = await embedImageFromUrl(r.doc, signatureUrl);
  if (!sig) return;
  const targetW = 150;
  const ratio = sig.height / sig.width;
  const w = targetW;
  const h = w * ratio;
  // Heading (12pt) + image + 2 caption lines (14pt each, ~18px tall) + a bit of breathing room.
  ensureSpace(r, h + 80);

  const heading = 'Firma del cliente';
  const headingWidth = r.fontBold.widthOfTextAtSize(heading, 12);
  r.page.drawText(heading, {
    x: MARGIN + (CONTENT_WIDTH - headingWidth) / 2,
    y: r.y - 14,
    size: 12,
    font: r.fontBold,
    color: TEXT,
  });
  r.y -= 22;

  const x = MARGIN + (CONTENT_WIDTH - w) / 2;
  r.page.drawImage(sig, { x, y: r.y - h, width: w, height: h });
  r.y -= h + 4;

  const captions = [`Iniciado por: ${createdByName}`, `Finalizado por: ${signedByName}`];
  for (const caption of captions) {
    const captionWidth = r.fontBold.widthOfTextAtSize(caption, 14);
    r.page.drawText(caption, {
      x: MARGIN + (CONTENT_WIDTH - captionWidth) / 2,
      y: r.y - 18,
      size: 14,
      font: r.fontBold,
      color: TEXT,
    });
    r.y -= 22;
  }

  if (location.latitude !== null && location.longitude !== null) {
    const accSuffix =
      location.accuracy !== null && location.accuracy > 0
        ? ` (±${Math.round(location.accuracy)} m)`
        : '';
    const coordsText = `Ubicación de firma: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}${accSuffix}`;
    const coordsWidth = r.font.widthOfTextAtSize(coordsText, 9);
    r.page.drawText(coordsText, {
      x: MARGIN + (CONTENT_WIDTH - coordsWidth) / 2,
      y: r.y - 12,
      size: 9,
      font: r.font,
      color: TEXT,
    });
    r.y -= 16;
  }
};

export const renderReportPdf = async (p: RenderReportPdfParams): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const r: Renderer = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    font,
    fontBold,
    y: PAGE_HEIGHT - MARGIN,
  };

  drawTitleBar(r, p.customer.name, p.report.id);
  drawCustomerTable(r, p.customer);
  drawActivitiesTable(r, p);
  drawVariantTable(r, p.report.reportType, p.data);
  await drawPicturesGrid(r, p.pictureUrls);
  await drawSignature(
    r,
    p.signatureUrl,
    p.reportUserName,
    p.report.signedBy ?? p.reportUserName,
    {
      latitude: p.report.signedLatitude,
      longitude: p.report.signedLongitude,
      accuracy: p.report.signedAccuracy,
    },
  );

  return doc.save();
};

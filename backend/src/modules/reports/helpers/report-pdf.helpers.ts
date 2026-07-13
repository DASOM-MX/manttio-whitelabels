// Report PDF layout. The generic PDF toolkit (page setup, tables, rows, image grids,
// pagination, theme) lives in modules/pdf; this file composes it into the report document
// — title bar, customer table, activities table, variant-specific table, picture grid,
// signature — mirroring the frontend pdfmake layout
// (`frontend/src/app/pages/report-detail/report-detail.ts`).

import { rgb } from 'pdf-lib';
import { CONTENT_WIDTH, DEFAULT_PDF_THEME, MARGIN } from '../../pdf/constants/pdf-layout';
import {
  createRenderer,
  drawImageGrid,
  drawRow,
  drawSectionHeader,
  embedImageFromUrl,
  ensureSpace,
} from '../../pdf/services/pdf.service';
import { hslToRgb01 } from '../../brand/utils/hsl-color';
import type { PdfTheme, Renderer } from '../../pdf/types/pdf.types';
import type { Brand, HslScale } from '../../brand/dtos/brand.dto';

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

// Brand scales → document theme (the whitelabel-PDF hook). Steps chosen to sit
// closest to the pre-brand constants; any unparsable value falls back to the
// matching neutral default component.
const themeColor = (scale: HslScale, step: string, fallback: PdfTheme[keyof PdfTheme]) => {
  const color = hslToRgb01(scale[step] ?? '');
  return color ? rgb(color.r, color.g, color.b) : fallback;
};

export const pdfThemeFromBrand = (brand: Brand): PdfTheme => ({
  fill: themeColor(brand.colors.surface, '100', DEFAULT_PDF_THEME.fill),
  border: themeColor(brand.colors.surface, '300', DEFAULT_PDF_THEME.border),
  text: themeColor(brand.colors.primary, '900', DEFAULT_PDF_THEME.text),
});

export type RenderReportPdfParams = {
  brand: Brand;
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

// Tenant logo above the title bar. Absent brand logo → no strip at all, the
// document starts at the title bar exactly as before.
const drawBrandLogo = async (r: Renderer, logoUrl: string | undefined) => {
  if (!logoUrl) return;
  const logo = await embedImageFromUrl(r.doc, logoUrl);
  if (!logo) return;
  const ratio = Math.min(180 / logo.width, 36 / logo.height, 1);
  const w = logo.width * ratio;
  const h = logo.height * ratio;
  r.page.drawImage(logo, { x: MARGIN, y: r.y - h, width: w, height: h });
  r.y -= h + 10;
};

const drawTitleBar = (r: Renderer, customerName: string, folio: string) => {
  ensureSpace(r, 36);
  // Two-cell row with bottom border only — emulate pdfmake's title bar.
  const height = 36;
  // Bottom border line
  r.page.drawLine({
    start: { x: MARGIN, y: r.y - height + 0.5 },
    end: { x: MARGIN + CONTENT_WIDTH, y: r.y - height + 0.5 },
    thickness: 0.6,
    color: r.theme.border,
  });
  // Customer name (left, h1)
  r.page.drawText(customerName, {
    x: MARGIN + 4,
    y: r.y - 22,
    size: 18,
    font: r.fontBold,
    color: r.theme.text,
  });
  // Folio (right, h2)
  const folioWidth = r.fontBold.widthOfTextAtSize(folio, 14);
  r.page.drawText(folio, {
    x: MARGIN + CONTENT_WIDTH - folioWidth - 4,
    y: r.y - 22,
    size: 14,
    font: r.fontBold,
    color: r.theme.text,
  });
  r.y -= height + 6;
};

const drawCustomerTable = (r: Renderer, customer: RenderReportPdfParams['customer']) => {
  const cols = [CONTENT_WIDTH / 2, CONTENT_WIDTH / 2];
  drawRow(r, cols, [
    { text: 'Datos del Cliente', bold: true, fill: r.theme.fill, align: 'center', colSpan: 2 },
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
    { text: 'Informaciones de las actividades', bold: true, fill: r.theme.fill, align: 'center', colSpan: 4 },
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
      { text: 'Formulario: Mantenimiento Minisplit', bold: true, fill: r.theme.fill, align: 'center', colSpan: 4 },
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
      { text: 'Informaciones de las actividades', bold: true, fill: r.theme.fill, align: 'center', colSpan: 4 },
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
      { text: 'Formulario UMAS', bold: true, fill: r.theme.fill, align: 'center', colSpan: 4 },
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

const drawReportPictures = async (r: Renderer, urls: string[]) => {
  if (urls.length === 0) return;
  drawSectionHeader(r, 'Fotos del Reporte', 3);
  await drawImageGrid(r, urls, 3);
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
    color: r.theme.text,
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
      color: r.theme.text,
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
      color: r.theme.text,
    });
    r.y -= 16;
  }
};

export const renderReportPdf = async (p: RenderReportPdfParams): Promise<Uint8Array> => {
  const r = await createRenderer(pdfThemeFromBrand(p.brand));

  await drawBrandLogo(r, p.brand.logoUrl ?? p.brand.isologoUrl);
  drawTitleBar(r, p.customer.name, p.report.id);
  drawCustomerTable(r, p.customer);
  drawActivitiesTable(r, p);
  drawVariantTable(r, p.report.reportType, p.data);
  await drawReportPictures(r, p.pictureUrls);
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

  return r.doc.save();
};

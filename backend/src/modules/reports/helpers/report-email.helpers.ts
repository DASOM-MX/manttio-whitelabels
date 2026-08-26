// Renderers for the report-delivery email (§9). Spanish copy. This file computes the
// display values (dates in the customer's timezone, work-type label, signed location,
// timezone footnote), derives the color palette from the tenant brand scales, and
// delegates the HTML markup to ../templates/report-email.html.ts — the markup lives in
// templates/ to keep this renderer readable. The plain-text body is assembled here.
// Brand identity is optional throughout: absent fields render nothing (rule 5).

import { labelForTimezone } from '../../customers/constants/timezones';
import { hslToHex } from '../../brand/utils/hsl-color';
// Explicit .ts extension: a specifier ending in `.html` matches wrangler's
// built-in Text-module rule and breaks `wrangler dev` bundling.
import { reportEmailHtml } from '../templates/report-email.html.ts';
import type { EmailPalette } from '../templates/report-email.html.ts';
import type { BrandColors, HslScale } from '../../brand/dtos/brand.dto';

const fmtDate = (d: Date, timezone: string) =>
  new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(d);

export type ReportEmailBrand = {
  name?: string;
  siteUrl?: string;
  logoUrl?: string;
  /** Materialized scales from GET /brand — always present (rule 3). */
  colors: BrandColors;
};

export type ReportEmailParams = {
  folio: string;
  customerName: string;
  recipientEmail: string;
  reportType: string;
  workType: string | null;
  dateArrival: Date | null;
  finishedAt: Date | null;
  createdByName: string;
  signedByName: string | null;
  signedLatitude: number | null;
  signedLongitude: number | null;
  signedAccuracy: number | null;
  downloadUrl: string;
  /** IANA timezone of the customer the report belongs to. Used for date formatting
   *  + disclosed verbatim in the email footnote. */
  timezone: string;
  brand: ReportEmailBrand;
};

// The chrome neutral left the brand contract (22 § Target 3), so these stopped
// being fallbacks and became the values: the fixed grayscale ramp's steps
// 100 / 0 / 900 / 200 / 500 / 600 / 400, materialized as hex because email
// clients want hex (Outlook's Word engine can't parse hsl()).
const FIXED_NEUTRALS = {
  pageBg: '#f5f5f5',
  panelBg: '#fafafa',
  bodyText: '#2e2e2e',
  border: '#e6e6e6',
  footnote: '#8c8c8c',
  closing: '#737373',
  outerFooter: '#b3b3b3',
} as const;

// The two brand-driven roles still need a fail-soft: a scale value that
// doesn't parse falls back to a neutral ink rather than dropping the style.
const NEUTRAL_BRAND_FALLBACKS = {
  brandInk: '#37414d',
  accent: '#37414d',
  footerText: '#d9dde2',
} as const;

const hex = (scale: HslScale, step: string, fallback: string) =>
  hslToHex(scale[step] ?? '') ?? fallback;

const paletteFromBrand = (colors: BrandColors): EmailPalette => ({
  ...FIXED_NEUTRALS,
  brandInk: hex(colors.primary, '800', NEUTRAL_BRAND_FALLBACKS.brandInk),
  accent: hex(colors.accent, '800', NEUTRAL_BRAND_FALLBACKS.accent),
  footerText: hex(colors.accent, '100', NEUTRAL_BRAND_FALLBACKS.footerText),
});

const fmtCoord = (n: number) => n.toFixed(6);

const mapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${fmtCoord(lat)},${fmtCoord(lng)}`;

const formatSignedLocation = (lat: number | null, lng: number | null, accuracy: number | null) => {
  if (lat === null || lng === null) return null;
  const accSuffix =
    accuracy !== null && accuracy > 0 ? ` (±${Math.round(accuracy)} m)` : '';
  return {
    coords: `${fmtCoord(lat)}, ${fmtCoord(lng)}${accSuffix}`,
    url: mapsUrl(lat, lng),
  };
};

const workTypeLabel = (workType: string | null, templateName: string) =>
  workType && workType.trim().length > 0
    ? workType
    : templateName;

export const renderReportEmailSubject = (folio: string, brandName?: string) =>
  brandName
    ? `Reporte de servicio ${folio} – ${brandName}`
    : `Reporte de servicio ${folio}`;

export const renderReportEmailHTML = (p: ReportEmailParams): string =>
  reportEmailHtml({
    folio: p.folio,
    customerName: p.customerName,
    recipientEmail: p.recipientEmail,
    createdByName: p.createdByName,
    finishedBy: p.signedByName?.trim() || p.createdByName,
    work: workTypeLabel(p.workType, p.reportType),
    arrival: p.dateArrival ? fmtDate(p.dateArrival, p.timezone) : 'Sin registrar',
    finished: p.finishedAt ? fmtDate(p.finishedAt, p.timezone) : 'Sin registrar',
    tzLabel: labelForTimezone(p.timezone),
    timezone: p.timezone,
    downloadUrl: p.downloadUrl,
    location: formatSignedLocation(p.signedLatitude, p.signedLongitude, p.signedAccuracy),
    year: new Date().getUTCFullYear(),
    brand: {
      name: p.brand.name,
      siteUrl: p.brand.siteUrl,
      logoUrl: p.brand.logoUrl,
    },
    palette: paletteFromBrand(p.brand.colors),
  });

export const renderReportEmailText = (p: ReportEmailParams): string => {
  const finished = p.finishedAt ? fmtDate(p.finishedAt, p.timezone) : 'Sin registrar';
  const arrival = p.dateArrival ? fmtDate(p.dateArrival, p.timezone) : 'Sin registrar';
  const finishedBy = p.signedByName?.trim() || p.createdByName;
  const work = workTypeLabel(p.workType, p.reportType);
  const location = formatSignedLocation(p.signedLatitude, p.signedLongitude, p.signedAccuracy);
  const tzLabel = labelForTimezone(p.timezone);

  const lines: string[] = [
    `Estimado/a ${p.customerName},`,
    '',
    'Hemos finalizado el servicio que solicitó. A continuación los detalles:',
    '',
    `Folio: ${p.folio}`,
    `Tipo de servicio: ${work}`,
    `Inicio del servicio: ${arrival}`,
    `Iniciado por: ${p.createdByName}`,
    `Finalización: ${finished}`,
    `Finalizado por: ${finishedBy}`,
  ];
  if (location) {
    lines.push(`Ubicación de firma: ${location.coords} — ${location.url}`);
  }
  lines.push(
    '',
    `(Las horas mostradas están en horario ${tzLabel} — ${p.timezone}.)`,
    '',
    `Descargar el reporte en PDF: ${p.downloadUrl}`,
    '',
    'Si tiene alguna pregunta sobre el servicio, no dude en responder a este correo o ponerse en contacto con nosotros.',
  );
  const signature = [p.brand.name, p.brand.siteUrl].filter(Boolean) as string[];
  if (signature.length) lines.push('', ...signature);
  return lines.join('\n');
};

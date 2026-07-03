// Renderers for the report-delivery email (§9). Spanish copy. This file computes the
// display values (dates in the customer's timezone, work-type label, signed location,
// timezone footnote) and delegates the HTML markup to ../constants/report-email.html.ts —
// the markup blob lives in constants/ to keep this renderer readable. The plain-text body
// is assembled here.

import { labelForTimezone } from '../../customers/constants/timezones';
import { reportEmailHtml } from '../constants/report-email.html';

const REPORT_TYPE_LABELS: Record<string, string> = {
  minisplit: 'Minisplit',
  chiller: 'Chiller',
  uma: 'UMA',
};

const fmtDate = (d: Date, timezone: string) =>
  new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(d);

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
  brand: {
    name: string;
    siteUrl: string;
    logoUrl: string;
  };
};

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

const workTypeLabel = (workType: string | null, reportType: string) =>
  workType && workType.trim().length > 0
    ? workType
    : (REPORT_TYPE_LABELS[reportType] ?? reportType);

export const renderReportEmailSubject = (folio: string) =>
  `Reporte de servicio ${folio} – Peña Nevada Chillers`;

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
    brand: p.brand,
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
    '',
    `${p.brand.name}`,
    `${p.brand.siteUrl}`,
  );
  return lines.join('\n');
};

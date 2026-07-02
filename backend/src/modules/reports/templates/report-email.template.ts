// HTML + plain-text email template for the report-delivery email (§9). Spanish copy.
// Email clients ignore <style> in many cases, so all CSS is inlined. Layout uses tables
// for maximum compatibility with Outlook/Gmail/Apple Mail.
//
// Timestamps are converted to the **customer's timezone** (carried in `ReportEmailParams`)
// and the zone is disclosed inside the email via a footnote, so the recipient is never
// guessing whose clock the times are on.

import { labelForTimezone } from '../../customers/constants/timezones';

const REPORT_TYPE_LABELS: Record<string, string> = {
  minisplit: 'Minisplit',
  chiller: 'Chiller',
  uma: 'UMA',
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

export const renderReportEmailHTML = (p: ReportEmailParams): string => {
  const finished = p.finishedAt ? fmtDate(p.finishedAt, p.timezone) : 'Sin registrar';
  const arrival = p.dateArrival ? fmtDate(p.dateArrival, p.timezone) : 'Sin registrar';
  const finishedBy = p.signedByName?.trim() || p.createdByName;
  const work = workTypeLabel(p.workType, p.reportType);
  const year = new Date().getUTCFullYear();
  const location = formatSignedLocation(p.signedLatitude, p.signedLongitude, p.signedAccuracy);
  const tzLabel = labelForTimezone(p.timezone);
  const locationRow = location
    ? `<br><strong style="color:#0c3a5e;">Ubicación de firma:</strong> <a href="${escapeHtml(location.url)}" target="_blank" rel="noopener" style="color:#0c3a5e;text-decoration:underline;">${escapeHtml(location.coords)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(`Reporte de servicio ${p.folio}`)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2233;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 32px 16px;border-bottom:1px solid #e5e9ef;" align="center">
              <img src="${escapeHtml(p.brand.logoUrl)}" alt="${escapeHtml(p.brand.name)}" width="180" height="auto" style="display:block;max-width:180px;height:auto;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:#0c3a5e;font-weight:600;">Reporte de servicio listo</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                Estimado/a ${escapeHtml(p.customerName)},
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                Hemos finalizado el servicio que solicitó. A continuación le compartimos los detalles, y al final encontrará el enlace para descargar el reporte completo en PDF.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f7f9fc;border-radius:6px;margin-bottom:8px;">
                <tr>
                  <td style="padding:20px;font-size:14px;line-height:1.7;color:#1a2233;">
                    <strong style="color:#0c3a5e;">Folio:</strong> ${escapeHtml(p.folio)}<br>
                    <strong style="color:#0c3a5e;">Tipo de servicio:</strong> ${escapeHtml(work)}<br>
                    <strong style="color:#0c3a5e;">Inicio del servicio:</strong> ${escapeHtml(arrival)}<br>
                    <strong style="color:#0c3a5e;">Iniciado por:</strong> ${escapeHtml(p.createdByName)}<br>
                    <strong style="color:#0c3a5e;">Finalización:</strong> ${escapeHtml(finished)}<br>
                    <strong style="color:#0c3a5e;">Finalizado por:</strong> ${escapeHtml(finishedBy)}${locationRow}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:11px;line-height:1.4;color:#7a8696;">
                Las horas mostradas están en horario ${escapeHtml(tzLabel)} (${escapeHtml(p.timezone)}).
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:32px auto;">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:#0c3a5e;">
                    <a href="${escapeHtml(p.downloadUrl)}" target="_blank"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                      Descargar reporte en PDF
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#5a6878;">
                Si tiene alguna pregunta sobre el servicio, no dude en responder a este correo o ponerse en contacto con nosotros.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background-color:#0c3a5e;color:#c8d4e1;font-size:12px;line-height:1.5;" align="center">
              <strong style="color:#ffffff;">${escapeHtml(p.brand.name)}</strong><br>
              <a href="${escapeHtml(p.brand.siteUrl)}" style="color:#ffffff;text-decoration:none;">${escapeHtml(p.brand.siteUrl.replace(/^https?:\/\//, ''))}</a>
            </td>
          </tr>
        </table>

        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
          © ${year} ${escapeHtml(p.brand.name)}. Este correo fue enviado a ${escapeHtml(p.recipientEmail)}.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

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

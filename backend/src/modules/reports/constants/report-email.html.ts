// HTML markup for the report-delivery email (§9). Kept in constants/ — separate from the
// rendering logic in ../templates/report-email.template.ts — so the markup blob does not
// clutter the renderer. This file owns the full HTML document, the location-row fragment,
// and HTML-escaping; the template computes the display values (dates, labels, timezone,
// signed location) and hands them here. Spanish copy; CSS inlined and table-based layout
// for Outlook/Gmail/Apple Mail compatibility.

export type ReportEmailHtmlView = {
  folio: string;
  customerName: string;
  recipientEmail: string;
  createdByName: string;
  finishedBy: string;
  work: string;
  arrival: string;
  finished: string;
  tzLabel: string;
  timezone: string;
  downloadUrl: string;
  location: { coords: string; url: string } | null;
  year: number;
  brand: {
    name: string;
    siteUrl: string;
    logoUrl: string;
  };
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const reportEmailHtml = (v: ReportEmailHtmlView): string => {
  const locationRow = v.location
    ? `<br><strong style="color:#0c3a5e;">Ubicación de firma:</strong> <a href="${escapeHtml(v.location.url)}" target="_blank" rel="noopener" style="color:#0c3a5e;text-decoration:underline;">${escapeHtml(v.location.coords)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(`Reporte de servicio ${v.folio}`)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2233;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 32px 16px;border-bottom:1px solid #e5e9ef;" align="center">
              <img src="${escapeHtml(v.brand.logoUrl)}" alt="${escapeHtml(v.brand.name)}" width="180" height="auto" style="display:block;max-width:180px;height:auto;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:#0c3a5e;font-weight:600;">Reporte de servicio listo</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                Estimado/a ${escapeHtml(v.customerName)},
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                Hemos finalizado el servicio que solicitó. A continuación le compartimos los detalles, y al final encontrará el enlace para descargar el reporte completo en PDF.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f7f9fc;border-radius:6px;margin-bottom:8px;">
                <tr>
                  <td style="padding:20px;font-size:14px;line-height:1.7;color:#1a2233;">
                    <strong style="color:#0c3a5e;">Folio:</strong> ${escapeHtml(v.folio)}<br>
                    <strong style="color:#0c3a5e;">Tipo de servicio:</strong> ${escapeHtml(v.work)}<br>
                    <strong style="color:#0c3a5e;">Inicio del servicio:</strong> ${escapeHtml(v.arrival)}<br>
                    <strong style="color:#0c3a5e;">Iniciado por:</strong> ${escapeHtml(v.createdByName)}<br>
                    <strong style="color:#0c3a5e;">Finalización:</strong> ${escapeHtml(v.finished)}<br>
                    <strong style="color:#0c3a5e;">Finalizado por:</strong> ${escapeHtml(v.finishedBy)}${locationRow}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:11px;line-height:1.4;color:#7a8696;">
                Las horas mostradas están en horario ${escapeHtml(v.tzLabel)} (${escapeHtml(v.timezone)}).
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:32px auto;">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:#0c3a5e;">
                    <a href="${escapeHtml(v.downloadUrl)}" target="_blank"
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
              <strong style="color:#ffffff;">${escapeHtml(v.brand.name)}</strong><br>
              <a href="${escapeHtml(v.brand.siteUrl)}" style="color:#ffffff;text-decoration:none;">${escapeHtml(v.brand.siteUrl.replace(/^https?:\/\//, ''))}</a>
            </td>
          </tr>
        </table>

        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
          © ${v.year} ${escapeHtml(v.brand.name)}. Este correo fue enviado a ${escapeHtml(v.recipientEmail)}.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

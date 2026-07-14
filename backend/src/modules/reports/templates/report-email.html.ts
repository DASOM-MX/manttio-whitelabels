// HTML markup for the report-delivery email (§9). This is the template asset (kept in
// templates/) — separate from the rendering logic in ../helpers/report-email.helpers.ts —
// so the markup blob does not clutter the renderer. This file owns the full HTML document,
// the location-row fragment,
// and HTML-escaping; the template computes the display values (dates, labels, timezone,
// signed location) and hands them here. Spanish copy; CSS inlined and table-based layout
// for Outlook/Gmail/Apple Mail compatibility.
//
// Colors arrive as a palette of hexes derived from the tenant brand scales (hex, not
// hsl() — Outlook's Word engine can't parse hsl()). Brand identity fields are optional:
// an absent logo/name/site renders nothing (rule 5 — hide, never fake).

export type EmailPalette = {
  /** Headings, labels, button + footer background (brand primary). */
  accent: string;
  pageBg: string;
  panelBg: string;
  bodyText: string;
  border: string;
  /** Timezone footnote. */
  footnote: string;
  /** Closing note under the button. */
  closing: string;
  /** Outer copyright line. */
  outerFooter: string;
  /** Footer base text over the accent background. */
  footerText: string;
};

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
    name?: string;
    siteUrl?: string;
    logoUrl?: string;
  };
  palette: EmailPalette;
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const reportEmailHtml = (v: ReportEmailHtmlView): string => {
  const p = v.palette;

  const locationRow = v.location
    ? `<br><strong style="color:${p.accent};">Ubicación de firma:</strong> <a href="${escapeHtml(v.location.url)}" target="_blank" rel="noopener" style="color:${p.accent};text-decoration:underline;">${escapeHtml(v.location.coords)}</a>`
    : '';

  const logoHeader = v.brand.logoUrl
    ? `<tr>
            <td style="padding:32px 32px 16px;border-bottom:1px solid ${p.border};" align="center">
              <img src="${escapeHtml(v.brand.logoUrl)}" alt="${escapeHtml(v.brand.name ?? '')}" width="180" height="auto" style="display:block;max-width:180px;height:auto;">
            </td>
          </tr>`
    : '';

  const footerName = v.brand.name
    ? `<strong style="color:#ffffff;">${escapeHtml(v.brand.name)}</strong>`
    : '';
  const footerSite = v.brand.siteUrl
    ? `<a href="${escapeHtml(v.brand.siteUrl)}" style="color:#ffffff;text-decoration:none;">${escapeHtml(v.brand.siteUrl.replace(/^https?:\/\//, ''))}</a>`
    : '';
  const brandFooter =
    footerName || footerSite
      ? `<tr>
            <td style="padding:24px 32px;background-color:${p.accent};color:${p.footerText};font-size:12px;line-height:1.5;" align="center">
              ${[footerName, footerSite].filter(Boolean).join('<br>\n              ')}
            </td>
          </tr>`
      : '';

  const copyright = v.brand.name ? `© ${v.year} ${escapeHtml(v.brand.name)}.` : `© ${v.year}.`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(`Reporte de servicio ${v.folio}`)}</title>
</head>
<body style="margin:0;padding:0;background-color:${p.pageBg};font-family:Arial,Helvetica,sans-serif;color:${p.bodyText};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${p.pageBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          ${logoHeader}
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:${p.accent};font-weight:600;">Reporte de servicio listo</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                Estimado/a ${escapeHtml(v.customerName)},
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
                Hemos finalizado el servicio que solicitó. A continuación le compartimos los detalles, y al final encontrará el enlace para descargar el reporte completo en PDF.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${p.panelBg};border-radius:6px;margin-bottom:8px;">
                <tr>
                  <td style="padding:20px;font-size:14px;line-height:1.7;color:${p.bodyText};">
                    <strong style="color:${p.accent};">Folio:</strong> ${escapeHtml(v.folio)}<br>
                    <strong style="color:${p.accent};">Tipo de servicio:</strong> ${escapeHtml(v.work)}<br>
                    <strong style="color:${p.accent};">Inicio del servicio:</strong> ${escapeHtml(v.arrival)}<br>
                    <strong style="color:${p.accent};">Iniciado por:</strong> ${escapeHtml(v.createdByName)}<br>
                    <strong style="color:${p.accent};">Finalización:</strong> ${escapeHtml(v.finished)}<br>
                    <strong style="color:${p.accent};">Finalizado por:</strong> ${escapeHtml(v.finishedBy)}${locationRow}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:11px;line-height:1.4;color:${p.footnote};">
                Las horas mostradas están en horario ${escapeHtml(v.tzLabel)} (${escapeHtml(v.timezone)}).
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:32px auto;">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:${p.accent};">
                    <a href="${escapeHtml(v.downloadUrl)}" target="_blank"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                      Descargar reporte en PDF
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${p.closing};">
                Si tiene alguna pregunta sobre el servicio, no dude en responder a este correo o ponerse en contacto con nosotros.
              </p>
            </td>
          </tr>
          ${brandFooter}
        </table>

        <p style="margin:16px 0 0;font-size:11px;color:${p.outerFooter};text-align:center;">
          ${copyright} Este correo fue enviado a ${escapeHtml(v.recipientEmail)}.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

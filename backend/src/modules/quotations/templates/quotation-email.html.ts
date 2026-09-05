// Markup for the quotation-delivery email (20 §4). Markup only — every display
// value arrives pre-formatted from ../helpers/quotation-email.helpers.ts, per
// the templates/-vs-helpers/ split.
//
// Table-based layout with inline styles because that is what email clients
// still parse: Outlook's Word renderer ignores flex/grid and most <style>
// blocks. Nothing here is shared with the app's CSS on purpose.

export type QuotationEmailPalette = {
  /** The brand name, the total, the CTA button (brand primary — primary is
   *  what the reader is meant to act on). */
  brandInk: string;
  /** The footer band (brand accent) — this document's one categorical cue
   *  (22 CP-1, plan 23 § palette roles). */
  accent: string;
  pageBg: string;
  panelBg: string;
  bodyText: string;
  border: string;
  muted: string;
  footerText: string;
};

export type QuotationEmailHtmlParams = {
  brandName: string;
  logoUrl?: string;
  greetingName?: string;
  folio: string;
  customerName: string;
  validUntil: string;
  total: string;
  lineCount: number;
  link: string;
  /** Optional note the sender typed in the send dialog. */
  message?: string;
  /** Reviewers get "revisa y responde"; everyone else gets a read-only framing.
   *  The copy has to differ — telling someone to approve a quote they have no
   *  token to approve is a support ticket. */
  isReviewer: boolean;
  /** Set only for a recipient with a live portal user — renders a second,
   *  smaller link under the CTA. Absent, the email is unchanged from before
   *  the portal existed (00 §3.9). */
  portalLink?: string;
  palette: QuotationEmailPalette;
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const quotationEmailHtml = (p: QuotationEmailHtmlParams): string => {
  const c = p.palette;
  const brand = escapeHtml(p.brandName);
  const cta = p.isReviewer ? 'Ver y responder' : 'Ver cotización';
  const lead = p.isReviewer
    ? `Te compartimos la cotización <strong>${escapeHtml(p.folio)}</strong> para tu revisión. Puedes aprobarla o rechazarla desde el enlace.`
    : `Te compartimos la cotización <strong>${escapeHtml(p.folio)}</strong> para tu referencia.`;

  const logoBlock = p.logoUrl
    ? `<img src="${escapeHtml(p.logoUrl)}" alt="${brand}" height="40" style="display:block;border:0;max-height:40px" />`
    : `<span style="font-size:18px;font-weight:600;color:${c.brandInk}">${brand}</span>`;

  const greeting = p.greetingName
    ? `<p style="margin:0 0 16px;font-size:15px;color:${c.bodyText}">Hola ${escapeHtml(p.greetingName)},</p>`
    : '';

  const messageBlock = p.message
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${c.bodyText};white-space:pre-line">${escapeHtml(p.message)}</p>`
    : '';

  const row = (label: string, value: string, strong = false) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:${c.muted}">${label}</td>
          <td style="padding:6px 0;font-size:${strong ? '16px' : '13px'};font-weight:${strong ? '600' : '400'};color:${strong ? c.brandInk : c.bodyText};text-align:right">${value}</td>
        </tr>`;

  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:${c.pageBg};font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.pageBg};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c.panelBg};border:1px solid ${c.border};border-radius:12px;overflow:hidden">
        <tr><td style="padding:24px 28px 8px">${logoBlock}</td></tr>
        <tr><td style="padding:0 28px 24px">
          ${greeting}
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${c.bodyText}">${lead}</p>
          ${messageBlock}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.pageBg};border:1px solid ${c.border};border-radius:10px;padding:14px 16px">
            ${row('Cliente', escapeHtml(p.customerName))}
            ${row('Partidas', String(p.lineCount))}
            ${row('Vigencia', escapeHtml(p.validUntil))}
            ${row('Total', escapeHtml(p.total), true)}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px">
            <tr><td style="background:${c.brandInk};border-radius:8px">
              <a href="${escapeHtml(p.link)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${cta}</a>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${c.muted}">
            El total es indicativo e incluye IVA según la tasa de cada partida. La cotización pierde vigencia el ${escapeHtml(p.validUntil)}.
          </p>
          ${
            p.portalLink
              ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${c.muted}">También puedes consultarla desde el <a href="${escapeHtml(p.portalLink)}" style="color:${c.accent}">portal de clientes</a>.</p>`
              : ''
          }
        </td></tr>
        <tr><td style="background:${c.accent};padding:16px 28px">
          <p style="margin:0;font-size:12px;color:${c.footerText}">${brand}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

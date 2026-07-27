// Renderers for the quotation-delivery email (20 §4). Computes the display
// values (money, dates, the public link) and derives the palette from the
// tenant brand scales, then delegates the markup to
// ../templates/quotation-email.html.ts. Brand identity is optional throughout:
// an absent logo falls back to the brand name, absent scales to neutrals.
//
// Explicit .ts extension on the template import: a specifier ending in `.html`
// matches wrangler's built-in Text-module rule and breaks `wrangler dev`.
import { hslToHex } from '../../brand/utils/hsl-color';
import { quotationEmailHtml } from '../templates/quotation-email.html.ts';
import type { QuotationEmailPalette } from '../templates/quotation-email.html.ts';
import type { BrandColors, HslScale } from '../../brand/dtos/brand.dto';

// A local palette rather than a shared one: the report email needs nine roles,
// this needs seven, and the two documents are free to diverge. If a third
// email lands, the extraction target is the generic `email/` module — not a
// cross-import between two domain modules.
const NEUTRAL_HEX_FALLBACKS: QuotationEmailPalette = {
  accent: '#1f2933',
  pageBg: '#f4f6f8',
  panelBg: '#ffffff',
  bodyText: '#2c333b',
  border: '#e2e6ea',
  muted: '#6b7280',
  footerText: '#d9dde2',
};

const hex = (scale: HslScale, step: string, fallback: string) =>
  hslToHex(scale[step] ?? '') ?? fallback;

const paletteFromBrand = (colors: BrandColors): QuotationEmailPalette => ({
  accent: hex(colors.primary, '800', NEUTRAL_HEX_FALLBACKS.accent),
  pageBg: hex(colors.surface, '100', NEUTRAL_HEX_FALLBACKS.pageBg),
  panelBg: hex(colors.surface, '0', NEUTRAL_HEX_FALLBACKS.panelBg),
  bodyText: hex(colors.surface, '900', NEUTRAL_HEX_FALLBACKS.bodyText),
  border: hex(colors.surface, '200', NEUTRAL_HEX_FALLBACKS.border),
  muted: hex(colors.surface, '500', NEUTRAL_HEX_FALLBACKS.muted),
  footerText: hex(colors.primary, '100', NEUTRAL_HEX_FALLBACKS.footerText),
});

/** MXN, es-MX. The quote's own totals are exact-decimal strings; this formats
 *  for display only and never feeds back into arithmetic. */
export const formatMoney = (amount: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(amount));

/** `validUntil` is a calendar date ('2026-08-01'). Formatted with an explicit
 *  UTC timezone so it renders as the day that was stored — parsing it as a
 *  local instant would show the previous day anywhere west of Greenwich. */
export const formatValidUntil = (isoDate: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );

export type QuotationEmailParams = {
  brand: { name?: string; logoUrl?: string; colors: BrandColors };
  apiBaseUrl: string;
  folio: string;
  customerName: string;
  contactName?: string;
  validUntil: string;
  total: string;
  lineCount: number;
  token: string;
  isReviewer: boolean;
  message?: string;
};

/** The public token page lives on the API, not the SPA (20 §4, decided
 *  2026-07-24) — same shape as `/reports/download/{token}`. */
export const quotationPublicLink = (apiBaseUrl: string, token: string) =>
  `${apiBaseUrl.replace(/\/+$/, '')}/public/quotations/${token}`;

export const renderQuotationEmailSubject = (p: QuotationEmailParams) =>
  `Cotización ${p.folio} · ${p.brand.name ?? 'Cotización'}`;

export const renderQuotationEmailHTML = (p: QuotationEmailParams) =>
  quotationEmailHtml({
    brandName: p.brand.name ?? 'Cotización',
    logoUrl: p.brand.logoUrl,
    greetingName: p.contactName,
    folio: p.folio,
    customerName: p.customerName,
    validUntil: formatValidUntil(p.validUntil),
    total: formatMoney(p.total),
    lineCount: p.lineCount,
    link: quotationPublicLink(p.apiBaseUrl, p.token),
    message: p.message,
    isReviewer: p.isReviewer,
    palette: paletteFromBrand(p.brand.colors),
  });

/** Plain-text alternative. Not optional politeness: a text/plain part measurably
 *  improves deliverability, and some clients render nothing else. */
export const renderQuotationEmailText = (p: QuotationEmailParams) => {
  const lines = [
    p.contactName ? `Hola ${p.contactName},` : 'Hola,',
    '',
    p.isReviewer
      ? `Te compartimos la cotización ${p.folio} para tu revisión. Puedes aprobarla o rechazarla desde el enlace.`
      : `Te compartimos la cotización ${p.folio} para tu referencia.`,
    '',
    p.message ? `${p.message}\n` : '',
    `Cliente: ${p.customerName}`,
    `Partidas: ${p.lineCount}`,
    `Vigencia: ${formatValidUntil(p.validUntil)}`,
    `Total: ${formatMoney(p.total)}`,
    '',
    quotationPublicLink(p.apiBaseUrl, p.token),
    '',
    'El total es indicativo e incluye IVA según la tasa de cada partida.',
  ];
  return lines.filter((l) => l !== '').join('\n');
};

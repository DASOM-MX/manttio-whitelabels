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
// this needs eight, and the two documents are free to diverge. If a third
// email lands, the extraction target is the generic `email/` module — not a
// cross-import between two domain modules.
//
// The chrome neutral left the brand contract (22 § Target 3), so these stopped
// being fallbacks and became the values: the fixed grayscale ramp's steps
// 100 / 0 / 900 / 200 / 500, materialized as hex (Outlook's Word engine can't
// parse hsl()).
const FIXED_NEUTRALS = {
  pageBg: '#f5f5f5',
  panelBg: '#fafafa',
  bodyText: '#2e2e2e',
  border: '#e6e6e6',
  muted: '#8c8c8c',
} as const;

// The two brand-driven roles still need a fail-soft: a scale value that
// doesn't parse falls back to a neutral ink rather than dropping the style.
const NEUTRAL_BRAND_FALLBACKS = {
  brandInk: '#1f2933',
  accent: '#1f2933',
  footerText: '#d9dde2',
} as const;

const hex = (scale: HslScale, step: string, fallback: string) =>
  hslToHex(scale[step] ?? '') ?? fallback;

const paletteFromBrand = (colors: BrandColors): QuotationEmailPalette => ({
  ...FIXED_NEUTRALS,
  brandInk: hex(colors.primary, '800', NEUTRAL_BRAND_FALLBACKS.brandInk),
  accent: hex(colors.accent, '800', NEUTRAL_BRAND_FALLBACKS.accent),
  footerText: hex(colors.accent, '100', NEUTRAL_BRAND_FALLBACKS.footerText),
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
  /** Set only for a recipient contact with a **live** portal user (superadmin
   *  26 §6 rollout companion). A contact with no portal access gets no
   *  mention of it — the token page stays their only entrance (00 §3.9). */
  portalLink?: string;
};

/** The public token page lives on the API, not the SPA (20 §4, decided
 *  2026-07-24) — same shape as `/reports/download/{token}`. */
export const quotationPublicLink = (apiBaseUrl: string, token: string) =>
  `${apiBaseUrl.replace(/\/+$/, '')}/public/quotations/${token}`;

/** Where a recipient with portal access can also log in — a *second*
 *  entrance the email offers alongside the token link, never a replacement
 *  for it (00 §3.9). Same construction as the invite/reset emails
 *  (`portal/helpers/portal-email.helpers.ts`). */
export const portalLoginLink = (portalBaseUrl: string) =>
  new URL('/login', portalBaseUrl).toString();

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
    portalLink: p.portalLink,
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
    ...(p.portalLink
      ? ['', `También puedes consultarla desde el portal de clientes: ${p.portalLink}`]
      : []),
  ];
  return lines.filter((l) => l !== '').join('\n');
};

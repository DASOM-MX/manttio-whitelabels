import { QuotationResponse, QuotationStatus } from '../enums/quotations.enum';
// The `.ts` is load-bearing, and every other template import spells it out for
// the same reason: without it wrangler matches the `.html` specifier against its
// default Text module rule, bundles the template as a text asset, and the Worker
// dies at startup on `does not provide an export named 'approvalPageHTML'`.
import { approvalPageHTML } from '../templates/quotation-approval-page.html.ts';
import { formatMoney as money } from './quotation-email.helpers';
import type { Brand } from '../../brand/dtos/brand.dto';
import type { PublicQuotationDTO } from '../types/quotations.types';

/** Error codes the form redirect can carry back (`?e=`). Unknown values render
 *  nothing — the query string is caller-controlled. */
export type ApprovalPageError = 'reason_required' | 'invalid' | 'not_a_reviewer' | 'closed';

const esc = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const trimQuantity = (q: string): string => (q.includes('.') ? q.replace(/\.?0+$/, '') : q);

// The email's formatter (Intl es-MX): thousands separators — one formatter
// for every client-facing surface, so they can never disagree.


const ERROR_COPY: Record<ApprovalPageError, string> = {
  reason_required: 'Para rechazar, cuéntanos brevemente el motivo.',
  invalid: 'No pudimos leer tu respuesta; inténtalo de nuevo.',
  not_a_reviewer: 'Este enlace es solo de consulta; no permite aprobar ni rechazar.',
  closed: 'La cotización ya no puede responderse.',
};

/** The brand accent for buttons/links: the primary-600 HSL triple when the
 *  scale parses, a neutral slate otherwise. */
const accentOf = (brand: Brand): string => {
  const step = brand.colors.primary['600'];
  return step ? `hsl(${step})` : '#334155';
};

/** Fills the approval page (20 §4) from the same DTO the JSON surface serves —
 *  one source of truth for what a recipient may see. Renderer only: all markup
 *  lives in `templates/`, and every dynamic string is escaped here. */
export const renderQuotationApprovalPage = (
  view: PublicQuotationDTO,
  brand: Brand,
  tokenPath: string,
  error?: ApprovalPageError,
): string => {
  const linesRows = view.lines
    .map((line) => {
      const name = line.description
        ? `${esc(line.serviceName)}<br /><span class="muted">${esc(line.description)}</span>`
        : esc(line.serviceName);
      const discount = line.discountAmount === '0.00' ? '—' : `−${money(line.discountAmount)}`;
      return `<tr><td>${name}</td><td class="num">${trimQuantity(line.quantity)}</td><td class="num">${money(line.unitPrice)}</td><td class="num">${discount}</td><td class="num">${money(line.lineSubtotal)}</td></tr>`;
    })
    .join('');

  const totalsRows = [
    `<tr><td></td><td class="num muted">Subtotal</td><td class="num">${money(view.totals.subtotal)}</td></tr>`,
    view.totals.discount !== '0.00'
      ? `<tr><td></td><td class="num muted">Descuento</td><td class="num">−${money(view.totals.discount)}</td></tr>`
      : '',
    `<tr><td></td><td class="num muted">IVA</td><td class="num">${money(view.totals.iva)}</td></tr>`,
    `<tr class="grand"><td></td><td class="num">Total</td><td class="num">${money(view.totals.total)}</td></tr>`,
  ].join('');

  const termsBlock = view.comments
    ? `<h2 style="font-size:14px;margin:20px 0 4px">Términos y condiciones</h2><p class="muted" style="white-space:pre-line">${esc(view.comments)}</p>`
    : '';

  // Why the quote can't be answered (or who answered what) — always said out
  // loud rather than a form that silently isn't there.
  const answered = view.viewer.response
    ? `<div class="card"><span class="pill">${view.viewer.response === QuotationResponse.Approved ? 'Aprobaste esta cotización' : 'Rechazaste esta cotización'}</span>${view.viewer.responseReason ? `<p class="muted" style="margin:8px 0 0">Motivo: ${esc(view.viewer.responseReason)}</p>` : ''}${view.canRespond ? '<p class="muted" style="margin:8px 0 0">Puedes cambiar tu respuesta mientras la cotización siga abierta.</p>' : ''}</div>`
    : '';
  const closedNote = !view.canRespond
    ? view.viewer.isReviewer
      ? view.isOverdue
        ? '<div class="card"><p class="muted" style="margin:0">La cotización venció y ya no puede responderse; si sigue interesándote, pide una versión actualizada.</p></div>'
        : view.status === QuotationStatus.Cancelled || view.status === QuotationStatus.OrderCreated
          ? '<div class="card"><p class="muted" style="margin:0">Esta cotización ya fue resuelta y no admite más respuestas.</p></div>'
          : ''
      : '<div class="card"><p class="muted" style="margin:0">Esta es una copia informativa: puedes consultarla, pero la decisión está a cargo de los revisores.</p></div>'
    : '';

  const actionBlock = view.canRespond
    ? `<div class="card"><form method="post" action="${tokenPath}/respond">
<p style="margin:0 0 4px;font-weight:600">¿Apruebas esta cotización?</p>
<p class="muted" style="margin:0">Antes de rechazar, ayúdanos a saber cómo mejorar esta cotización.</p>
<textarea name="reason" placeholder="Motivo (obligatorio al rechazar)"></textarea>
<div class="actions">
<button class="approve" type="submit" name="response" value="${QuotationResponse.Approved}">Aprobar</button>
<button class="decline" type="submit" name="response" value="${QuotationResponse.Declined}">Rechazar</button>
</div></form></div>`
    : '';

  return approvalPageHTML({
    brandName: esc(brand.name),
    logoImg: brand.logoUrl
      ? `<img src="${esc(brand.logoUrl)}" alt="" style="height:36px;width:auto" />`
      : '',
    accent: accentOf(brand),
    folio: esc(view.folio),
    customerName: esc(view.customerName),
    validUntil: esc(view.validUntil),
    banner: error && ERROR_COPY[error] ? `<div class="banner" role="alert">${ERROR_COPY[error]}</div>` : '',
    linesRows,
    totalsRows,
    termsBlock,
    standingBlock: answered + closedNote,
    actionBlock,
    pdfHref: `${tokenPath}/pdf`,
  });
};

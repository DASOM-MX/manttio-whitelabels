import {
  createRenderer,
  drawRow,
  drawSectionHeader,
  embedImageFromUrl,
  ensureSpace,
} from '../../pdf/services/pdf.service';
import { CONTENT_WIDTH, MARGIN } from '../../pdf/constants/pdf-layout';
import { pdfThemeFromBrand } from '../../reports/helpers/report-pdf.helpers';
import { formatMoney as money } from './quotation-email.helpers';
import { ServiceTaxRate } from '../../services/enums/services.enum';
import type { Brand } from '../../brand/dtos/brand.dto';
import type { QuotationLineDTO } from '../types/quotations.types';
import type { QuotationTotals } from '../utils/quotation-totals';

/** What the quote document needs — satisfied by both the staff detail DTO and
 *  the public token DTO, so the send flow and `/{token}/pdf` share one layout. */
export interface QuotationPdfParams {
  brand: Brand;
  folio: string;
  customerName: string;
  validUntil: string;
  comments?: string;
  lines: QuotationLineDTO[];
  totals: QuotationTotals;
}

const TAX_LABEL: Record<ServiceTaxRate, string> = {
  [ServiceTaxRate.Iva16]: '16%',
  [ServiceTaxRate.Iva8]: '8%',
  [ServiceTaxRate.Iva0]: '0%',
  [ServiceTaxRate.Exento]: 'Exento',
};

/** `numeric(12,3)` renders "2.000" — trim the phantom decimals for print. */
const trimQuantity = (q: string): string => (q.includes('.') ? q.replace(/\.?0+$/, '') : q);

// The email's formatter (Intl es-MX): "$18,500.00", not "$18500.00" — one
// formatter for every client-facing surface, so they can never disagree.


// Servicio · Cant. · Unidad · P. unitario · Desc. · IVA · Importe
const LINE_WIDTHS = [170, 42, 55, 76, 66, 47, 76];
const TOTAL_LABEL_W = CONTENT_WIDTH - 152 - 76;

/** The client-facing cotización (20 CP-3) — brand-themed off the tenant scales
 *  like the report PDF, laid out from the same frozen lines and CFDI-shaped
 *  totals the page and the app show. Never stored: totals are computed, so the
 *  document regenerates per request and cannot drift from the data. */
export const renderQuotationPDF = async (p: QuotationPdfParams): Promise<Uint8Array> => {
  const r = await createRenderer(pdfThemeFromBrand(p.brand));

  // Brand strip: logo (when the tenant has one) + name. Same tolerance as the
  // report header — a missing/broken logo just leaves the name.
  const logo = p.brand.logoUrl ? await embedImageFromUrl(r.doc, p.brand.logoUrl) : null;
  if (logo) {
    const h = 34;
    const w = (logo.width / logo.height) * h;
    r.page.drawImage(logo, { x: MARGIN, y: r.y - h, width: Math.min(w, 160), height: h });
    r.y -= h + 8;
  }
  drawRow(r, [CONTENT_WIDTH], [{ text: p.brand.name, bold: true, border: false }], 13);
  drawSectionHeader(r, `COTIZACIÓN ${p.folio}`);

  drawRow(r, [120, CONTENT_WIDTH - 120], [
    { text: 'Cliente', bold: true, fill: r.theme.fill },
    { text: p.customerName },
  ]);
  drawRow(r, [120, CONTENT_WIDTH - 120], [
    { text: 'Vigencia', bold: true, fill: r.theme.fill },
    { text: `Válida hasta el ${p.validUntil}` },
  ]);

  r.y -= 10;
  drawSectionHeader(r, 'Partidas');
  drawRow(
    r,
    LINE_WIDTHS,
    [
      { text: 'Servicio', bold: true, fill: r.theme.fill },
      { text: 'Cant.', bold: true, fill: r.theme.fill, align: 'right' },
      { text: 'Unidad', bold: true, fill: r.theme.fill },
      { text: 'P. unitario', bold: true, fill: r.theme.fill, align: 'right' },
      { text: 'Descuento', bold: true, fill: r.theme.fill, align: 'right' },
      { text: 'IVA', bold: true, fill: r.theme.fill, align: 'right' },
      { text: 'Importe', bold: true, fill: r.theme.fill, align: 'right' },
    ],
    8,
  );
  for (const line of p.lines) {
    const name = line.description ? `${line.serviceName} — ${line.description}` : line.serviceName;
    drawRow(
      r,
      LINE_WIDTHS,
      [
        { text: name },
        { text: trimQuantity(line.quantity), align: 'right' },
        { text: line.uom },
        { text: money(line.unitPrice), align: 'right' },
        { text: line.discountAmount === '0.00' ? '—' : money(line.discountAmount), align: 'right' },
        { text: TAX_LABEL[line.taxRate], align: 'right' },
        { text: money(line.lineSubtotal), align: 'right' },
      ],
      8,
    );
  }

  // CFDI-shaped totals: SubTotal (pre-discount) − Descuento + IVA.
  r.y -= 6;
  const totalRow = (label: string, value: string, bold = false) =>
    drawRow(r, [TOTAL_LABEL_W, 152, 76], [
      { text: '', border: false },
      { text: label, bold, align: 'right' },
      { text: value, bold, align: 'right' },
    ]);
  totalRow('Subtotal', money(p.totals.subtotal));
  if (p.totals.discount !== '0.00') totalRow('Descuento', `−${money(p.totals.discount)}`);
  totalRow('IVA', money(p.totals.iva));
  totalRow('Total', money(p.totals.total), true);

  if (p.comments) {
    r.y -= 12;
    ensureSpace(r, 40);
    drawSectionHeader(r, 'Términos y condiciones');
    drawRow(r, [CONTENT_WIDTH], [{ text: p.comments }], 8);
  }

  return r.doc.save();
};

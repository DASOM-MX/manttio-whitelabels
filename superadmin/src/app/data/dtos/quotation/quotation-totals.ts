/** Computed from the frozen lines, never stored. CFDI 4.0 shape (20 §3):
 *  `subtotal` = Σ pre-discount importes, `discount` = Σ per-line discount
 *  amounts, IVA summed **per line** on the net base — the way CFDI rounds per
 *  concepto. */
export interface QuotationTotals {
  subtotal: string;
  discount: string;
  iva: string;
  total: string;
}

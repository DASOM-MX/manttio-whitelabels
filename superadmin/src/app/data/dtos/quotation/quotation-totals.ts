/** Computed from the frozen lines, never stored. IVA is summed **per line**
 *  (20 §3), the way CFDI rounds per concepto. */
export interface QuotationTotals {
  subtotal: string;
  iva: string;
  total: string;
}

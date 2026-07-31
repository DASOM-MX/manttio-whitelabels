// Static markup for the public approval page (20 §4, CP-3) — a self-contained
// server-rendered document: inline styles, no scripts, no app bundle. The
// renderer in `helpers/quotation-approval-page.helpers.ts` fills the slots;
// every dynamic string arrives ALREADY ESCAPED.

export interface ApprovalPageSlots {
  brandName: string;
  logoImg: string;
  accent: string;
  folio: string;
  customerName: string;
  validUntil: string;
  banner: string;
  linesRows: string;
  totalsRows: string;
  termsBlock: string;
  standingBlock: string;
  actionBlock: string;
  pdfHref: string;
}

export const approvalPageHTML = (s: ApprovalPageSlots): string => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Cotización ${s.folio} — ${s.brandName}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f5f7; color: #1e2430; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(16,24,40,.08); padding: 24px; margin-top: 16px; }
  .brand { display: flex; align-items: center; gap: 12px; padding-top: 8px; }
  .brand strong { font-size: 18px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #5b6472; font-size: 14px; }
  .banner { border-radius: 8px; padding: 12px 14px; font-size: 14px; margin-top: 16px; border: 1px solid #e5c76b; background: #fdf6e3; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px; }
  th { text-align: left; color: #5b6472; font-weight: 600; font-size: 12px; padding: 6px 8px; border-bottom: 1px solid #e4e7ec; }
  td { padding: 8px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals td { border: 0; padding: 3px 8px; }
  .totals .grand td { font-weight: 700; border-top: 1px solid #e4e7ec; padding-top: 8px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  button { border: 0; border-radius: 8px; padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer; }
  .approve { background: ${s.accent}; color: #fff; }
  .decline { background: #fff; color: #b42318; border: 1px solid #f0b4ad; }
  textarea { width: 100%; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 8px; padding: 10px; font: inherit; margin-top: 6px; min-height: 72px; }
  .pill { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 13px; font-weight: 600; background: #eef0f3; }
  a.pdf { color: ${s.accent}; font-weight: 600; text-decoration: none; font-size: 14px; }
  /* Script-free decline gate: while the reason textarea is empty
     (:placeholder-shown), Rechazar greys out and stops taking clicks. Browsers
     without :has() simply keep the server's reason_required bounce as the
     guard — same rule, enforced one hop later. */
  form:has(textarea:placeholder-shown) .decline { opacity: 0.45; pointer-events: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">${s.logoImg}<strong>${s.brandName}</strong></div>
  ${s.banner}
  <div class="card">
    <h1>Cotización ${s.folio}</h1>
    <p class="muted">Para ${s.customerName} · Válida hasta el ${s.validUntil} · <a class="pdf" href="${s.pdfHref}">Descargar PDF</a></p>
    <table>
      <thead><tr><th>Servicio</th><th class="num">Cant.</th><th class="num">P. unitario</th><th class="num">Descuento</th><th class="num">Importe</th></tr></thead>
      <tbody>${s.linesRows}</tbody>
    </table>
    <table class="totals">${s.totalsRows}</table>
    ${s.termsBlock}
  </div>
  ${s.standingBlock}
  ${s.actionBlock}
</div>
</body>
</html>`;

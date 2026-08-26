/** Route-param constraint for report id path segments.
 *
 *  Reports do not use a uuid primary key. `reports.id` is `text`, holding the
 *  per-day folio `formatReportId` mints — `R-20260826-0001` — because the folio
 *  is the number printed on the PDF and quoted to the client, so it *is* the
 *  identity rather than a display field beside one. Constraining these routes
 *  with `UUID_PARAM` therefore 404s every real report; see the note in
 *  `uuid-param.ts` for what the constraint buys and how a non-match falls
 *  through to the global `notFound`.
 *
 *  The sequence is `padStart(4, '0')` but is not capped at four digits — a day
 *  past 9999 reports keeps counting — so the tail is `\d{4,}`, not `\d{4}`.
 *
 *  Usage — the path must be a template literal:
 *    `reports.get(\`/:id{${REPORT_ID_PARAM}}/pdf\`, handler)`
 *
 *  `report_emails.id` is a real uuid and stays on `UUID_PARAM`; only the report
 *  folio itself belongs here, including where another module references one
 *  (`equipment`'s `:reportId`).
 */
export const REPORT_ID_PARAM = 'R-\\d{8}-\\d{4,}';

/** One entry of `GET /customers/all` (21 §3) — the whole live roster, the
 *  unpaged read behind the directory, the report-add picker and the reports
 *  list's per-row date formatting.
 *
 *  Deliberately narrower than `CustomerRow`: the roster is the one customer
 *  read with no page and no limit, so it carries only what those three surfaces
 *  render. `observation`, `address` and the timestamps are absent — the edit
 *  page reads the full row from `GET /customers/:id`, never from here.
 *
 *  `contactName` and `status` are optional so a full `CustomerRow` (which has
 *  neither) still satisfies this type when `LoadCustomer` writes one into the
 *  same entity map. Nullable columns arrive as `null`, not absent — this is the
 *  raw row projection with no DTO layer in between. */
export interface CustomerOption {
  id: string;
  name: string;
  contactName?: string | null;
  razonSocial: string | null;
  identification: string | null;
  phone: string | null;
  email: string | null;
  state: string | null;
  status?: string;
  timezone: string;
}

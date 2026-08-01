import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import { isAdminTier } from '../../auth/utils/role-tier';
import {
  findQuotationWithCustomer,
  listLinesForQuotations,
  listRecipientsForQuotations,
} from '../../quotations/repository/quotations.repository';
import { isLiveStatus, QuotationResponse } from '../../quotations/enums/quotations.enum';
import { QuotationNotLiveError } from '../../quotations/http-errors/quotations.error';
import { isOverdue } from '../../quotations/services/quotations.service';
import type { QuotationLineRow } from '../../quotations/types/quotations.types';
import type { ReportType } from '../../reports/enums/reports.enum';
import {
  createServiceOrderFromQuotation,
  defaultReportCount,
  MAX_EXPLODED_REPORTS,
} from '../repository/service-orders.repository';
import { findReportSourceFlags } from '../../services/repository/services.repository';
import { getServiceOrderById } from './service-orders.service';
import {
  AssignmentCoverageError,
  ExplosionTooLargeError,
  MissingExplosionInputsError,
  QuotationApprovalGateError,
  QuotationExpiredError,
} from '../http-errors/order-from-quotation.error';
import type { ConvertQuotationInput } from '../../quotations/validators/quotations.validator';
import type { FrozenOrderLine, ServiceOrderDetailDTO } from '../types/service-orders.types';



/** An assignment as the caller sends it, keyed by service (catalog lines, which
 *  merge per service) or by quotation line (off-catalog ones, which never do). */
type Assignment = {
  technicianId?: string;
  reportType?: ReportType;
  reportCount?: number;
};

/** A quote may carry several lines for one service (same snapshot moment,
 *  different description) — the order model may not (one line per service,
 *  quantity is how you sell more). Merging sums the quantities, the discounts
 *  and the report counts, and keeps the first line's snapshot: all lines of one
 *  quote freeze the catalog in the same transaction (create and PATCH both
 *  write the set wholesale), so the money fields are identical across the group
 *  by construction.
 *
 *  **Off-catalog lines never merge** — they carry no service to merge on, and
 *  the unique index tolerates them because Postgres treats NULLs as distinct. */
const mergeQuoteLines = (
  quoteLines: QuotationLineRow[],
  assignmentFor: (line: QuotationLineRow) => Assignment,
  reportSourceOf: (serviceId: string) => boolean | undefined,
): FrozenOrderLine[] => {
  const merged = new Map<string, FrozenOrderLine>();
  for (const line of quoteLines) {
    const assignment = assignmentFor(line);
    const reportCount =
      assignment.reportCount ?? defaultReportCount(
        line.serviceId ? reportSourceOf(line.serviceId) : false,
        line.quantity,
      );
    // Off-catalog lines key on their own id so they stay separate rows.
    const key = line.serviceId ?? `line:${line.id}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = addDecimal(existing.quantity, line.quantity);
      existing.discountAmount = addDecimal(existing.discountAmount, line.discountAmount);
      existing.reportCount += reportCount;
      continue;
    }
    merged.set(key, {
      serviceId: line.serviceId,
      serviceName: line.serviceName,
      uom: line.uom,
      taxRate: line.taxRate,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      reportCount,
      technicianId: assignment.technicianId ?? null,
      reportType: assignment.reportType ?? null,
    });
  }
  return [...merged.values()];
};

/** Sums two exact-decimal strings without ever touching a float — the merge is
 *  the one place order quantities and discounts are added. */
const addDecimal = (a: string, b: string): string => {
  const scale = (v: string) => {
    const [whole = '0', frac = ''] = v.trim().split('.');
    return Number(whole) * 1000 + Number(`${frac}000`.slice(0, 3));
  };
  const sum = scale(a) + scale(b);
  return `${Math.trunc(sum / 1000)}.${String(sum % 1000).padStart(3, '0')}`;
};

/** The convergence (20 §6): gates first against a plain read — live status,
 *  expiry, the approval gate, assignment coverage, the explosion bound — then
 *  the one transaction that opens the order off the quote's frozen snapshots
 *  and flips the quote to `order_created`. Returns the order detail (the UI
 *  navigates straight to it); null when the quotation doesn't exist. */
export const createOrderFromQuotation = async (
  db: Db,
  user: AuthUser,
  quotationId: string,
  input: ConvertQuotationInput,
): Promise<ServiceOrderDetailDTO | null> => {
  const found = await findQuotationWithCustomer(db, quotationId);
  if (!found) return null;
  const { quotation } = found;

  if (!isLiveStatus(quotation.status)) throw new QuotationNotLiveError(quotation.status);
  // Past validity the prices may be stale — staff revise instead (20 §2). The
  // check is date-only in the tenant's reckoning, same as the reviewer page.
  if (isOverdue(quotation.validUntil)) throw new QuotationExpiredError(quotation.validUntil);

  // The approval gate (20 §7): ≥1 reviewer approval admits any staff role;
  // zero approvals is an owner/admin override — allowed (a declined or
  // never-reviewed quote can still become work) but flagged on the trail.
  const recipients = await listRecipientsForQuotations(db, [quotationId]);
  const approvedCount = recipients.filter(
    (r) => r.recipient.isReviewer && r.recipient.response === QuotationResponse.Approved,
  ).length;
  const override = approvedCount === 0;
  if (override && !isAdminTier(user)) throw new QuotationApprovalGateError();

  // Coverage: one assignment per distinct quoted service, plus one per
  // off-catalog line (which has no service to key on) — exactly (19 §2, the
  // explosion inputs are captured up front so the skeletons are born complete).
  const quoteLines = await listLinesForQuotations(db, [quotationId]);
  const quotedKeys = new Set(
    quoteLines.map((l) => l.serviceId ?? `line:${l.id}`),
  );
  const assignments = new Map(
    input.assignments.map((a) => [
      a.serviceId ?? `line:${a.lineId}`,
      { technicianId: a.technicianId, reportType: a.reportType, reportCount: a.reportCount },
    ]),
  );
  const missing = [...quotedKeys].filter((key) => !assignments.has(key));
  const unknown = [...assignments.keys()].filter((key) => !quotedKeys.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    throw new AssignmentCoverageError(missing, unknown);
  }

  // `isReportSource` decides the DEFAULT count per line (owner 2026-07-31); an
  // explicit `reportCount` on the assignment overrides it in either direction.
  const catalogIds = [...new Set(quoteLines.flatMap((l) => (l.serviceId ? [l.serviceId] : [])))];
  const flags = await findReportSourceFlags(db, catalogIds);
  const reportSource = new Map(flags.map((r) => [r.id, r.isReportSource]));

  const lines = mergeQuoteLines(
    quoteLines,
    (line) => assignments.get(line.serviceId ?? `line:${line.id}`) ?? {},
    (serviceId) => reportSource.get(serviceId),
  );

  // A line that explodes reports must name who does them and what kind — the
  // report invariants 19 §2 keeps. A line that explodes none needs neither,
  // which is exactly what makes a materials-only line convertible.
  const unassigned = lines.find((l) => l.reportCount > 0 && (!l.technicianId || !l.reportType));
  if (unassigned) throw new MissingExplosionInputsError(unassigned.serviceName);

  const totalUnits = lines.reduce((sum, l) => sum + l.reportCount, 0);
  if (totalUnits > MAX_EXPLODED_REPORTS) throw new ExplosionTooLargeError(totalUnits);

  const { order } = await createServiceOrderFromQuotation(db, {
    quotationId,
    quotationFolio: quotation.folio,
    customerId: quotation.customerId,
    location: input.location || null,
    comment: input.comment,
    lines,
    actorId: user.id,
    approvedCount,
    override,
  });

  // Re-read through the detail path so the response is byte-identical to a
  // subsequent GET.
  const created = await getServiceOrderById(db, user, order.id);
  if (!created) throw new Error('createOrderFromQuotation: created order not readable');
  return created;
};

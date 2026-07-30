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
import { createServiceOrderFromQuotation } from '../repository/service-orders.repository';
import { getServiceOrderById } from './service-orders.service';
import {
  AssignmentCoverageError,
  ExplosionTooLargeError,
  QuotationApprovalGateError,
  QuotationExpiredError,
} from '../http-errors/order-from-quotation.error';
import type { ConvertQuotationInput } from '../../quotations/validators/quotations.validator';
import type { FrozenOrderLine, ServiceOrderDetailDTO } from '../types/service-orders.types';

/** The direct path's validator caps an order at 50 exploded reports; the quote
 *  path inherits its quantities from the quotation, so the same bound is
 *  enforced here instead (19 §2 caps, 2026-07-27). */
const MAX_EXPLODED_REPORTS = 50;

/** A quote may carry several lines for one service (same snapshot moment,
 *  different description) — the order model may not (one line per service,
 *  quantity is how you sell more). Merging sums the quantities and keeps the
 *  first line's snapshot: all lines of one quote freeze the catalog in the same
 *  transaction (create and PATCH both write the set wholesale), so the money
 *  fields are identical across the group by construction. */
const mergeQuoteLines = (
  quoteLines: QuotationLineRow[],
  assignments: Map<string, { technicianId: string; reportType: ReportType }>,
): FrozenOrderLine[] => {
  const merged = new Map<string, FrozenOrderLine>();
  for (const line of quoteLines) {
    const existing = merged.get(line.serviceId);
    if (existing) {
      existing.quantity += line.quantity;
      continue;
    }
    const assignment = assignments.get(line.serviceId)!;
    merged.set(line.serviceId, {
      serviceId: line.serviceId,
      serviceName: line.serviceName,
      uom: line.uom,
      taxRate: line.taxRate,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      technicianId: assignment.technicianId,
      reportType: assignment.reportType,
    });
  }
  return [...merged.values()];
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

  // Coverage: one assignment per distinct quoted service — exactly (19 §2, the
  // explosion inputs are captured up front so the skeletons are born complete).
  const quoteLines = await listLinesForQuotations(db, [quotationId]);
  const quotedServiceIds = new Set(quoteLines.map((l) => l.serviceId));
  const assignments = new Map(
    input.assignments.map((a) => [a.serviceId, { technicianId: a.technicianId, reportType: a.reportType }]),
  );
  const missing = [...quotedServiceIds].filter((id) => !assignments.has(id));
  const unknown = [...assignments.keys()].filter((id) => !quotedServiceIds.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    throw new AssignmentCoverageError(missing, unknown);
  }

  const lines = mergeQuoteLines(quoteLines, assignments);
  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);
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

import type { portalUsers } from '../models/portal-users.model';
import type { PortalEquipmentLinkedServiceRequest } from '../dtos/portal-equipment.dto';
import type { PortalLinkedReport } from '../dtos/portal-report.dto';
import type {
  PortalQuotationLine,
  PortalQuotationReviewer,
} from '../dtos/portal-quotation.dto';
import type { PortalServiceOrderLine } from '../dtos/portal-service-order.dto';
import type { PortalGrant } from '../enums/portal-grants.enum';

/** The portal JWT's claim set (02 §1). Signed with `PORTAL_JWT_SECRET`, never
 *  the staff secret, and `typ` is the discriminator that keeps the two surfaces
 *  apart: `portalJwtMiddleware` rejects anything without it, so a staff token
 *  cannot reach `/portal/*` even if both surfaces were given the same secret.
 *
 *  `cid` is the customer scope at issue time. It is validated on every request
 *  but deliberately not trusted as the scope — `portalJwtMiddleware` reads
 *  `customerId` from the database row instead, so a token can never widen its
 *  own reach. */
export type PortalTokenPayload = {
  /** The portal user's id. */
  sub: string;
  /** The customer this user belongs to, as of issue time. */
  cid: string;
  typ: 'portal';
};

export type NewPortalUser = {
  contactId: string;
  customerId: string;
  email: string;
  passwordHash: string;
  name: string;
  paternalLastName?: string | null;
  maternalLastName?: string | null;
  role?: string | null;
  isAdmin: boolean;
  invitedBy: string | null;
};


/** A `portal_users` row with the two joins and the grant set the tenant-wide
 *  list needs (superadmin 26 §1). The repository shape — the controller maps it
 *  to `PortalUserListItem`, which is what actually goes on the wire. */
export type PortalUserListRow = typeof portalUsers.$inferSelect & {
  customerName: string | null;
  invitedByName: string | null;
  grants: PortalGrant[];
};

// ---------------------------------------------------------------------------
// Mapper inputs (02 CP-3). Each names the joins its `portal/helpers` mapper
// needs beyond the staff row — the row alone can never satisfy a portal DTO.
// ---------------------------------------------------------------------------

/** Both report mappers take the same set. */
export interface PortalReportExtras {
  technicianName: string | null;
  equipmentNames: string[];
}

/** `total` is summed from the lines. */
export interface PortalQuotationListExtras {
  total: string;
}

export interface PortalQuotationDetailExtras extends PortalQuotationListExtras {
  lines: PortalQuotationLine[];
  reviewers: PortalQuotationReviewer[];
}

export interface PortalServiceOrderListExtras {
  /** Folio of the quotation this order came from, if any. */
  quotationFolio: string | null;
  reportCount: number;
}

export interface PortalServiceOrderDetailExtras extends PortalServiceOrderListExtras {
  quotationId: string | null;
  lines: PortalServiceOrderLine[];
  linkedReports: PortalLinkedReport[];
  visitDates: Date[];
}

export interface PortalEquipmentListExtras {
  /** Newest linked report's date; null if never serviced. */
  lastServiceDate: Date | null;
}

/** Each sub-list obeys its own grant (04 §7), so either may be empty because the
 *  user is not entitled to it rather than because there is nothing there. */
export interface PortalEquipmentDetailExtras extends PortalEquipmentListExtras {
  linkedReports: PortalLinkedReport[];
  linkedServiceRequests: PortalEquipmentLinkedServiceRequest[];
}

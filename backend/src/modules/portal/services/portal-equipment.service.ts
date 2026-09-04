import type { Db } from '../../database/client';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type {
  PortalEquipmentDetail,
  PortalEquipmentListItem,
} from '../dtos/portal-equipment.dto';
import { PortalGrant } from '../enums/portal-grants.enum';
import {
  toPortalEquipmentDetail,
  toPortalEquipmentListItem,
} from '../helpers/portal-equipment.helpers';
import {
  findPortalEquipment,
  listPortalEquipment,
  releasedReportsForEquipment,
  serviceRequestsForEquipment,
} from '../repository/portal-equipment.repository';
import { mapPage } from '../utils/portal-page';
import type { PortalEquipmentQuery } from '../validators/portal-reads.validator';

export const listEquipmentForPortal = async (
  db: Db,
  customerId: string,
  q: PortalEquipmentQuery,
): Promise<GenericQueryResponse<PortalEquipmentListItem>> => {
  const page = await listPortalEquipment(db, customerId, q);
  return mapPage(page, (i) =>
    toPortalEquipmentListItem(i.row, { lastServiceDate: i.lastServiceDate }),
  );
};

/** The unit plus its per-unit history. **Each sub-list obeys its own grant**
 *  (04 §7): an equipment-only user sees the unit and nothing hanging off it,
 *  and the sub-list is omitted from the query rather than fetched and dropped. */
export const getEquipmentForPortal = async (
  db: Db,
  customerId: string,
  grants: PortalGrant[],
  id: string,
): Promise<PortalEquipmentDetail | null> => {
  const found = await findPortalEquipment(db, customerId, id);
  if (!found) return null;

  const [linkedReports, linkedServiceRequests] = await Promise.all([
    grants.includes(PortalGrant.ViewReports)
      ? releasedReportsForEquipment(db, customerId, found.row.id)
      : Promise.resolve([]),
    grants.includes(PortalGrant.CreateServiceRequests)
      ? serviceRequestsForEquipment(db, customerId, found.row.id)
      : Promise.resolve([]),
  ]);

  return toPortalEquipmentDetail(found.row, {
    lastServiceDate: found.lastServiceDate,
    linkedReports,
    linkedServiceRequests,
  });
};

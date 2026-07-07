/** Equipment DTOs (11-equipment.md §1) — the client's installed units.
 *  `kind`/`capacity` stay free text in v1 (no invented catalogs); service
 *  history is derived from linked reports, never stored. */

export type EquipmentStatus = 'active' | 'retired';

/** Minimal linked-report row for the service-history table — deliberately
 *  independent of module 06's DTOs (sibling branch; shapes reconcile at the
 *  backend contract). */
export interface EquipmentReportLink {
  id: string;
  folio?: string;
  serviceDate: string;
  templateName?: string;
  status?: string;
}

export interface Equipment {
  id: string;
  customerId: string;
  customerName?: string;
  name?: string; // friendly label: "Chiller principal"
  brand?: string;
  model?: string;
  serialNumber?: string;
  kind?: string; // free text v1
  capacity?: string; // free text v1
  location?: string; // 'azotea', 'cuarto de máquinas'…
  installDate?: string;
  installedByUs: boolean;
  /** WMS hook (10): serialized unit this asset came from. */
  materialUnitId?: string;
  status: EquipmentStatus;
  notes?: string;
  lastServiceDate?: string;
  /** Detail only: linked reports, newest first. */
  reports?: EquipmentReportLink[];
  createdAt: string;
  deletedAt?: string;
}

export interface EquipmentListQuery {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  status?: EquipmentStatus | '';
}

export interface SaveEquipmentRequest {
  customerId: string;
  name?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  kind?: string;
  capacity?: string;
  location?: string;
  installDate?: string;
  installedByUs: boolean;
  notes?: string;
}

export interface DeleteEquipmentRequest {
  deleteComment: string;
}

import type { equipment, equipmentReports } from '../models/equipment.model';
import type { EquipmentOrigin, EquipmentStatus } from '../enums/equipment.enum';

export type EquipmentRow = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
export type EquipmentReportRow = typeof equipmentReports.$inferSelect;

export type UpdateEquipmentFields = Partial<
  Pick<
    EquipmentRow,
    | 'name'
    | 'brand'
    | 'model'
    | 'serialNumber'
    | 'kind'
    | 'capacity'
    | 'location'
    | 'installDate'
    | 'origin'
    | 'status'
    | 'notes'
    | 'photos'
  >
>;

/** Minimal linked-report row for the service-history table (11 §4). Independent
 *  of module 06's DTOs — the shapes reconcile at this contract. */
export interface EquipmentReportLink {
  id: string;
  folio: string;
  serviceDate: string;
  status: string;
}

/** The equipment API shape returned to the superadmin (matches its `Equipment`
 *  DTO). `customerName`/`lastServiceDate`/`reports` are derived, not columns. */
export interface EquipmentDTO {
  id: string;
  customerId: string;
  customerName?: string;
  name?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  kind?: string;
  capacity?: string;
  location?: string;
  installDate?: string;
  origin: EquipmentOrigin;
  materialUnitId?: string;
  status: EquipmentStatus;
  notes?: string;
  photos: string[];
  lastServiceDate?: string;
  reports?: EquipmentReportLink[];
  createdAt: string;
  deletedAt?: string;
}

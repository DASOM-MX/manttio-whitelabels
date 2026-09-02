import { describe, expect, it } from 'vitest';
import { ContractFileType, ContractType, ContractValidity } from '../../src/modules/contracts/enums/contracts.enum';
import type { ContractRow } from '../../src/modules/contracts/types/contracts.types';
import { EquipmentOrigin, EquipmentStatus } from '../../src/modules/equipment/enums/equipment.enum';
import type { EquipmentRow } from '../../src/modules/equipment/types/equipment.types';
import { QuotationResponse, QuotationStatus } from '../../src/modules/quotations/enums/quotations.enum';
import type {
  QuotationLineRow,
  QuotationRecipientRow,
  QuotationRow,
} from '../../src/modules/quotations/types/quotations.types';
import { ReportStatus } from '../../src/modules/reports/enums/reports.enum';
import { ServiceTaxRate, ServiceUom } from '../../src/modules/services/enums/services.enum';
import type { ReportDetailRow, ReportRow } from '../../src/modules/reports/types/reports.types';
import {
  ServiceOrderPriority,
  ServiceOrderStatus,
} from '../../src/modules/service-orders/enums/service-orders.enum';
import type {
  ServiceOrderLineRow,
  ServiceOrderRow,
} from '../../src/modules/service-orders/types/service-orders.types';
import {
  toPortalContractDetail,
  toPortalContractListItem,
} from '../../src/modules/portal/helpers/portal-contract.helpers';
import {
  toPortalEquipmentDetail,
  toPortalEquipmentListItem,
} from '../../src/modules/portal/helpers/portal-equipment.helpers';
import {
  toPortalQuotationDetail,
  toPortalQuotationLine,
  toPortalQuotationListItem,
  toPortalQuotationReviewer,
} from '../../src/modules/portal/helpers/portal-quotation.helpers';
import {
  toPortalReportDetail,
  toPortalReportListItem,
} from '../../src/modules/portal/helpers/portal-report.helpers';
import {
  toPortalServiceOrderDetail,
  toPortalServiceOrderLine,
  toPortalServiceOrderListItem,
} from '../../src/modules/portal/helpers/portal-service-order.helpers';

// Values that must never reach a portal response. Each fixture below sets the
// staff-only columns to one of these, so a leak shows up as a value match and
// not only as an unexpected key.
const STAFF_USER_ID = 'aaaaaaaa-0000-0000-0000-00000000000a';
const TOMBSTONE = new Date('2026-01-02T03:04:05Z');
const STAFF_NOTE = 'INTERNAL-STAFF-ONLY';

const keysOf = (o: object) => Object.keys(o).sort();

// Every column non-null, tombstone columns included. The explicit row type is
// what keeps this honest: a new staff column fails to compile here until it is
// added and consciously left out of the DTO.
const reportRow: ReportRow = {
  id: 'RPT-20260901-0001',
  templateId: '11111111-1111-1111-1111-111111111111',
  reportType: 'Mantenimiento preventivo',
  workType: 'Preventivo',
  dateArrival: new Date('2026-09-01T10:00:00Z'),
  dateDeparture: new Date('2026-09-01T11:00:00Z'),
  createdBy: STAFF_USER_ID,
  assignedTo: STAFF_USER_ID,
  clientId: '44444444-4444-4444-4444-444444444444',
  serviceOrderId: '55555555-5555-5555-5555-555555555555',
  serviceId: '66666666-6666-6666-6666-666666666666',
  comments: 'Se ajustó la presión del circuito',
  signedBy: 'Ana Ruiz',
  status: ReportStatus.Finished,
  state: 'Nuevo León',
  signedAt: new Date('2026-09-01T11:00:00Z'),
  signedLatitude: 25.123,
  signedLongitude: -103.456,
  signedAccuracy: 10.5,
  finishedAt: new Date('2026-09-01T11:30:00Z'),
  mailedAt: new Date('2026-09-01T12:00:00Z'),
  deletedAt: TOMBSTONE,
  createdAt: new Date('2026-09-01T09:00:00Z'),
  updatedAt: new Date('2026-09-01T12:00:00Z'),
};

const reportDetailRow: ReportDetailRow = {
  reportId: reportRow.id,
  data: { checklist: ['ok'] },
  pictures: ['a.jpg', 'b.jpg'],
  signature: 'sig.png',
  contentFilledAt: new Date('2026-09-01T11:20:00Z'),
  updatedAt: new Date('2026-09-01T11:20:00Z'),
};

const reportExtras = { technicianName: 'Juan García', equipmentNames: ['Chiller 1'] };

describe('portal report DTOs', () => {
  it('list item exposes exactly the released fields', () => {
    const result = toPortalReportListItem(reportRow, reportExtras);
    expect(keysOf(result)).toEqual([
      'createdAt',
      'dateArrival',
      'dateDeparture',
      'equipmentNames',
      'id',
      'reportType',
      'status',
      'technicianName',
    ]);
  });

  it('detail adds the customer-facing content and nothing else', () => {
    const result = toPortalReportDetail(reportRow, reportDetailRow, reportExtras);
    expect(keysOf(result)).toEqual([
      'comments',
      'createdAt',
      'data',
      'dateArrival',
      'dateDeparture',
      'equipmentNames',
      'id',
      'pictures',
      'reportType',
      'signature',
      'signedAt',
      'signedBy',
      'status',
      'technicianName',
    ]);
  });

  it('carries no staff id and no tombstone', () => {
    const json = JSON.stringify(toPortalReportDetail(reportRow, reportDetailRow, reportExtras));
    expect(json).not.toContain(STAFF_USER_ID);
    expect(json).not.toContain(TOMBSTONE.toISOString());
  });

  it('tolerates a report with no content row', () => {
    const result = toPortalReportDetail(reportRow, null, reportExtras);
    expect(result.data).toBeNull();
    expect(result.pictures).toEqual([]);
    expect(result.signature).toBeNull();
  });
});

const contractRow: ContractRow = {
  id: '77777777-7777-7777-7777-777777777777',
  folio: 'CTR-20260901-0001',
  customerId: '44444444-4444-4444-4444-444444444444',
  serviceOrderId: '55555555-5555-5555-5555-555555555555',
  name: 'Mantenimiento anual',
  type: ContractType.ProgrammedMaintenance,
  description: 'Cobertura de 12 meses',
  fileKey: 'contracts/secret-r2-key.pdf',
  fileName: 'contrato.pdf',
  fileType: ContractFileType.Pdf,
  fileMime: 'application/pdf',
  fileSize: 12345,
  visibleToRoles: ['office', 'technician'],
  validFromDate: '2026-01-01',
  expiryDate: '2026-12-31',
  tags: ['anual'],
  createdBy: STAFF_USER_ID,
  deleteComment: STAFF_NOTE,
  deletedBy: STAFF_USER_ID,
  deletedAt: TOMBSTONE,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('portal contract DTOs', () => {
  it('list item exposes exactly the released fields', () => {
    expect(keysOf(toPortalContractListItem(contractRow, '2026-06-01'))).toEqual([
      'createdAt',
      'expiryDate',
      'fileType',
      'folio',
      'id',
      'name',
      'type',
      'validFromDate',
      'validity',
    ]);
  });

  it('detail adds the metadata block without the R2 key', () => {
    const result = toPortalContractDetail(contractRow, '2026-06-01');
    expect(keysOf(result)).toEqual([
      'createdAt',
      'description',
      'expiryDate',
      'fileMime',
      'fileName',
      'fileSize',
      'fileType',
      'folio',
      'id',
      'name',
      'type',
      'validFromDate',
      'validity',
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-r2-key');
  });

  it('derives validity from the caller-supplied date', () => {
    expect(toPortalContractListItem(contractRow, '2025-06-01').validity).toBe(
      ContractValidity.NotStarted,
    );
    expect(toPortalContractListItem(contractRow, '2026-06-01').validity).toBe(
      ContractValidity.Active,
    );
    expect(toPortalContractListItem(contractRow, '2027-06-01').validity).toBe(
      ContractValidity.Expired,
    );
  });

  it('carries no staff attribution and no tombstone', () => {
    const json = JSON.stringify(toPortalContractDetail(contractRow, '2026-06-01'));
    expect(json).not.toContain(STAFF_USER_ID);
    expect(json).not.toContain(STAFF_NOTE);
    expect(json).not.toContain(TOMBSTONE.toISOString());
  });
});

const quotationRow: QuotationRow = {
  id: '88888888-8888-8888-8888-888888888888',
  folio: 'COT-20260901-0001',
  customerId: '44444444-4444-4444-4444-444444444444',
  status: QuotationStatus.WaitingApproval,
  validUntil: '2026-09-30',
  comments: 'Precios sujetos a disponibilidad',
  supersedesQuotationId: '99999999-9999-9999-9999-999999999999',
  sentAt: new Date('2026-09-01T08:00:00Z'),
  resolutionReason: STAFF_NOTE,
  cancelledAt: new Date('2026-09-05T08:00:00Z'),
  orderCreatedAt: new Date('2026-09-06T08:00:00Z'),
  resolvedByUserId: STAFF_USER_ID,
  serviceOrderId: '55555555-5555-5555-5555-555555555555',
  createdBy: STAFF_USER_ID,
  createdAt: new Date('2026-09-01T07:00:00Z'),
  updatedAt: new Date('2026-09-01T08:00:00Z'),
  deleteComment: STAFF_NOTE,
  deletedBy: STAFF_USER_ID,
  deletedAt: TOMBSTONE,
};

const quotationLineRow: QuotationLineRow = {
  id: 'aaaa1111-1111-1111-1111-111111111111',
  quotationId: quotationRow.id,
  serviceId: 'bbbb2222-2222-2222-2222-222222222222',
  serviceName: 'Limpieza de condensador',
  description: 'Por unidad',
  unitPrice: '1500.00',
  uom: ServiceUom.Servicio,
  taxRate: ServiceTaxRate.Iva16,
  quantity: '2',
  discountAmount: '100.00',
  createdAt: new Date('2026-09-01T07:00:00Z'),
};

const quotationRecipientRow: QuotationRecipientRow = {
  id: 'cccc3333-3333-3333-3333-333333333333',
  quotationId: quotationRow.id,
  contactId: 'dddd4444-4444-4444-4444-444444444444',
  email: 'otro.contacto@cliente.com',
  isReviewer: true,
  token: 'a-live-response-token',
  sentAt: new Date('2026-09-01T08:00:00Z'),
  viewedAt: new Date('2026-09-02T08:00:00Z'),
  respondedAt: new Date('2026-09-03T08:00:00Z'),
  response: QuotationResponse.Approved,
  responseReason: 'De acuerdo',
};

describe('portal quotation DTOs', () => {
  it('line keeps the priced figures the customer is approving', () => {
    expect(keysOf(toPortalQuotationLine(quotationLineRow))).toEqual([
      'description',
      'discountAmount',
      'id',
      'quantity',
      'serviceName',
      'taxRate',
      'unitPrice',
      'uom',
    ]);
  });

  it('reviewer carries the answer but neither the email nor the token', () => {
    const result = toPortalQuotationReviewer(quotationRecipientRow, 'María López');
    expect(keysOf(result)).toEqual(['contactName', 'respondedAt', 'response']);
    const json = JSON.stringify(result);
    expect(json).not.toContain('otro.contacto@cliente.com');
    expect(json).not.toContain('a-live-response-token');
  });

  it('list item exposes exactly the released fields', () => {
    expect(keysOf(toPortalQuotationListItem(quotationRow, { total: '3380.00' }, '2026-09-10'))).toEqual([
      'createdAt',
      'folio',
      'id',
      'isOverdue',
      'sentAt',
      'status',
      'total',
      'validUntil',
    ]);
  });

  it('derives isOverdue from the caller-supplied date', () => {
    expect(toPortalQuotationListItem(quotationRow, { total: '0' }, '2026-09-10').isOverdue).toBe(false);
    expect(toPortalQuotationListItem(quotationRow, { total: '0' }, '2026-10-01').isOverdue).toBe(true);
  });

  it('detail adds terms, lines and reviewers only', () => {
    const result = toPortalQuotationDetail(
      quotationRow,
      { total: '3380.00', lines: [toPortalQuotationLine(quotationLineRow)], reviewers: [] },
      '2026-09-10',
    );
    expect(keysOf(result)).toEqual([
      'comments',
      'createdAt',
      'folio',
      'id',
      'isOverdue',
      'lines',
      'reviewers',
      'sentAt',
      'status',
      'total',
      'validUntil',
    ]);
  });

  it('carries no staff attribution, resolution reason or tombstone', () => {
    const json = JSON.stringify(
      toPortalQuotationDetail(quotationRow, { total: '0', lines: [], reviewers: [] }, '2026-09-10'),
    );
    expect(json).not.toContain(STAFF_USER_ID);
    expect(json).not.toContain(STAFF_NOTE);
    expect(json).not.toContain(TOMBSTONE.toISOString());
  });
});

const serviceOrderRow: ServiceOrderRow = {
  id: 'eeee5555-5555-5555-5555-555555555555',
  folio: 'ORD-20260901-0001',
  customerId: '44444444-4444-4444-4444-444444444444',
  quotationId: quotationRow.id,
  location: 'Planta Apodaca',
  priority: ServiceOrderPriority.Urgent,
  promisedDate: '2026-09-15',
  status: ServiceOrderStatus.Open,
  comments: STAFF_NOTE,
  createdBy: STAFF_USER_ID,
  deletedAt: TOMBSTONE,
  createdAt: new Date('2026-09-01T07:00:00Z'),
  updatedAt: new Date('2026-09-01T07:00:00Z'),
};

const serviceOrderLineRow: ServiceOrderLineRow = {
  id: 'ffff6666-6666-6666-6666-666666666666',
  serviceOrderId: serviceOrderRow.id,
  serviceId: 'bbbb2222-2222-2222-2222-222222222222',
  serviceName: 'Limpieza de condensador',
  uom: ServiceUom.Servicio,
  taxRate: ServiceTaxRate.Iva16,
  quantity: '2',
  unitPrice: '1500.00',
  discountAmount: '100.00',
  createdAt: new Date('2026-09-01T07:00:00Z'),
};

const orderListExtras = { quotationFolio: quotationRow.folio, reportCount: 2 };

describe('portal service order DTOs', () => {
  it('line exposes exactly the released fields', () => {
    expect(keysOf(toPortalServiceOrderLine(serviceOrderLineRow))).toEqual([
      'discountAmount',
      'id',
      'quantity',
      'serviceName',
      'taxRate',
      'unitPrice',
      'uom',
    ]);
  });

  it('list item exposes exactly the released fields', () => {
    expect(keysOf(toPortalServiceOrderListItem(serviceOrderRow, orderListExtras))).toEqual([
      'createdAt',
      'folio',
      'id',
      'location',
      'promisedDate',
      'quotationFolio',
      'reportCount',
      'status',
    ]);
  });

  it('detail adds scope, reports and visit dates only', () => {
    const result = toPortalServiceOrderDetail(serviceOrderRow, {
      ...orderListExtras,
      quotationId: quotationRow.id,
      lines: [toPortalServiceOrderLine(serviceOrderLineRow)],
      linkedReports: [],
      visitDates: [new Date('2026-09-10T09:00:00Z')],
    });
    expect(keysOf(result)).toEqual([
      'createdAt',
      'folio',
      'id',
      'lines',
      'linkedReports',
      'location',
      'promisedDate',
      'quotationFolio',
      'quotationId',
      'reportCount',
      'status',
      'visitDates',
    ]);
  });

  it('never carries priority, dispatch notes or a tombstone', () => {
    const json = JSON.stringify(
      toPortalServiceOrderDetail(serviceOrderRow, {
        ...orderListExtras,
        quotationId: null,
        lines: [],
        linkedReports: [],
        visitDates: [],
      }),
    );
    expect(json).not.toContain(ServiceOrderPriority.Urgent);
    expect(json).not.toContain(STAFF_NOTE);
    expect(json).not.toContain(STAFF_USER_ID);
    expect(json).not.toContain(TOMBSTONE.toISOString());
  });
});

const equipmentRow: EquipmentRow = {
  id: 'aaaa7777-7777-7777-7777-777777777777',
  customerId: '44444444-4444-4444-4444-444444444444',
  name: 'Chiller 1',
  brand: 'Carrier',
  model: '30XA',
  serialNumber: 'SN-0001',
  kind: 'chiller',
  capacity: '100 TR',
  location: 'Azotea',
  installDate: '2024-05-01',
  origin: EquipmentOrigin.Venta,
  materialUnitId: 'bbbb8888-8888-8888-8888-888888888888',
  status: EquipmentStatus.Active,
  notes: STAFF_NOTE,
  photos: ['equipo.jpg'],
  deleteComment: STAFF_NOTE,
  deletedBy: STAFF_USER_ID,
  deletedAt: TOMBSTONE,
  createdAt: new Date('2024-05-01T00:00:00Z'),
  updatedAt: new Date('2024-05-01T00:00:00Z'),
};

const equipmentListExtras = { lastServiceDate: new Date('2026-09-01T11:30:00Z') };

describe('portal equipment DTOs', () => {
  it('list item exposes exactly the released fields', () => {
    expect(keysOf(toPortalEquipmentListItem(equipmentRow, equipmentListExtras))).toEqual([
      'brand',
      'id',
      'lastServiceDate',
      'location',
      'model',
      'name',
      'serialNumber',
    ]);
  });

  it('detail adds the identification block and the per-unit history', () => {
    const result = toPortalEquipmentDetail(equipmentRow, {
      ...equipmentListExtras,
      linkedReports: [],
      linkedServiceRequests: [],
    });
    expect(keysOf(result)).toEqual([
      'brand',
      'capacity',
      'id',
      'installDate',
      'kind',
      'lastServiceDate',
      'linkedReports',
      'linkedServiceRequests',
      'location',
      'model',
      'name',
      'photos',
      'serialNumber',
      'status',
    ]);
  });

  it('never carries internal notes, the WMS link or a tombstone', () => {
    const json = JSON.stringify(
      toPortalEquipmentDetail(equipmentRow, {
        ...equipmentListExtras,
        linkedReports: [],
        linkedServiceRequests: [],
      }),
    );
    expect(json).not.toContain(STAFF_NOTE);
    expect(json).not.toContain('bbbb8888-8888-8888-8888-888888888888');
    expect(json).not.toContain(STAFF_USER_ID);
    expect(json).not.toContain(TOMBSTONE.toISOString());
  });
});

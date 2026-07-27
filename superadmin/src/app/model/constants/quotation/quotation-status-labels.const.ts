import { QuotationStatus } from '../../enums/quotation/quotation-status.enum';

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  [QuotationStatus.Draft]: 'Borrador',
  [QuotationStatus.WaitingApproval]: 'En espera',
  [QuotationStatus.PartiallyApproved]: 'Aprobada en parte',
  [QuotationStatus.Approved]: 'Aprobada',
  [QuotationStatus.Declined]: 'Rechazada',
  [QuotationStatus.Cancelled]: 'Cancelada',
  [QuotationStatus.OrderCreated]: 'Orden creada',
};

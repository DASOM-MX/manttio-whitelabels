/** What a timeline entry's `refId` points at. The acting contact is not a
 *  member — that has its own `contactId` field. */
export enum QuotationEventRefKind {
  Recipient = 'recipient',
  Quotation = 'quotation',
  ServiceOrder = 'service_order',
}

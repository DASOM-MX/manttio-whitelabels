/** A reviewer's answer — mirrors the backend `QuotationResponse`. `null` on
 *  `PortalQuotationReviewer.response` means still pending. */
export enum QuotationResponse {
  Approved = 'approved',
  Declined = 'declined',
}

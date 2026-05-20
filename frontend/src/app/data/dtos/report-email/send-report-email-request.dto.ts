export interface SendReportEmailRequest {
  to?: string;
  cc?: string[];
  expiresInDays?: number;
  message?: string;
}

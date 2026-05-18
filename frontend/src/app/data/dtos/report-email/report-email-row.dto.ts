export interface ReportEmailRow {
  id: string;
  reportId: string;
  sentBy: string;
  sentAt: string;
  recipientTo: string;
  recipientCc: string[];
  accessToken: string;
  expiresAt: string | null;
  revokedAt: string | null;
  resendMessageId: string | null;
}

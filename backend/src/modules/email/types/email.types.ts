// Public input type for the generic email transport (email.service.ts).

/** Resend attachment: base64 `content` + the filename the client shows.
 *  Kept provider-shaped here — the transport passes it through verbatim. */
export type EmailAttachment = {
  filename: string;
  content: string;
};

export type ResendSendParams = {
  apiKey: string;
  from: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

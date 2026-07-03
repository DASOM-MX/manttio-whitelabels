// Public input type for the generic email transport (email.service.ts).
export type ResendSendParams = {
  apiKey: string;
  from: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

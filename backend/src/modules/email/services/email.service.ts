// Thin Resend wrapper. We don't use the official SDK — fetch is enough and keeps the
// bundle smaller. Errors surface as thrown Error so the caller can decide whether to
// roll back the report_emails row, fall through to the user, or just log.

import type { ResendSendParams } from '../types/email.types';

export type { ResendSendParams };

type ResendResponse = { id: string };

export const sendEmail = async (p: ResendSendParams): Promise<{ id: string }> => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${p.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: p.from,
      to: p.to,
      cc: p.cc,
      subject: p.subject,
      html: p.html,
      text: p.text,
      reply_to: p.replyTo,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`resend send failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as ResendResponse;
  return { id: data.id };
};

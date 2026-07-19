import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { verifyTurnstileToken } from '../../turnstile/services/turnstile.service';
import { LEAD_COOKIE_MAX_AGE_SECONDS, LEAD_COOKIE_NAME } from '../constants/lead-cookie';
import { createLead } from '../services/leads.service';
import { createLeadSchema } from '../validators/public-leads.validator';

// Public lead intake for the tenant website's /contact-us form (utm-params
// plan 01). Unauthenticated by design; three stacked abuse gates before the
// insert, cheapest first:
//   1. dedup cookie (set on success, rejected while present),
//   2. 1 req/min per-IP throttle (LEADS_RATE_LIMITER binding, fail-open when
//      the binding or the CF-set IP header is absent),
//   3. Turnstile, verified server-side. A siteverify outage fails closed
//      (403) — acceptable for lead capture, the prospect can retry.
export const publicLeads = new Hono<AppBindings>();

publicLeads.post(
  '/',
  // Custom hook: the default one echoes raw zod output — this endpoint is
  // public, keep the error opaque.
  zValidator('json', createLeadSchema, (result, c) => {
    if (!result.success) return c.json({ error: 'validation_error' }, 400);
  }),
  async (c) => {
    if (getCookie(c, LEAD_COOKIE_NAME)) {
      return c.json({ error: 'already_submitted' }, 429);
    }

    const remoteIp = c.req.header('cf-connecting-ip');
    if (remoteIp && c.env.LEADS_RATE_LIMITER) {
      const { success } = await c.env.LEADS_RATE_LIMITER.limit({ key: remoteIp });
      if (!success) return c.json({ error: 'rate_limited' }, 429);
    }

    const input = c.req.valid('json');
    const verdict = await verifyTurnstileToken(c.env, input.turnstileToken, remoteIp);
    if (!verdict.success) return c.json({ error: 'turnstile_failed' }, 403);

    const db = createDb(c.env.DATABASE_URL);
    const row = await createLead(db, input);

    // SameSite=None so the cookie survives tenant setups where the website and
    // API live on different registrable domains; the form must POST with
    // credentials: 'include' for the browser to store/send it (plan 02).
    setCookie(c, LEAD_COOKIE_NAME, '1', {
      maxAge: LEAD_COOKIE_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/',
    });
    return c.json({ id: row.id }, 201);
  },
);

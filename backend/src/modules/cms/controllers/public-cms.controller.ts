import { Hono } from 'hono';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { getPublishedClients, getPublishedHome } from '../services/cms.service';

// Public published-only reads (superadmin plan 15 §1.1 — route shape decided
// here, 2026-07-07). Unauthenticated by design: the tenant website consumes
// these server-side on every render. Never-published sections 404 so the site
// falls back to its defaults. Candidate for the TenantCacheDO once it exists
// (backend plan §5/§6) — until then these hit Neon directly.
export const publicCms = new Hono<AppBindings>();

publicCms.get('/home', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const doc = await getPublishedHome(db, c.env.CDN_BASE_URL);
  if (!doc) return c.json({ error: 'not_found' }, 404);
  return c.json(doc);
});

publicCms.get('/clients', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const entries = await getPublishedClients(db, c.env.CDN_BASE_URL);
  if (!entries) return c.json({ error: 'not_found' }, 404);
  return c.json(entries);
});

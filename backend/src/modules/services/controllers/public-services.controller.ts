import { Hono } from 'hono';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { getPublishedServices } from '../services/services-catalog.service';

// Public services listing for the tenant website (18 §4, CP-3). Unauthenticated
// by design, same posture as `/public/cms/*`: the site consumes it server-side
// on render. Returns only `isListableInWebsite` services, and each entry carries
// `price` only when that service opts in (`isPriceVisibleInWebsite`) — the flag
// is per-service, not a global switch.
//
// Unlike the CMS reads this never 404s: an empty catalog is a legitimate state
// (nothing published yet), and the site simply renders no services section.
//
// Photos ship as materialized `imageUrl`s (`manttio-images` via
// IMAGES_CDN_BASE_URL), never as raw bucket keys.
export const publicServices = new Hono<AppBindings>();

publicServices.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getPublishedServices(db, c.env.IMAGES_CDN_BASE_URL));
});

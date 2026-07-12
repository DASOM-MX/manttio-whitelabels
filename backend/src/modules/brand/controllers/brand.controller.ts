import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { jwtMiddleware } from '../../auth/middleware/jwt.middleware';
import { managerOr } from '../../auth/middleware/manager.middleware';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { getBrand, saveBrand } from '../services/brand.service';
import { saveBrandSchema } from '../validators/brand.validator';

export const brand = new Hono<AppBindings>();

// Public read — login screens, the tenant website, and the field-app boot all
// consume it pre-auth. Always answers with a materialized palette: the tenant
// row, or the neutral default until one exists (rule 3).
brand.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getBrand(db, c.env.CDN_BASE_URL));
});

// Two write paths into the same single row, last write wins (decided
// 2026-07-05): the owner from the superadmin editor, or the whitelabel
// manager's shared-token push (provisioning + corrections).
brand.put(
  '/',
  managerOr(jwtMiddleware, requireRole(['owner'])),
  zValidator('json', saveBrandSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const saved = await saveBrand(db, c.env.CDN_BASE_URL, c.req.valid('json'));
    return c.json(saved);
  },
);

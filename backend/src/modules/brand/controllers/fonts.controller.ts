import { Hono } from 'hono';
import type { AppBindings } from '../../../env';
import { getFontCatalog } from '../services/brand.service';

// Public curated font catalog (superadmin plan 03 §2.1) — the list
// `brand.font` codes resolve against, consumed by the superadmin picker and
// both apps' @font-face injection.
export const fonts = new Hono<AppBindings>();

fonts.get('/', (c) => c.json(getFontCatalog(c.env.FONT_CDN_BASE_URL)));

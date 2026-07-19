import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import { fdGet, isFile } from '../../storage/utils/form-data';
import { NotAnImageError } from '../http-errors/not-an-image.error';
import { uploadImage } from '../services/upload.service';

export const upload = new Hono<AppBindings>();

const handleUpload = async (
  c: Context<AppBindings>,
  bucket: R2Bucket,
  cdnBase: string,
  keyPrefix?: string,
) => {
  const fd = await c.req.formData();
  const file = fdGet(fd, 'file');

  if (!isFile(file)) {
    return c.json({ error: 'no_file' }, 400);
  }

  try {
    const result = await uploadImage(bucket, cdnBase, file, keyPrefix);
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof NotAnImageError) {
      return c.json({ error: 'not_an_image', message: err.message }, 415);
    }
    throw err;
  }
};

// Generic image upload. Used by the frontend to upload report pictures one at a time
// and stash the returned URL until the report is submitted. Auth required (mounted
// behind `managerOr(jwtMiddleware)` in `index.ts`): any product user may use it, and
// the whitelabel manager's shared token is admitted so brand pushes can carry logos.
upload.post('/image', (c) => handleUpload(c, c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL));

// Brand asset upload (logo / isologo / favicon) — lands in the dedicated
// `manttio-logos` bucket so brand assets keep their own lifecycle apart from
// report data (decided 2026-07-12). Same auth as /image; the returned key is
// what PUT /brand expects, materialized against LOGOS_CDN_BASE_URL.
upload.post('/logo', (c) =>
  handleUpload(c, c.env.MANTTIO_LOGOS, c.env.LOGOS_CDN_BASE_URL, 'logos'),
);

// Equipment photos — land in the dedicated `manttio-equipment` bucket (key
// prefix `equipment/`) so they keep their own lifecycle apart from report data.
// The returned URL is stashed client-side and committed into equipment.photos.
upload.post('/equipment', (c) =>
  handleUpload(c, c.env.MANTTIO_EQUIPMENT, c.env.EQUIPMENT_CDN_BASE_URL, 'equipment'),
);

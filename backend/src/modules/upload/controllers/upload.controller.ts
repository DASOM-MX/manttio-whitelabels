import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import { fdGet, isFile } from '../../storage/utils/form-data';
import { NotAnImageError } from '../http-errors/not-an-image.error';
import { UnsupportedContractFileError } from '../http-errors/unsupported-contract-file.error';
import { uploadContractFile, uploadImage } from '../services/upload.service';

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

// Public marketing-site imagery → the dedicated `manttio-images` bucket (key
// prefix `website/`, owner 2026-07-26): a photo a visitor sees has a different
// audience and lifecycle from an operational report picture. The **key** is what
// callers persist (`services.website_image_key`) — the URL is materialized on
// read, so a CDN move never rewrites rows. `IMAGES_CDN_BASE_URL` is optional, so
// an unconfigured deploy returns a bare key-path here rather than
// `undefined/website/…`, and readers omit the URL entirely.
upload.post('/website-image', (c) =>
  handleUpload(c, c.env.MANTTIO_IMAGES, c.env.IMAGES_CDN_BASE_URL ?? '', 'website'),
);

// Contract documents (13 §1) — pdf/word/image into the dedicated
// `manttio-contracts` bucket (key prefix `contracts/`). Returns
// `{ url, key, name, mime, size }` — the metadata the client commits verbatim
// on POST /contracts.
upload.post('/contract', async (c) => {
  const fd = await c.req.formData();
  const file = fdGet(fd, 'file');

  if (!isFile(file)) {
    return c.json({ error: 'no_file' }, 400);
  }

  try {
    const result = await uploadContractFile(
      c.env.MANTTIO_CONTRACTS,
      c.env.CONTRACTS_CDN_BASE_URL,
      file,
    );
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof UnsupportedContractFileError) {
      return c.json({ error: 'unsupported_file_type', message: err.message }, 415);
    }
    throw err;
  }
});

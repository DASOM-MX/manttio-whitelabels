import { Hono } from 'hono';
import type { AppBindings } from '../env';
import { fdGet, isFile } from '../lib/form-data';
import { cdnUrl, putObject, r2Key } from '../lib/r2';

export const upload = new Hono<AppBindings>();

// Generic image upload. Used by the frontend to upload report pictures one at a time
// and stash the returned URL until the report is submitted. Auth required (mounted
// behind the JWT middleware in `index.ts`); both admins and technicians may use it.
upload.post('/image', async (c) => {
  const fd = await c.req.formData();
  const file = fdGet(fd, 'file');

  if (!isFile(file)) {
    return c.json({ error: 'no_file' }, 400);
  }
  if (!file.type.startsWith('image/')) {
    return c.json({ error: 'not_an_image', message: `content-type ${file.type} is not an image` }, 415);
  }

  const key = r2Key(file.name || 'upload.bin');
  const body = await file.arrayBuffer();
  await putObject(c.env.MANTTIO_REPORTS, key, body, file.type);

  return c.json({ url: cdnUrl(c.env.CDN_BASE_URL, key), key }, 201);
});

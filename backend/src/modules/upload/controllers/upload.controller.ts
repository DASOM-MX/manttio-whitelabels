import { Hono } from 'hono';
import type { AppBindings } from '../../../env';
import { fdGet, isFile } from '../../storage/utils/form-data';
import { NotAnImageError, uploadImage } from '../services/upload.service';

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

  try {
    const result = await uploadImage(c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL, file);
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof NotAnImageError) {
      return c.json({ error: 'not_an_image', message: err.message }, 415);
    }
    throw err;
  }
});

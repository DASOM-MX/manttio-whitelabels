import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { isForeignKeyViolation } from '../../database/db-errors';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { fdGet, isFile } from '../../storage/utils/form-data';
import {
  createContractMetaSchema,
  deleteContractSchema,
  listContractsQuerySchema,
  updateContractSchema,
} from '../validators/contracts.validator';
import {
  createContract,
  editContract,
  getContractById,
  getContractFile,
  getContracts,
  removeContract,
  replaceContractFile,
} from '../services/contracts.service';
import {
  discardContractFile,
  storeContractFile,
} from '../services/contract-files.service';
import { ContractVisibilityForbiddenError } from '../http-errors/contract-visibility-forbidden.error';
import { ContractEquipmentMismatchError } from '../http-errors/contract-equipment-mismatch.error';
import { UnsupportedContractFileError } from '../http-errors/unsupported-contract-file.error';
import type { ContractFile } from '../types/contracts.types';

export const contracts = new Hono<AppBindings>();

// Contracts are back-office filing (13 §4): owner/admin/office create and edit;
// deletes are admin-tier. Technicians never write — they only *read* a contract
// an owner explicitly shared with them through `visibleToRoles`, which is why
// the read routes admit them and nothing else does.
const READ_ROLES = ['owner', 'admin', 'office', 'technician'] as const;
const WRITE_ROLES = ['owner', 'admin', 'office'] as const;
const DELETE_ROLES = ['owner', 'admin'] as const;

/** Pull the document out of a multipart body. Shared by create and replace so
 *  the file unit is always built the same way. */
const readUploadedFile = async (
  c: Context<AppBindings>,
): Promise<{ fd: FormData; file: File } | null> => {
  const fd = await c.req.formData();
  const file = fdGet(fd, 'file');
  return isFile(file) ? { fd, file } : null;
};

contracts.get(
  '/',
  requireRole([...READ_ROLES]),
  zValidator('query', listContractsQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await getContracts(db, c.req.valid('query'), c.get('user')));
  },
);

contracts.get('/:id', requireRole([...READ_ROLES]), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getContractById(db, c.req.param('id'), c.get('user'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

// The only way the stored document is served (13 §1.2). No public URL, no
// pre-signed link: every download re-checks the caller's access, so revoking
// visibility takes effect immediately.
contracts.get('/:id/file', requireRole([...READ_ROLES]), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getContractFile(db, c.req.param('id'), c.get('user'));
  if (!row) return c.json({ error: 'not_found' }, 404);

  const object = await c.env.MANTTIO_CONTRACTS.get(row.fileKey);
  if (!object) return c.json({ error: 'file_not_found' }, 404);

  return new Response(object.body, {
    headers: {
      'content-type': row.fileMime,
      'content-disposition': `attachment; filename="${row.fileName}"`,
    },
  });
});

// Create is multipart: metadata fields + the document in one request (13 §5).
// There is no standalone upload endpoint — see contract-files.service.ts.
contracts.post('/', requireRole([...WRITE_ROLES]), async (c) => {
  const uploaded = await readUploadedFile(c);
  if (!uploaded) return c.json({ error: 'no_file' }, 400);
  const { fd, file } = uploaded;

  const parsed = createContractMetaSchema.safeParse({
    customerId: fdGet(fd, 'customerId') ?? undefined,
    serviceOrderId: fdGet(fd, 'serviceOrderId') ?? undefined,
    name: fdGet(fd, 'name') ?? undefined,
    type: fdGet(fd, 'type') ?? undefined,
    description: fdGet(fd, 'description') ?? undefined,
    validFromDate: fdGet(fd, 'validFromDate') ?? undefined,
    expiryDate: fdGet(fd, 'expiryDate') ?? undefined,
    tags: fdGet(fd, 'tags') ?? undefined,
    visibleToRoles: fdGet(fd, 'visibleToRoles') ?? undefined,
    equipmentIds: fdGet(fd, 'equipmentIds') ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400);
  }

  let stored: ContractFile;
  try {
    stored = await storeContractFile(c.env.MANTTIO_CONTRACTS, file);
  } catch (err) {
    if (err instanceof UnsupportedContractFileError) {
      return c.json({ error: 'unsupported_file_type', message: err.message }, 415);
    }
    throw err;
  }

  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await createContract(db, parsed.data, stored, c.get('user')), 201);
  } catch (err) {
    // The object landed in R2 before the row was attempted, so a rejected
    // insert must not leave it behind.
    await discardContractFile(c.env.MANTTIO_CONTRACTS, stored.fileKey);
    if (err instanceof ContractVisibilityForbiddenError) {
      return c.json({ error: 'visibility_forbidden', message: err.message }, 403);
    }
    if (err instanceof ContractEquipmentMismatchError) {
      return c.json(
        {
          error: 'equipment_customer_mismatch',
          message: 'Algún equipo seleccionado no pertenece a este cliente.',
        },
        409,
      );
    }
    if (isForeignKeyViolation(err)) return c.json({ error: 'invalid_reference' }, 400);
    throw err;
  }
});

// Metadata only — the document is replaced through POST /:id/file so the file
// fields can never drift out of sync with each other.
contracts.patch(
  '/:id',
  requireRole([...WRITE_ROLES]),
  zValidator('json', updateContractSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await editContract(db, c.req.param('id'), c.req.valid('json'), c.get('user'));
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      if (err instanceof ContractVisibilityForbiddenError) {
        return c.json({ error: 'visibility_forbidden', message: err.message }, 403);
      }
      if (err instanceof ContractEquipmentMismatchError) {
        return c.json(
          {
            error: 'equipment_customer_mismatch',
            message: 'Algún equipo seleccionado no pertenece a este cliente.',
          },
          409,
        );
      }
      throw err;
    }
  },
);

// Replace the stored document (13 §1.2) — old versions are not kept.
contracts.post('/:id/file', requireRole([...WRITE_ROLES]), async (c) => {
  const uploaded = await readUploadedFile(c);
  if (!uploaded) return c.json({ error: 'no_file' }, 400);

  let stored: ContractFile;
  try {
    stored = await storeContractFile(c.env.MANTTIO_CONTRACTS, uploaded.file);
  } catch (err) {
    if (err instanceof UnsupportedContractFileError) {
      return c.json({ error: 'unsupported_file_type', message: err.message }, 415);
    }
    throw err;
  }

  const db = createDb(c.env.DATABASE_URL);
  const row = await replaceContractFile(db, c.req.param('id'), stored, c.get('user'));
  if (!row) {
    await discardContractFile(c.env.MANTTIO_CONTRACTS, stored.fileKey);
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json(row);
});

// Soft delete only ([[no-hard-deletes-ever]]). This is also how early
// termination is recorded — there is no `cancelled` status.
contracts.delete(
  '/:id',
  requireRole([...DELETE_ROLES]),
  zValidator('json', deleteContractSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { deleteComment } = c.req.valid('json');
    const row = await removeContract(db, c.req.param('id'), deleteComment, c.get('user'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  },
);

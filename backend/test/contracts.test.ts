import { describe, expect, test } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedCustomer,
  seedOfficeAndLogin,
  seedOwnerAndLogin,
  seedTechnicianAndLogin,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { customerInteractions } from '../src/modules/database/schema';
import { InteractionRefKind } from '../src/modules/customers/enums/interactions.enum';
import { ContractFileType, ContractType, ContractValidity } from '../src/modules/contracts/enums/contracts.enum';

type WorkerEnv = { DATABASE_URL: string; MANTTIO_CONTRACTS: R2Bucket };

type Contract = {
  id: string;
  folio: string;
  customerId: string;
  customerName?: string;
  serviceOrderId?: string;
  name: string;
  type: ContractType;
  description?: string;
  fileName: string;
  fileType: ContractFileType;
  fileMime: string;
  fileSize?: number;
  visibleToRoles: string[];
  validFromDate: string;
  expiryDate?: string;
  validity: ContractValidity;
  tags: string[];
  createdBy: string;
  createdAt: string;
};

const FOLIO_RE = /^CON-\d{8}-\d{4}$/;

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);
const bucket = () => (env as unknown as WorkerEnv).MANTTIO_CONTRACTS;

const makeFile = (name: string, type: string): File => new File([PDF_BYTES], name, { type });

const dayOffset = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type CreateOpts = {
  customerId: string;
  name?: string;
  type?: ContractType;
  validFromDate?: string;
  expiryDate?: string;
  tags?: string[];
  visibleToRoles?: string[];
  file?: File;
};

const createForm = (opts: CreateOpts): FormData => {
  const fd = new FormData();
  fd.set('file', opts.file ?? makeFile('contrato.pdf', 'application/pdf'));
  fd.set('customerId', opts.customerId);
  fd.set('name', opts.name ?? 'Garantía compresor');
  fd.set('type', opts.type ?? ContractType.Guarantee);
  fd.set('validFromDate', opts.validFromDate ?? dayOffset(-1));
  if (opts.expiryDate) fd.set('expiryDate', opts.expiryDate);
  if (opts.tags) fd.set('tags', JSON.stringify(opts.tags));
  if (opts.visibleToRoles) fd.set('visibleToRoles', JSON.stringify(opts.visibleToRoles));
  return fd;
};

const createContract = async (token: string, opts: CreateOpts) => {
  const res = await request('/contracts', {
    method: 'POST',
    headers: authHeader(token),
    body: createForm(opts),
  });
  return res;
};

const createOk = async (token: string, opts: CreateOpts): Promise<Contract> => {
  const res = await createContract(token, opts);
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return json<Contract>(res);
};

describe('POST /contracts', () => {
  test('admin files a contract → 201 with a CON- folio and no file key', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const body = await createOk(token, {
      customerId: customer.id,
      tags: ['  Garantía ', 'garantía', 'HVAC'],
    });

    expect(body.folio).toMatch(FOLIO_RE);
    expect(body.customerId).toBe(customer.id);
    expect(body.customerName).toBe(customer.name);
    expect(body.fileType).toBe(ContractFileType.Pdf);
    expect(body.validity).toBe(ContractValidity.Active);
    // Trimmed, lowercased, deduped.
    expect(body.tags).toEqual(['garantía', 'hvac']);
    // Default visibility is all staff; owners restrict per contract.
    expect(body.visibleToRoles.sort()).toEqual(['office', 'technician']);
    // The private R2 key must never appear in a response body.
    expect(JSON.stringify(body)).not.toContain('contracts/');
  });

  test('folio increments per create', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const first = await createOk(token, { customerId: customer.id });
    const second = await createOk(token, { customerId: customer.id });

    const seq = (folio: string) => Number(folio.slice(-4));
    expect(seq(second.folio)).toBe(seq(first.folio) + 1);
    expect(first.folio.slice(0, 12)).toBe(second.folio.slice(0, 12));
  });

  test('the document lands in the private contracts bucket', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const contract = await createOk(token, { customerId: customer.id });

    const res = await request(`/contracts/${contract.id}/file`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('contrato.pdf');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF_BYTES);
  });

  test('an xlsx agreement is accepted', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const body = await createOk(token, {
      customerId: customer.id,
      file: makeFile(
        'poliza.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    });
    expect(body.fileType).toBe(ContractFileType.Xlsx);
  });

  test('an image is rejected 415 — a photo of a contract is not the contract', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const res = await createContract(token, {
      customerId: customer.id,
      file: makeFile('scan.png', 'image/png'),
    });
    expect(res.status).toBe(415);
    expect((await json<{ error: string }>(res)).error).toBe('unsupported_file_type');
  });

  test('a technician cannot file a contract', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();

    const res = await createContract(token, { customerId: customer.id });
    expect(res.status).toBe(403);
  });

  test('office cannot set visibility — that is owner/admin only', async () => {
    const { token } = await seedOfficeAndLogin();
    const customer = await seedCustomer();

    const res = await createContract(token, {
      customerId: customer.id,
      visibleToRoles: ['office'],
    });
    expect(res.status).toBe(403);
    expect((await json<{ error: string }>(res)).error).toBe('visibility_forbidden');
  });

  test('an unknown customer is rejected, not silently filed', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await createContract(token, {
      customerId: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(400);
  });
});

describe('validity is derived from the dates', () => {
  test('future start → por_iniciar; past expiry → vencido', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const future = await createOk(token, {
      customerId: customer.id,
      validFromDate: dayOffset(30),
    });
    expect(future.validity).toBe(ContractValidity.NotStarted);

    const lapsed = await createOk(token, {
      customerId: customer.id,
      validFromDate: dayOffset(-60),
      expiryDate: dayOffset(-1),
    });
    expect(lapsed.validity).toBe(ContractValidity.Expired);

    const res = await request(
      `/contracts?customerId=${customer.id}&validity=${ContractValidity.Expired}`,
      { headers: authHeader(token) },
    );
    const list = await json<{ items: Contract[] }>(res);
    expect(list.items.map((c) => c.id)).toEqual([lapsed.id]);
  });
});

describe('role-scoped visibility (13 §4)', () => {
  test('a restricted contract reads as absent for the excluded role', async () => {
    const { token: ownerToken } = await seedOwnerAndLogin();
    const { token: techToken } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();

    const contract = await createOk(ownerToken, {
      customerId: customer.id,
      visibleToRoles: ['office'],
    });

    // Owner sees it.
    const ownerRead = await request(`/contracts/${contract.id}`, {
      headers: authHeader(ownerToken),
    });
    expect(ownerRead.status).toBe(200);

    // The technician gets 404, not 403 — the endpoint must not confirm that a
    // restricted document exists.
    const techRead = await request(`/contracts/${contract.id}`, {
      headers: authHeader(techToken),
    });
    expect(techRead.status).toBe(404);

    // ...and cannot download it either.
    const techFile = await request(`/contracts/${contract.id}/file`, {
      headers: authHeader(techToken),
    });
    expect(techFile.status).toBe(404);

    // ...nor see it in the list.
    const techList = await request(`/contracts?customerId=${customer.id}`, {
      headers: authHeader(techToken),
    });
    const items = (await json<{ items: Contract[] }>(techList)).items;
    expect(items.map((c) => c.id)).not.toContain(contract.id);
  });

  test('office may edit a visible contract but not its visibility', async () => {
    const { token: ownerToken } = await seedOwnerAndLogin();
    const { token: officeToken } = await seedOfficeAndLogin();
    const customer = await seedCustomer();
    const contract = await createOk(ownerToken, { customerId: customer.id });

    const edit = await request(`/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(officeToken),
      body: JSON.stringify({ name: 'Garantía compresor — revisada' }),
    });
    expect(edit.status).toBe(200);
    expect((await json<Contract>(edit)).name).toBe('Garantía compresor — revisada');

    const restrict = await request(`/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(officeToken),
      body: JSON.stringify({ visibleToRoles: ['office'] }),
    });
    expect(restrict.status).toBe(403);
  });
});

describe('the stored document is replaceable', () => {
  test('POST /:id/file swaps the whole file unit', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const contract = await createOk(token, { customerId: customer.id });

    const fd = new FormData();
    fd.set('file', makeFile('contrato-v2.odt', 'application/vnd.oasis.opendocument.text'));
    const res = await request(`/contracts/${contract.id}/file`, {
      method: 'POST',
      headers: authHeader(token),
      body: fd,
    });

    expect(res.status).toBe(200);
    const body = await json<Contract>(res);
    expect(body.fileName).toBe('contrato-v2.odt');
    expect(body.fileType).toBe(ContractFileType.Odt);
    // The metadata moves as one unit — no stale mime from the previous file.
    expect(body.fileMime).toBe('application/vnd.oasis.opendocument.text');
  });
});

describe('soft delete', () => {
  test('requires a reason, then the contract is gone from every read', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const contract = await createOk(token, { customerId: customer.id });

    const noReason = await request(`/contracts/${contract.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({}),
    });
    expect(noReason.status).toBe(400);

    const deleted = await request(`/contracts/${contract.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'terminado anticipadamente' }),
    });
    expect(deleted.status).toBe(200);

    const read = await request(`/contracts/${contract.id}`, { headers: authHeader(token) });
    expect(read.status).toBe(404);

    const list = await request(`/contracts?customerId=${customer.id}`, {
      headers: authHeader(token),
    });
    expect((await json<{ items: Contract[] }>(list)).items).toHaveLength(0);
  });

  test('office cannot delete', async () => {
    const { token: adminToken } = await seedAdminAndLogin();
    const { token: officeToken } = await seedOfficeAndLogin();
    const customer = await seedCustomer();
    const contract = await createOk(adminToken, { customerId: customer.id });

    const res = await request(`/contracts/${contract.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(officeToken),
      body: JSON.stringify({ deleteComment: 'nope' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('audit trail (13 §3)', () => {
  const interactionsFor = (customerId: string) =>
    db()
      .select({
        body: customerInteractions.body,
        refKind: customerInteractions.refKind,
        refId: customerInteractions.refId,
      })
      .from(customerInteractions)
      .where(
        and(
          eq(customerInteractions.customerId, customerId),
          eq(customerInteractions.refKind, InteractionRefKind.Contract),
        ),
      )
      .orderBy(desc(customerInteractions.createdAt));

  test('create, edit and delete each append to the client timeline', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const contract = await createOk(token, { customerId: customer.id });

    await request(`/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ expiryDate: dayOffset(365) }),
    });
    await request(`/contracts/${contract.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'duplicado' }),
    });

    const rows = await interactionsFor(customer.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.refId === contract.id)).toBe(true);

    const bodies = rows.map((r) => r.body).join('\n');
    expect(bodies).toContain(`${contract.folio} creado`);
    // The trail names what changed, not just that something did.
    expect(bodies).toContain('vencimiento');
    expect(bodies).toContain('duplicado');
  });
});

describe('card feeds', () => {
  test('GET /customers/:id/contracts returns the client’s filed documents', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const contract = await createOk(token, { customerId: customer.id });

    const res = await request(`/customers/${customer.id}/contracts`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<{ contracts: Contract[] }>(res);
    expect(body.contracts.map((c) => c.id)).toContain(contract.id);
  });
});

describe('POST /upload/contract is gone', () => {
  test('the standalone upload route no longer exists', async () => {
    const { token } = await seedTechnicianAndLogin();
    const fd = new FormData();
    fd.set('file', makeFile('contrato.pdf', 'application/pdf'));

    const res = await request('/upload/contract', {
      method: 'POST',
      headers: authHeader(token),
      body: fd,
    });
    // It let any authenticated user write into the contracts bucket.
    expect(res.status).toBe(404);
  });
});

describe('orphan cleanup', () => {
  test('a rejected create leaves no object behind', async () => {
    const { token } = await seedOfficeAndLogin();
    const customer = await seedCustomer();

    const before = await bucket().list({ prefix: 'contracts/' });
    const res = await createContract(token, {
      customerId: customer.id,
      visibleToRoles: ['office'], // office may not set visibility → 403 after upload
    });
    expect(res.status).toBe(403);

    const after = await bucket().list({ prefix: 'contracts/' });
    expect(after.objects.length).toBe(before.objects.length);
  });
});

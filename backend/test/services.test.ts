import { afterAll, describe, expect, test } from 'vitest';
import { and, isNull, like } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedOfficeAndLogin,
  seedOwnerAndLogin,
  seedTechnicianAndLogin,
  uniqueServiceName,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { services } from '../src/modules/database/schema';
import { ServiceTaxRate, ServiceUom } from '../src/modules/services/enums/services.enum';

type WorkerEnv = { DATABASE_URL: string };

type Service = {
  id: string;
  name: string;
  price: string;
  cost?: string;
  uom: ServiceUom;
  description?: string;
  taxRate: string;
  satProdServCode?: string;
  satUnitCode?: string;
  isListableInWebsite: boolean;
  isPriceVisibleInWebsite: boolean;
};

type PublicService = {
  id: string;
  name: string;
  description?: string;
  uom: ServiceUom;
  price?: string;
};

// The catalog has no fixture-email column, so rows are tagged by the `test+`
// name prefix and **soft-deleted** here — never hard-deleted, the fork rule
// applies to fixtures too. The shared DB is the demo instance, so tombstoned
// test rows sitting in the table are acceptable; they drop out of every read
// path via `isNull(deletedAt)`.
afterAll(async () => {
  const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
  await db
    .update(services)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(like(services.name, 'test+%'), isNull(services.deletedAt)));
});

const createService = (token: string, body: object) =>
  request('/services', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(body) });

const patchService = (token: string, id: string, body: object) =>
  request(`/services/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });

// Money goes over the wire as a JSON number and comes back as a fixed-2 string,
// so the request-side overrides are numeric while `Service` stays string-typed.
type ServiceOverrides = Partial<Omit<Service, 'id' | 'price' | 'cost'>> & {
  price?: number;
  cost?: number;
};

/** A valid create body; every field overridable per test. */
const serviceBody = (over: ServiceOverrides = {}) => ({
  name: uniqueServiceName('svc'),
  price: 1500,
  uom: ServiceUom.Servicio,
  ...over,
});

/** Creates a service as owner and returns the DTO — the setup most tests need. */
const seedService = async (over: ServiceOverrides = {}): Promise<Service> => {
  const { token } = await seedOwnerAndLogin();
  const res = await createService(token, serviceBody(over));
  if (res.status !== 201) throw new Error(`seedService failed: ${res.status} ${await res.text()}`);
  return json<Service>(res);
};

const findById = (list: Service[] | PublicService[], id: string) =>
  (list as { id: string }[]).find((s) => s.id === id);

describe('POST /services', () => {
  test('creates with defaults; price normalizes to a fixed-2 string', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await createService(token, serviceBody({ price: 1234.5 }));
    expect(res.status).toBe(201);

    const svc = await json<Service>(res);
    // numeric(12,2) round-trips as a string — never a float.
    expect(svc.price).toBe('1234.50');
    expect(svc.taxRate).toBe(ServiceTaxRate.Iva16);
    expect(svc.isListableInWebsite).toBe(false);
    expect(svc.isPriceVisibleInWebsite).toBe(false);
    expect(svc.cost).toBeUndefined();
  });

  test('accepts a non-default IVA rate, cost and the SAT catalog keys', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await createService(
      token,
      serviceBody({
        price: 800,
        cost: 450,
        taxRate: ServiceTaxRate.Iva8,
        satProdServCode: '72101500',
        satUnitCode: 'E48',
      }),
    );
    expect(res.status).toBe(201);

    const svc = await json<Service>(res);
    expect(svc.cost).toBe('450.00');
    expect(svc.taxRate).toBe(ServiceTaxRate.Iva8);
    expect(svc.satProdServCode).toBe('72101500');
    expect(svc.satUnitCode).toBe('E48');
  });

  test('rejects a negative price and a missing uom', async () => {
    const { token } = await seedOwnerAndLogin();

    const negative = await createService(token, serviceBody({ price: -1 }));
    expect(negative.status).toBe(400);

    const noUom = await createService(token, { name: uniqueServiceName('svc'), price: 10 });
    expect(noUom.status).toBe(400);
  });

  test('uom is a closed list — an unlisted unit is rejected on create and update', async () => {
    const { token } = await seedOwnerAndLogin();

    // Free text was the v1 posture; 'kilometro' is plausible but not a member,
    // and accepting it is exactly what the enum exists to prevent.
    const created = await createService(token, {
      name: uniqueServiceName('svc'),
      price: 10,
      uom: 'kilometro',
    });
    expect(created.status).toBe(400);

    const svc = await seedService();
    const patched = await patchService(token, svc.id, { uom: 'kilometro' });
    expect(patched.status).toBe(400);

    // Every member round-trips.
    for (const uom of Object.values(ServiceUom)) {
      const res = await createService(token, serviceBody({ uom }));
      expect(res.status).toBe(201);
      expect((await json<Service>(res)).uom).toBe(uom);
    }
  });

  test('office and technician cannot write to the catalog', async () => {
    const { token: officeToken } = await seedOfficeAndLogin();
    expect((await createService(officeToken, serviceBody())).status).toBe(403);

    const { token: techToken } = await seedTechnicianAndLogin();
    expect((await createService(techToken, serviceBody())).status).toBe(403);
  });
});

describe('GET /services — cost follows the back-office line (18 §2)', () => {
  test('owner, admin and office see cost; technicians see the price but not cost', async () => {
    const svc = await seedService({ price: 2000, cost: 900 });

    const readAs = async (token: string) => {
      const res = await request('/services', { headers: jsonHeaders(token) });
      expect(res.status).toBe(200);
      const body = await json<{ services: Service[] }>(res);
      const found = findById(body.services, svc.id) as Service | undefined;
      expect(found).toBeDefined();
      return found!;
    };

    const { token: adminToken } = await seedAdminAndLogin();
    const { token: officeToken } = await seedOfficeAndLogin();
    const { token: techToken } = await seedTechnicianAndLogin();

    expect((await readAs(adminToken)).cost).toBe('900.00');
    expect((await readAs(officeToken)).cost).toBe('900.00');

    // The technician still gets the catalog and its prices — only `cost` is held back.
    const asTech = await readAs(techToken);
    expect(asTech.price).toBe('2000.00');
    expect(asTech.cost).toBeUndefined();
  });

  test('the same redaction applies to the single-service read', async () => {
    const svc = await seedService({ cost: 300 });
    const { token } = await seedTechnicianAndLogin();

    const res = await request(`/services/${svc.id}`, { headers: jsonHeaders(token) });
    expect(res.status).toBe(200);
    expect((await json<Service>(res)).cost).toBeUndefined();
  });

  test('requires authentication', async () => {
    expect((await request('/services')).status).toBe(401);
  });
});

describe('PATCH /services/:id', () => {
  test('reprices without touching anything else', async () => {
    const svc = await seedService({ price: 100 });
    const { token } = await seedOwnerAndLogin();

    const res = await patchService(token, svc.id, { price: 175.25 });
    expect(res.status).toBe(200);

    const updated = await json<Service>(res);
    expect(updated.price).toBe('175.25');
    expect(updated.uom).toBe(svc.uom);
    expect(updated.taxRate).toBe(svc.taxRate);
  });

  test('unlisting a service clears its price-visible flag', async () => {
    const svc = await seedService({ isListableInWebsite: true, isPriceVisibleInWebsite: true });
    expect(svc.isPriceVisibleInWebsite).toBe(true);

    const { token } = await seedOwnerAndLogin();
    const res = await patchService(token, svc.id, { isListableInWebsite: false });
    expect(res.status).toBe(200);

    // Otherwise relisting later would silently re-expose a price the owner hid.
    const updated = await json<Service>(res);
    expect(updated.isListableInWebsite).toBe(false);
    expect(updated.isPriceVisibleInWebsite).toBe(false);
  });

  test('price visibility cannot be set on an unlisted service', async () => {
    const svc = await seedService();
    const { token } = await seedOwnerAndLogin();

    const res = await patchService(token, svc.id, { isPriceVisibleInWebsite: true });
    expect(res.status).toBe(200);
    expect((await json<Service>(res)).isPriceVisibleInWebsite).toBe(false);
  });

  test('404s on an unknown id', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await patchService(token, '00000000-0000-4000-8000-000000000000', { price: 1 });
    expect(res.status).toBe(404);
  });
});

describe('GET /public/services', () => {
  test('lists opted-in services without auth, and only those', async () => {
    const listed = await seedService({ isListableInWebsite: true });
    const unlisted = await seedService();

    const res = await request('/public/services');
    expect(res.status).toBe(200);

    const body = await json<{ services: PublicService[] }>(res);
    expect(findById(body.services, listed.id)).toBeDefined();
    expect(findById(body.services, unlisted.id)).toBeUndefined();
  });

  test('price appears only when the service opts in, per-service', async () => {
    const withPrice = await seedService({
      price: 4200,
      isListableInWebsite: true,
      isPriceVisibleInWebsite: true,
    });
    const withoutPrice = await seedService({
      price: 999,
      isListableInWebsite: true,
    });

    const body = await json<{ services: PublicService[] }>(await request('/public/services'));
    expect((findById(body.services, withPrice.id) as PublicService).price).toBe('4200.00');
    // Omitted, not zeroed — the site renders "Precio a consultar".
    expect((findById(body.services, withoutPrice.id) as PublicService).price).toBeUndefined();
  });

  test('never leaks cost, the SAT keys or the tax rate', async () => {
    const svc = await seedService({
      cost: 1200,
      satProdServCode: '72101500',
      isListableInWebsite: true,
      isPriceVisibleInWebsite: true,
    });

    const body = await json<{ services: PublicService[] }>(await request('/public/services'));
    const entry = findById(body.services, svc.id) as Record<string, unknown>;
    expect(entry).toBeDefined();
    expect(entry['cost']).toBeUndefined();
    expect(entry['satProdServCode']).toBeUndefined();
    expect(entry['satUnitCode']).toBeUndefined();
    expect(entry['taxRate']).toBeUndefined();
  });
});

describe('DELETE /services/:id', () => {
  test('requires a delete comment', async () => {
    const svc = await seedService();
    const { token } = await seedOwnerAndLogin();

    const res = await request(`/services/${svc.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('soft-deletes: the row leaves every read path but is never removed', async () => {
    const svc = await seedService({ isListableInWebsite: true });
    const { token } = await seedOwnerAndLogin();

    const res = await request(`/services/${svc.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'duplicado' }),
    });
    expect(res.status).toBe(200);

    expect((await request(`/services/${svc.id}`, { headers: jsonHeaders(token) })).status).toBe(404);

    const list = await json<{ services: Service[] }>(
      await request('/services', { headers: jsonHeaders(token) }),
    );
    expect(findById(list.services, svc.id)).toBeUndefined();

    const publicList = await json<{ services: PublicService[] }>(await request('/public/services'));
    expect(findById(publicList.services, svc.id)).toBeUndefined();

    // The row itself survives, stamped with the audit trail.
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    const [row] = await db.select().from(services).where(like(services.name, svc.name)).limit(1);
    expect(row).toBeDefined();
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.deleteComment).toBe('duplicado');
    expect(row!.deletedBy).toBeTruthy();
  });

  test('office cannot delete', async () => {
    const svc = await seedService();
    const { token } = await seedOfficeAndLogin();

    const res = await request(`/services/${svc.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'nope' }),
    });
    expect(res.status).toBe(403);
  });
});

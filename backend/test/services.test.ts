import { afterAll, describe, expect, test } from 'vitest';
import { and, asc, eq, isNull, like } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedOfficeAndLogin,
  seedOwnerAndLogin,
  seedTechnicianAndLogin,
  uniqueServiceCode,
  uniqueServiceName,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { serviceEvents, services } from '../src/modules/database/schema';
import {
  ServiceCreatedVia,
  ServiceEventType,
  ServiceTaxRate,
  ServiceUom,
} from '../src/modules/services/enums/services.enum';

type WorkerEnv = { DATABASE_URL: string; IMAGES_CDN_BASE_URL?: string };

type Service = {
  id: string;
  name: string;
  price: string;
  cost?: string;
  uom: ServiceUom;
  description?: string;
  websiteDescription?: string;
  websiteImageKey?: string;
  websiteImageUrl?: string;
  internalServiceCode?: string;
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
  imageUrl?: string;
  uom: ServiceUom;
  price?: string;
};

type ServiceEvent = {
  id: string;
  type: ServiceEventType;
  actorId: string;
  actorName?: string;
  changes?: Record<string, unknown>;
  note?: string;
  createdAt: string;
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
  sourceServiceId?: string;
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

  test('never leaks cost, the SAT keys, the tax rate or the catalog code', async () => {
    const svc = await seedService({
      cost: 1200,
      satProdServCode: '72101500',
      internalServiceCode: uniqueServiceCode(),
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
    expect(entry['internalServiceCode']).toBeUndefined();
  });

  test('publishes websiteDescription, never the internal description', async () => {
    const svc = await seedService({
      description: 'Nota interna: subir precio en marzo',
      websiteDescription: 'Mantenimiento completo con reporte fotográfico.',
      isListableInWebsite: true,
    });

    const body = await json<{ services: PublicService[] }>(await request('/public/services'));
    const entry = findById(body.services, svc.id) as PublicService;
    expect(entry.description).toBe('Mantenimiento completo con reporte fotográfico.');
  });

  test('a listed service with no website copy is title-only — no fallback', async () => {
    const svc = await seedService({
      description: 'Nota interna que no debe publicarse',
      isListableInWebsite: true,
    });

    const body = await json<{ services: PublicService[] }>(await request('/public/services'));
    const entry = findById(body.services, svc.id) as PublicService;
    // Deliberately absent rather than falling back to the management note.
    expect(entry.description).toBeUndefined();
  });
});

describe('website image (18 §1)', () => {
  // The R2 key the editor would get back from POST /upload/website-image. No
  // real upload here: this suite is about the column and the two DTOs, and the
  // upload route is covered by upload.test.ts.
  const KEY = 'website/1753500000000-chiller.jpg';
  const imagesCdnBase = () => (env as unknown as WorkerEnv).IMAGES_CDN_BASE_URL;

  test('stores the key and answers with both key and materialized URL', async () => {
    const svc = await seedService({ websiteImageKey: KEY });

    // The key round-trips so a re-save never drops the photo…
    expect(svc.websiteImageKey).toBe(KEY);
    // …and the URL is derived, never stored.
    expect(svc.websiteImageUrl).toBe(`${imagesCdnBase()}/${KEY}`);
  });

  test('an empty string clears the photo', async () => {
    const svc = await seedService({ websiteImageKey: KEY });
    const { token } = await seedOwnerAndLogin();

    const res = await patchService(token, svc.id, { websiteImageKey: '' });
    const updated = await json<Service>(res);
    // Cleared to null, not stored as '' — and no URL to materialize.
    expect(updated.websiteImageKey).toBeUndefined();
    expect(updated.websiteImageUrl).toBeUndefined();
  });

  test('the public listing publishes the URL and never the bucket key', async () => {
    const svc = await seedService({ websiteImageKey: KEY, isListableInWebsite: true });

    const body = await json<{ services: PublicService[] }>(await request('/public/services'));
    const entry = findById(body.services, svc.id) as PublicService & Record<string, unknown>;
    expect(entry.imageUrl).toBe(`${imagesCdnBase()}/${KEY}`);
    // An unauthenticated consumer has no business seeing bucket paths.
    expect(entry['websiteImageKey']).toBeUndefined();
  });

  test('a listed service with no photo omits imageUrl entirely', async () => {
    const svc = await seedService({ isListableInWebsite: true });

    const body = await json<{ services: PublicService[] }>(await request('/public/services'));
    // Absent, not '' — the site's cue to render the text-only card.
    expect((findById(body.services, svc.id) as PublicService).imageUrl).toBeUndefined();
  });
});

describe('internalServiceCode', () => {
  test('round-trips and is searchable via ?q=', async () => {
    const code = uniqueServiceCode();
    const svc = await seedService({ internalServiceCode: code });
    expect(svc.internalServiceCode).toBe(code);

    const { token } = await seedOwnerAndLogin();
    const res = await request(`/services?q=${encodeURIComponent(code)}`, {
      headers: jsonHeaders(token),
    });
    const body = await json<{ services: Service[] }>(res);
    expect(findById(body.services, svc.id)).toBeDefined();
  });

  test('rejects a duplicate code with 409', async () => {
    const code = uniqueServiceCode();
    await seedService({ internalServiceCode: code });

    const { token } = await seedOwnerAndLogin();
    const res = await createService(token, serviceBody({ internalServiceCode: code }));
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('internal_service_code_in_use');
  });

  test('a soft-deleted service releases its code for reuse', async () => {
    const code = uniqueServiceCode();
    const first = await seedService({ internalServiceCode: code });
    const { token } = await seedOwnerAndLogin();

    await request(`/services/${first.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'reemplazado' }),
    });

    // The unique index is partial on `deleted_at is null`, so the tombstoned
    // row no longer blocks the code.
    const res = await createService(token, serviceBody({ internalServiceCode: code }));
    expect(res.status).toBe(201);
  });

  test('two services may both leave the code empty', async () => {
    // Nulls are exempt from the unique index — otherwise only one service
    // could ever go without a code.
    await seedService();
    const { token } = await seedOwnerAndLogin();
    expect((await createService(token, serviceBody())).status).toBe(201);
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

describe('GET /services/:id/timeline (18 §6.1)', () => {
  const timeline = (token: string, id: string) =>
    request(`/services/${id}/timeline`, { headers: jsonHeaders(token) });

  test('creation opens the trail: service_created, via form, actor resolved', async () => {
    const svc = await seedService();
    const { token } = await seedAdminAndLogin();

    const res = await timeline(token, svc.id);
    expect(res.status).toBe(200);

    const events = await json<ServiceEvent[]>(res);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(ServiceEventType.Created);
    expect(events[0]!.changes).toEqual({ via: ServiceCreatedVia.Form });
    // Resolved at read time — the UI renders "quién" without a lookup table.
    expect(events[0]!.actorName).toBeTruthy();
  });

  test('a clone create records via clone + the source id (18 §6.2)', async () => {
    const source = await seedService();
    const { token } = await seedOwnerAndLogin();

    const res = await createService(token, serviceBody({ sourceServiceId: source.id }));
    expect(res.status).toBe(201);
    const clone = await json<Service>(res);

    const events = await json<ServiceEvent[]>(await timeline(token, clone.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(ServiceEventType.Created);
    // Derived from the id's presence — the clone's own trail names its source.
    expect(events[0]!.changes).toEqual({
      via: ServiceCreatedVia.Clone,
      sourceServiceId: source.id,
    });
  });

  test('an edit appends per-field old→new; a no-op edit appends nothing', async () => {
    const svc = await seedService({ price: 100 });
    const { token } = await seedOwnerAndLogin();

    expect((await patchService(token, svc.id, { price: 175.25 })).status).toBe(200);

    let events = await json<ServiceEvent[]>(await timeline(token, svc.id));
    expect(events).toHaveLength(2);
    expect(events[1]!.type).toBe(ServiceEventType.Updated);
    // Only the edited column, both sides as the fixed-2 strings money lives as.
    expect(events[1]!.changes).toEqual({ price: { old: '100.00', new: '175.25' } });

    // Re-sending the same price changes nothing — a trail row that says
    // "nothing changed" would be noise, so none is written.
    expect((await patchService(token, svc.id, { price: 175.25 })).status).toBe(200);
    events = await json<ServiceEvent[]>(await timeline(token, svc.id));
    expect(events).toHaveLength(2);
  });

  test('the trail returns in insertion order (seq, never created_at)', async () => {
    const svc = await seedService({ price: 50 });
    const { token } = await seedOwnerAndLogin();

    await patchService(token, svc.id, { price: 60 });
    await patchService(token, svc.id, { price: 70 });

    const events = await json<ServiceEvent[]>(await timeline(token, svc.id));
    expect(events.map((e) => e.type)).toEqual([
      ServiceEventType.Created,
      ServiceEventType.Updated,
      ServiceEventType.Updated,
    ]);
    expect((events[1]!.changes as { price: { new: string } }).price.new).toBe('60.00');
    expect((events[2]!.changes as { price: { new: string } }).price.new).toBe('70.00');
  });

  test('delete writes service_deleted with the comment; the trail goes unreachable with the row', async () => {
    const svc = await seedService();
    const { token } = await seedOwnerAndLogin();

    await request(`/services/${svc.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'obsoleto' }),
    });

    // The API path 404s like every other read of a tombstoned service…
    expect((await timeline(token, svc.id)).status).toBe(404);

    // …but the row is the record: the event exists, stamped with the comment.
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    const rows = await db
      .select()
      .from(serviceEvents)
      .where(eq(serviceEvents.serviceId, svc.id))
      .orderBy(asc(serviceEvents.seq));
    const last = rows.at(-1)!;
    expect(last.type).toBe(ServiceEventType.Deleted);
    expect(last.note).toBe('obsoleto');
    expect(last.actorId).toBeTruthy();
  });

  test('admin-tier only: office and technician get 403, not a redacted trail', async () => {
    const svc = await seedService();

    // The trail carries cost old→new diffs and delete comments — management
    // audit, so office reads the catalog but never who repriced what.
    const { token: officeToken } = await seedOfficeAndLogin();
    expect((await timeline(officeToken, svc.id)).status).toBe(403);

    const { token: techToken } = await seedTechnicianAndLogin();
    expect((await timeline(techToken, svc.id)).status).toBe(403);
  });

  test('404s on an unknown id', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await timeline(token, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});

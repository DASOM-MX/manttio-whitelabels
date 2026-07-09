import { afterAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import { seedAdminAndLogin, seedOwnerAndLogin, seedTechnicianAndLogin, uniqueName } from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { reportTemplates } from '../src/modules/database/schema';

type WorkerEnv = { DATABASE_URL: string };

type Template = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'disabled';
  sections: {
    id: string;
    order: number;
    title: string;
    columns: number;
    questions: {
      id: string;
      order: number;
      label: string;
      datatype: string;
      required: boolean;
      unit?: string;
    }[];
  }[];
  disabledReason?: string | null;
};

// No fixture-email pattern on this table — track created ids and hard-delete
// them at the end (fixture cleanup is the sanctioned hard-delete case).
const createdIds: string[] = [];

afterAll(async () => {
  if (!createdIds.length) return;
  const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
  await db.delete(reportTemplates).where(inArray(reportTemplates.id, createdIds));
});

const templateBody = (name: string, question: Record<string, unknown>) => ({
  name,
  sections: [{ title: 'Mediciones', columns: 2, questions: [question] }],
});

const numberQuestion = (unit?: string) => ({
  label: 'Voltaje de entrada',
  datatype: 'number',
  required: true,
  ...(unit ? { unit } : {}),
});

const createTemplate = async (token: string, body: object): Promise<Response> => {
  const res = await request('/report-templates', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  if (res.status === 201) {
    const clone = await res.clone().json() as Template;
    createdIds.push(clone.id);
  }
  return res;
};

describe('POST /report-templates (unit rule)', () => {
  test('number question round-trips a whitelisted unit; ids and order are minted', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await createTemplate(token, templateBody(uniqueName('tpl'), numberQuestion('V')));
    expect(res.status).toBe(201);
    const tpl = await json<Template>(res);
    expect(tpl.status).toBe('draft');
    const q = tpl.sections[0]!.questions[0]!;
    expect(q.unit).toBe('V');
    expect(q.id).toBeTruthy();
    expect(q.order).toBe(0);
    expect(tpl.sections[0]!.id).toBeTruthy();

    const read = await request(`/report-templates/${tpl.id}`, { headers: jsonHeaders(token) });
    expect(read.status).toBe(200);
    const fetched = await json<Template>(read);
    expect(fetched.sections[0]!.questions[0]!.unit).toBe('V');
  });

  test('unit outside the whitelist → 400', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await createTemplate(
      token,
      templateBody(uniqueName('tpl'), numberQuestion('furlongs')),
    );
    expect(res.status).toBe(400);
  });

  test('unit on a non-number question → 400', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await createTemplate(
      token,
      templateBody(uniqueName('tpl'), {
        label: 'Marca',
        datatype: 'text',
        required: false,
        unit: 'cm',
      }),
    );
    expect(res.status).toBe(400);
  });

  test('unit is optional — unitless number question is valid', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await createTemplate(token, templateBody(uniqueName('tpl'), numberQuestion()));
    expect(res.status).toBe(201);
    const tpl = await json<Template>(res);
    expect(tpl.sections[0]!.questions[0]!.unit).toBeUndefined();
  });

  test('technician cannot create → 403', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/report-templates', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(templateBody(uniqueName('tpl'), numberQuestion('A'))),
    });
    expect(res.status).toBe(403);
  });
});

describe('report-templates lifecycle', () => {
  test('draft → active → draft → disabled (terminal); PATCH only in draft', async () => {
    const { token } = await seedOwnerAndLogin();
    const created = await createTemplate(
      token,
      templateBody(uniqueName('tpl'), numberQuestion('psi')),
    );
    const tpl = await json<Template>(created);

    const activate = await request(`/report-templates/${tpl.id}/activate`, {
      method: 'POST',
      headers: jsonHeaders(token),
    });
    expect(activate.status).toBe(200);
    expect((await json<Template>(activate)).status).toBe('active');

    // Active is not editable.
    const patchActive = await request(`/report-templates/${tpl.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify(templateBody('renamed', numberQuestion('psi'))),
    });
    expect(patchActive.status).toBe(409);
    expect(await json(patchActive)).toEqual({ error: 'template_not_draft' });

    // Pull back to draft (the edit path), then edit — unit swap sticks.
    const deactivate = await request(`/report-templates/${tpl.id}/deactivate`, {
      method: 'POST',
      headers: jsonHeaders(token),
    });
    expect(deactivate.status).toBe(200);
    const patched = await request(`/report-templates/${tpl.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify(templateBody(tpl.name, numberQuestion('bar'))),
    });
    expect(patched.status).toBe(200);
    expect((await json<Template>(patched)).sections[0]!.questions[0]!.unit).toBe('bar');

    // Disable is terminal and audited.
    const disable = await request(`/report-templates/${tpl.id}/disable`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ reason: 'obsoleta' }),
    });
    expect(disable.status).toBe(200);
    const disabled = await json<Template>(disable);
    expect(disabled.status).toBe('disabled');
    expect(disabled.disabledReason).toBe('obsoleta');

    const reactivate = await request(`/report-templates/${tpl.id}/activate`, {
      method: 'POST',
      headers: jsonHeaders(token),
    });
    expect(reactivate.status).toBe(409);
  });

  test('list pages and filters by status; technician can read', async () => {
    const { token } = await seedOwnerAndLogin();
    const created = await createTemplate(
      token,
      templateBody(uniqueName('tpl'), numberQuestion('°C')),
    );
    const tpl = await json<Template>(created);
    await request(`/report-templates/${tpl.id}/activate`, {
      method: 'POST',
      headers: jsonHeaders(token),
    });

    const { token: techToken } = await seedTechnicianAndLogin();
    const res = await request('/report-templates?status=active&page=1&limit=5', {
      headers: jsonHeaders(techToken),
    });
    expect(res.status).toBe(200);
    const body = await json<{ items: Template[]; total: number }>(res);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.items.every((t) => t.status === 'active')).toBe(true);
    expect(body.items.some((t) => t.id === tpl.id)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
  });
});

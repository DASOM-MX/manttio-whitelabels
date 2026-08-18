import { beforeAll, describe, expect, test } from 'vitest';
import { ReportStatus } from '../src/modules/reports/enums/reports.enum';
import { authHeader, json, jsonHeaders, request } from './helpers/request';
import {
  ensureFixtureTemplate,
  seedAdmin,
  seedAdminAndLogin,
  seedCustomer,
  seedReport,
  seedTechnician,
  seedTechnicianAndLogin,
  loginAs,
} from './helpers/fixtures';

type ReportRow = {
  id: string;
  templateId: string | null;
  reportType: string;
  workType: string | null;
  status: 'created' | 'in-progress' | 'finished' | 'mailed';
  createdBy: string;
  assignedTo: string;
  clientId: string;
  signedBy: string | null;
  deletedAt: string | null;
};

type ReportDetailRow = {
  reportId: string;
  data: {
    templateId: string;
    templateName: string;
    sections: Array<{
      title: string;
      columns: 1 | 2 | 3;
      answers: Array<{
        questionId: string;
        label: string;
        datatype: string;
        unit?: string;
        value: unknown;
      }>;
    }>;
  };
  pictures: string[];
  signature: string | null;
};

type ReportListResponse = {
  items: ReportRow[];
  total: number;
  page: number;
  limit: number;
};

type ReportDetail = {
  id: string;
  templateId: string | null;
  templateName: string;
  reportType: string;
  workType: string | null;
  createdBy: string;
  assignedTo: string;
  clientId: string;
  status: string;
  sections: Array<{
    title: string;
    columns: 1 | 2 | 3;
    answers: Array<{
      questionId: string;
      label: string;
      datatype: string;
      unit?: string;
      value: unknown;
    }>;
  }>;
  photos: string[];
  signatureUrl: string | null;
};

const FOLIO_RE = /^R-\d{8}-\d{4}$/;

// Resolved once against the real fixture template: `reports.template_id` is a
// live FK (03 CP-1), so a synthetic uuid is rejected by the constraint.
let TEMPLATE_ID = '';
beforeAll(async () => {
  TEMPLATE_ID = await ensureFixtureTemplate();
});

const validReportCapture = () => ({
  templateId: TEMPLATE_ID,
  templateName: 'Minisplit Maintenance',
  sections: [
    {
      title: 'General Inspection',
      columns: 1,
      answers: [
        {
          questionId: '00000000-0000-0000-0000-000000000101',
          label: 'Operating',
          datatype: 'boolean',
          value: true,
        },
        {
          questionId: '00000000-0000-0000-0000-000000000102',
          label: 'Amperage',
          datatype: 'text',
          value: '5.2',
        },
      ],
    },
  ],
});

const buildCreateForm = (opts: {
  templateId?: string;
  clientId: string;
  assignedTo?: string;
  createdBy?: string;
  workType?: string;
  data?: Record<string, unknown> | string; // string for malformed-JSON tests
  omitData?: boolean;
}): FormData => {
  const fd = new FormData();
  fd.set('template_id', opts.templateId ?? TEMPLATE_ID);
  fd.set('client_id', opts.clientId);
  if (opts.assignedTo !== undefined) fd.set('assigned_to', opts.assignedTo);
  if (opts.createdBy !== undefined) fd.set('created_by', opts.createdBy);
  if (opts.workType !== undefined) fd.set('work_type', opts.workType);
  if (!opts.omitData) {
    const data = opts.data ?? validReportCapture();
    fd.set('data', typeof data === 'string' ? data : JSON.stringify(data));
  }
  return fd;
};

const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

// --- LIST /reports ---

describe('GET /reports', () => {
  test('admin sees a seeded report in the list', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const res = await request('/reports', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ items: ReportRow[]; total: number; page: number; limit: number }>(res);
    expect(body.items.some((r) => r.id === seeded.id)).toBe(true);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.total).toBeGreaterThan(0);
  });

  test('admin filter by status returns only matching status', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const created = await seedReport({
      createdBy: admin.id,
      clientId: customer.id,
      status: ReportStatus.Created,
    });
    const finished = await seedReport({
      createdBy: admin.id,
      clientId: customer.id,
      status: ReportStatus.Finished,
    });

    const res = await request(`/reports?status=finished&client_id=${customer.id}`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<ReportListResponse>(res);
    const ids = body.items.map((r) => r.id);
    expect(ids).toContain(finished.id);
    expect(ids).not.toContain(created.id);
  });

  test('admin filter by client_id returns only that client', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const [a, b] = await Promise.all([seedCustomer(), seedCustomer()]);
    const ra = await seedReport({ createdBy: admin.id, clientId: a.id });
    const rb = await seedReport({ createdBy: admin.id, clientId: b.id });

    const res = await request(`/reports?client_id=${a.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<ReportListResponse>(res);
    const ids = body.items.map((r) => r.id);
    expect(ids).toContain(ra.id);
    expect(ids).not.toContain(rb.id);
  });

  test('admin filter by assigned_to returns only that assignee', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const customer = await seedCustomer();
    const mine = await seedReport({ createdBy: admin.id, clientId: customer.id });
    const theirs = await seedReport({
      createdBy: admin.id,
      assignedTo: tech.id,
      clientId: customer.id,
    });

    const res = await request(`/reports?assigned_to=${tech.id}&client_id=${customer.id}`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<ReportListResponse>(res);
    const ids = body.items.map((r) => r.id);
    expect(ids).toContain(theirs.id);
    expect(ids).not.toContain(mine.id);
  });

  test('admin filter by folio prefix returns matching ids', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });
    const prefix = seeded.id.slice(0, 'R-20991231'.length); // R-20991231 (all of 2099-12-31)

    const res = await request(`/reports?folio=${prefix}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<ReportListResponse>(res);
    expect(body.items.every((r) => r.id.startsWith(prefix))).toBe(true);
    expect(body.items.some((r) => r.id === seeded.id)).toBe(true);
  });

  test('technician sees only reports assigned to them (auto-scoped)', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const otherTech = await seedTechnician();
    const customer = await seedCustomer();
    const mine = await seedReport({ createdBy: tech.id, clientId: customer.id });
    const theirs = await seedReport({
      createdBy: otherTech.id,
      assignedTo: otherTech.id,
      clientId: customer.id,
    });

    const res = await request('/reports', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<ReportListResponse>(res);
    const ids = body.items.map((r) => r.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  test('technician assigned_to query param is ignored (still scoped to self)', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const otherTech = await seedTechnician();
    const customer = await seedCustomer();
    const mine = await seedReport({ createdBy: tech.id, clientId: customer.id });
    const theirs = await seedReport({
      createdBy: otherTech.id,
      assignedTo: otherTech.id,
      clientId: customer.id,
    });

    const res = await request(`/reports?assigned_to=${otherTech.id}`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<ReportListResponse>(res);
    const ids = body.items.map((r) => r.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  test('invalid status filter → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/reports?status=bogus', { headers: authHeader(token) });
    expect(res.status).toBe(400);
  });

  test('invalid client_id (not a uuid) → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/reports?client_id=not-a-uuid', { headers: authHeader(token) });
    expect(res.status).toBe(400);
  });
});

// --- GET /reports/:id ---

describe('GET /reports/:id', () => {
  test('admin can fetch any report with details', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<ReportDetail>(res);
    expect(body.id).toBe(seeded.id);
    // `toBe` is Object.is, which an asymmetric matcher can never satisfy — this
    // assertion passed vacuously as written only because it never ran green.
    expect(body.templateId).toEqual(expect.any(String));
    expect(body.templateName).toEqual(expect.any(String));
    expect(body.sections).toEqual(expect.any(Array));
  });

  test('technician can fetch a report assigned to them', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: tech.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
  });

  test('technician gets 403 on another tech’s report', async () => {
    const { token } = await seedTechnicianAndLogin();
    const otherTech = await seedTechnician();
    const customer = await seedCustomer();
    const seeded = await seedReport({
      createdBy: otherTech.id,
      assignedTo: otherTech.id,
      clientId: customer.id,
    });

    const res = await request(`/reports/${seeded.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'forbidden' });
  });

  test('unknown report id → 404', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/reports/R-20990101-9999', { headers: authHeader(token) });
    expect(res.status).toBe(404);
  });
});

// --- POST /reports (multipart) ---

describe('POST /reports', () => {
  test('admin creates a report from a template (201) with R-YYYYMMDD-NNNN folio', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id }),
    });
    expect(res.status).toBe(201);

    const body = await json<{ report: ReportRow; details: ReportDetailRow }>(res);
    expect(body.report.id).toMatch(FOLIO_RE);
    expect(body.report.reportType).toBe('Minisplit Maintenance'); // template name, denormalized
    expect(body.report.clientId).toBe(customer.id);
    expect(body.report.createdBy).toBe(admin.id);
    expect(body.report.assignedTo).toBe(admin.id); // defaults to self
    expect(body.report.status).toBe('created');
    expect(body.details.data).toMatchObject({
      templateId: TEMPLATE_ID,
      templateName: 'Minisplit Maintenance',
      sections: expect.any(Array),
    });
    expect(body.details.pictures).toEqual([]);
    expect(body.details.signature).toBeNull();
  });

  test('admin can assign a different user', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id, assignedTo: tech.id }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ report: ReportRow }>(res);
    expect(body.report.createdBy).toBe(admin.id);
    expect(body.report.assignedTo).toBe(tech.id);
  });

  test('offline sync: created_by attributes the report to the original creator, not the uploader', async () => {
    // Tech B uploads a report tech A created offline (e.g. after a phone swap).
    const creator = await seedTechnician();
    const { tech: uploader, token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id, createdBy: creator.id }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ report: ReportRow }>(res);
    expect(body.report.createdBy).toBe(creator.id); // original creator, not the uploader
    expect(body.report.assignedTo).toBe(creator.id); // assignee follows the creator
    expect(body.report.createdBy).not.toBe(uploader.id);
  });

  test('nonexistent created_by (valid uuid) → 400 invalid_creator', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id, createdBy: FAKE_UUID }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_creator' });
  });

  test('admin: nonexistent assigned_to (valid uuid) → 400 invalid_assignee', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id, assignedTo: FAKE_UUID }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_assignee' });
  });

  test('admin: nonexistent client_id (valid uuid) → 400 invalid_client', async () => {
    const { token } = await seedAdminAndLogin();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: FAKE_UUID }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_client' });
  });

  test('technician auto-assigns the report to themselves', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ report: ReportRow }>(res);
    expect(body.report.createdBy).toBe(tech.id);
    expect(body.report.assignedTo).toBe(tech.id);
  });

  test('technician can pick a different assignee (trusted-field model)', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const otherTech = await seedTechnician();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id, assignedTo: otherTech.id }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ report: ReportRow }>(res);
    expect(body.report.createdBy).toBe(tech.id);
    expect(body.report.assignedTo).toBe(otherTech.id); // honored, same as createdBy
  });

  test('missing data field → 400 missing_data', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id, omitData: true }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'missing_data' });
  });

  test('malformed data JSON → 400 invalid_data_json', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const res = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id, data: '{not json' }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_data_json' });
  });

  test('two consecutive creates on the same day produce ascending folio sequence', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    const res1 = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id }),
    });
    const res2 = await request('/reports', {
      method: 'POST',
      headers: authHeader(token),
      body: buildCreateForm({ clientId: customer.id }),
    });
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    const b1 = await json<{ report: ReportRow }>(res1);
    const b2 = await json<{ report: ReportRow }>(res2);

    // Same day prefix, strictly increasing sequence.
    const day1 = b1.report.id.slice(0, 'R-YYYYMMDD'.length);
    const day2 = b2.report.id.slice(0, 'R-YYYYMMDD'.length);
    expect(day1).toBe(day2);
    const seq1 = Number(b1.report.id.slice(-4));
    const seq2 = Number(b2.report.id.slice(-4));
    expect(seq2).toBeGreaterThan(seq1);
  });
});

// --- PATCH /reports/:id ---

describe('PATCH /reports/:id', () => {
  test('admin patches work_type → 200; status auto-transitions created→in-progress', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({
      createdBy: admin.id,
      clientId: customer.id,
      status: ReportStatus.Created,
    });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ work_type: 'Preventivo' }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ report: ReportRow; details: ReportDetailRow }>(res);
    expect(body.report.workType).toBe('Preventivo');
    expect(body.report.status).toBe('in-progress');
  });

  test('admin patches data → 200 and details row reflects new data', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({
      createdBy: admin.id,
      clientId: customer.id,
      status: ReportStatus.InProgress,
    });

    const newCapture = {
      ...validReportCapture(),
      sections: [
        {
          title: 'General Inspection',
          columns: 1,
          answers: [
            {
              questionId: '00000000-0000-0000-0000-000000000101',
              label: 'Operating',
              datatype: 'boolean',
              value: true,
            },
            {
              questionId: '00000000-0000-0000-0000-000000000103',
              label: 'Observations',
              datatype: 'textarea',
              value: 'updated by patch',
            },
          ],
        },
      ],
    };
    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ data: newCapture }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ report: ReportRow; details: ReportDetailRow }>(res);
    const section = body.details.data.sections[0];
    if (section && section.answers && section.answers[1]) {
      expect(section.answers[1].value).toBe('updated by patch');
    } else {
      expect.fail('Section or answers not found in patch response');
    }
  });

  test('admin patches client_id (valid customer) → 200', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const [a, b] = await Promise.all([seedCustomer(), seedCustomer()]);
    const seeded = await seedReport({ createdBy: admin.id, clientId: a.id });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ client_id: b.id }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ report: ReportRow }>(res);
    expect(body.report.clientId).toBe(b.id);
  });

  test('admin patches client_id with nonexistent uuid → 400 invalid_client', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ client_id: FAKE_UUID }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_client' });
  });

  test('technician can patch a report assigned to them', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: tech.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ work_type: 'Correctivo' }),
    });
    expect(res.status).toBe(200);
  });

  test('technician 403 on another tech’s report', async () => {
    const { token } = await seedTechnicianAndLogin();
    const otherTech = await seedTechnician();
    const customer = await seedCustomer();
    const seeded = await seedReport({
      createdBy: otherTech.id,
      assignedTo: otherTech.id,
      clientId: customer.id,
    });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ work_type: 'Preventivo' }),
    });
    expect(res.status).toBe(403);
  });

  test('finished report → 409 not_editable', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({
      createdBy: admin.id,
      clientId: customer.id,
      status: ReportStatus.Finished,
    });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ work_type: 'Preventivo' }),
    });
    expect(res.status).toBe(409);
    const body = await json<{ error: string; status: string }>(res);
    expect(body.error).toBe('not_editable');
    expect(body.status).toBe('finished');
  });

  test('unknown id → 404', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/reports/R-20990101-9999', {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ work_type: 'Preventivo' }),
    });
    expect(res.status).toBe(404);
  });

  test('empty body → 400', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

// --- PUT /reports/:id/assignee ---

describe('PUT /reports/:id/assignee', () => {
  test('admin reassigns a report → 200', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}/assignee`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ assigned_to: tech.id }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ report: ReportRow }>(res);
    expect(body.report.assignedTo).toBe(tech.id);
  });

  test('technician cannot reassign → 403', async () => {
    const tech = await seedTechnician();
    const otherTech = await seedTechnician();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: tech.id, clientId: customer.id });
    const token = await loginAs(tech);

    const res = await request(`/reports/${seeded.id}/assignee`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ assigned_to: otherTech.id }),
    });
    expect(res.status).toBe(403);
  });

  test('noop when assigned_to is already the current assignee', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}/assignee`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ assigned_to: admin.id }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ report: ReportRow }>(res);
    expect(body.report.assignedTo).toBe(admin.id);
  });

  test('nonexistent assigned_to (valid uuid) → 400 invalid_assignee', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}/assignee`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ assigned_to: FAKE_UUID }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_assignee' });
  });

  test('unknown report id → 404', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const res = await request('/reports/R-20990101-9999/assignee', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ assigned_to: admin.id }),
    });
    expect(res.status).toBe(404);
  });
});

// --- DELETE /reports/:id (admin, soft) ---

describe('DELETE /reports/:id', () => {
  test('admin soft-deletes a report; subsequent GET returns 404', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: admin.id, clientId: customer.id });

    const del = await request(`/reports/${seeded.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(del.status).toBe(200);
    expect(await json(del)).toEqual({ id: seeded.id, deleted: true });

    const after = await request(`/reports/${seeded.id}`, { headers: authHeader(token) });
    expect(after.status).toBe(404);
  });

  test('technician cannot delete → 403', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const seeded = await seedReport({ createdBy: tech.id, clientId: customer.id });

    const res = await request(`/reports/${seeded.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(res.status).toBe(403);
  });

  test('unknown id → 404', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/reports/R-20990101-9999', {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(res.status).toBe(404);
  });
});

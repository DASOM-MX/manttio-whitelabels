import { afterAll, describe, expect, test } from 'vitest';
import { and, eq, like, or } from 'drizzle-orm';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdmin,
  seedAdminAndLogin,
  seedCustomer,
  seedOwner,
  seedOwnerAndLogin,
  uniqueName,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { notifications } from '../src/modules/database/schema';
import { notify } from '../src/modules/notifications/services/notifications.service';
import { createLead } from '../src/modules/customers/services/leads.service';
import { NotificationType } from '../src/modules/notifications/enums/notifications.enum';
import { ClientType } from '../src/modules/customers/enums/customers.enum';
import type { NotificationRow } from '../src/modules/notifications/types/notifications.types';

type WorkerEnv = { DATABASE_URL: string };

let client: ReturnType<typeof createDb> | undefined;
const db = () => (client ??= createDb((env as unknown as WorkerEnv).DATABASE_URL));

const tag = () => Math.random().toString(36).slice(2, 10);

// Every row the triggers create during this suite embeds a fixture marker in
// its body (customer/lead fixture names) or carries a notif-test title — the
// same sanctioned leaf-table cleanup as notifications.test.ts. Broadcasts
// also address the accumulated fixture owners; the patterns catch those
// copies too.
afterAll(async () => {
  await db()
    .delete(notifications)
    .where(
      or(
        like(notifications.title, 'notif-test-%'),
        like(notifications.body, '%test-customer-%'),
        like(notifications.body, '%test-lead-%'),
      ),
    );
});

const rowsFor = async (
  recipientUserId: string,
  type: NotificationType,
): Promise<NotificationRow[]> =>
  db()
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.recipientUserId, recipientUserId), eq(notifications.type, type)),
    );

// 1×1 transparent PNG — enough for the signature upload path.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('notify() excludeUserId', () => {
  test('the actor is dropped from a role broadcast', async () => {
    const adminA = await seedAdmin();
    const adminB = await seedAdmin();
    const rows = await notify(db(), {
      role: 'admin',
      excludeUserId: adminA.id,
      type: NotificationType.ReplenishmentReady,
      title: `notif-test-exclude-${tag()}`,
      body: 'x',
    });
    expect(rows.some((r) => r.recipientUserId === adminA.id)).toBe(false);
    expect(rows.filter((r) => r.recipientUserId === adminB.id)).toHaveLength(1);
  });
});

describe('customer lifecycle triggers', () => {
  test(
    'create / update / interaction / blacklist / archive each notify owners, never the actor',
    async () => {
      const observer = await seedOwner();
      const { owner: actor, token } = await seedOwnerAndLogin();
      const customerName = uniqueName('customer');

      // Create (from superadmin) — the body names the acting user.
      const createRes = await request('/customers', {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ name: customerName }),
      });
      expect(createRes.status).toBe(201);
      const { customer } = await json<{ customer: { id: string } }>(createRes);

      const created = await rowsFor(observer.id, NotificationType.ClientRegisteredFromSuperadmin);
      expect(created).toHaveLength(1);
      expect(created[0]!.body).toContain(customerName);
      expect(created[0]!.body).toContain('por test owner');
      expect(created[0]!.audienceRole).toBe('owner');
      expect(created[0]!.data).toMatchObject({ customerId: customer.id });
      // The acting owner never hears about their own action.
      expect(
        await rowsFor(actor.id, NotificationType.ClientRegisteredFromSuperadmin),
      ).toHaveLength(0);

      // Update — actor named in the body.
      const patchRes = await request(`/customers/${customer.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(token),
        body: JSON.stringify({ observation: 'nota' }),
      });
      expect(patchRes.status).toBe(200);
      const updated = await rowsFor(observer.id, NotificationType.ClientUpdated);
      expect(updated).toHaveLength(1);
      expect(updated[0]!.body).toContain('actualizó los datos de');
      expect(updated[0]!.body).toContain(customerName);
      expect(await rowsFor(actor.id, NotificationType.ClientUpdated)).toHaveLength(0);

      // Manual interaction.
      const interactionRes = await request(`/customers/${customer.id}/interactions`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ type: 'call', body: 'llamada de seguimiento' }),
      });
      expect(interactionRes.status).toBe(201);
      const interacted = await rowsFor(
        observer.id,
        NotificationType.ClientInteractionRegistered,
      );
      expect(interacted).toHaveLength(1);
      expect(interacted[0]!.body).toContain(customerName);

      // Blacklist via the dedicated transition.
      const statusRes = await request(`/customers/${customer.id}/status`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ status: 'blacklisted', reason: 'pagos vencidos' }),
      });
      expect(statusRes.status).toBe(200);
      const blacklisted = await rowsFor(observer.id, NotificationType.ClientBlacklisted);
      expect(blacklisted).toHaveLength(1);
      expect(blacklisted[0]!.body).toContain('pagos vencidos');

      // Archive (soft delete).
      const deleteRes = await request(`/customers/${customer.id}`, {
        method: 'DELETE',
        headers: authHeader(token),
      });
      expect(deleteRes.status).toBe(200);
      const archived = await rowsFor(observer.id, NotificationType.ClientArchived);
      expect(archived).toHaveLength(1);
      expect(archived[0]!.body).toContain(customerName);
      expect(await rowsFor(actor.id, NotificationType.ClientArchived)).toHaveLength(0);
    },
    60_000,
  );

  test('a website lead notifies every owner (no actor to exclude)', async () => {
    const observer = await seedOwner();
    const leadLast = `test-lead-${tag()}`;
    await createLead(db(), {
      firstName: 'Notif',
      lastName: leadLast,
      email: `dasom.mx+test-lead-${tag()}@gmail.com`,
      clientType: ClientType.Person,
      turnstileToken: 'test-token',
    });
    const rows = await rowsFor(observer.id, NotificationType.ClientRegisteredFromWebsite);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain(leadLast);
  });
});

describe('report lifecycle triggers', () => {
  test(
    'an unsigned create notifies report_created; a signed-at-creation report only report_finalized',
    async () => {
      const observer = await seedOwner();
      const { token } = await seedAdminAndLogin();
      const customer = await seedCustomer();

      // Unsigned create → `created`.
      const fd = new FormData();
      fd.set('report_type', 'minisplit');
      fd.set('client_id', customer.id);
      fd.set(
        'data',
        JSON.stringify({
          is_operating: true,
          remote_working: true,
          amperage: '5.2',
          filter: true,
          inner_voltage: '220',
          unusual_noise: false,
          observations: 'notif trigger',
        }),
      );
      const createRes = await request('/reports', {
        method: 'POST',
        headers: authHeader(token),
        body: fd,
      });
      expect(createRes.status).toBe(201);
      const createdBody = await json<{ report: { id: string } }>(createRes);

      const createdRows = await rowsFor(observer.id, NotificationType.ReportCreated);
      expect(createdRows).toHaveLength(1);
      expect(createdRows[0]!.body).toContain(createdBody.report.id);
      expect(createdRows[0]!.body).toContain(customer.name);
      expect(createdRows[0]!.data).toMatchObject({ reportId: createdBody.report.id });

      // Signed at creation → straight to `finished`: one notice, not two.
      const signedFd = new FormData();
      signedFd.set('report_type', 'minisplit');
      signedFd.set('client_id', customer.id);
      signedFd.set(
        'data',
        JSON.stringify({
          is_operating: true,
          remote_working: true,
          amperage: '5.2',
          filter: true,
          inner_voltage: '220',
          unusual_noise: false,
          observations: 'notif trigger signed',
        }),
      );
      signedFd.set('signed_by', 'Cliente de Prueba');
      signedFd.set('signature_base64', PNG_B64);
      signedFd.set('signed_latitude', '25.65');
      signedFd.set('signed_longitude', '-100.29');
      const signedRes = await request('/reports', {
        method: 'POST',
        headers: authHeader(token),
        body: signedFd,
      });
      expect(signedRes.status).toBe(201);
      const signedBody = await json<{ report: { id: string; status: string } }>(signedRes);
      expect(signedBody.report.status).toBe('finished');

      const finalizedRows = await rowsFor(observer.id, NotificationType.ReportFinalized);
      expect(finalizedRows).toHaveLength(1);
      expect(finalizedRows[0]!.body).toContain(signedBody.report.id);
      // No `created` notice for the signed report — only for the first one.
      const createdAfter = await rowsFor(observer.id, NotificationType.ReportCreated);
      expect(createdAfter).toHaveLength(1);
      expect(createdAfter[0]!.body).not.toContain(signedBody.report.id);
    },
    60_000,
  );
});

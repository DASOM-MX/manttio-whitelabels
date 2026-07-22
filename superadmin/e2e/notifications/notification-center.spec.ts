import { expect, test } from '@playwright/test';
import { mockNotificationsApi, signIn } from '../support/superadmin';

test.describe('Notification center — shell bell', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('streams into the badge, renders the panel, marks read + navigates, clears via read-all', async ({
    page,
  }) => {
    const api = await mockNotificationsApi(page);
    // The announcement deep-links to a customer view — stub its reads so the
    // navigation lands on a rendered page instead of an error state.
    await page.route(/\/customers\/c-1$/, (route) =>
      route.fulfill({
        json: {
          customer: {
            id: 'c-1',
            name: 'Cliente Uno',
            status: 'active',
            source: 'other',
            tags: [],
            contacts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      }),
    );
    await page.route(/\/customers\/c-1\/(equipment|reports|interactions)(\?.*)?$/, (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, limit: 10 } }),
    );

    await page.goto('/dashboard');

    // One unread from the one-shot GET + one pushed over the stream = 2.
    const bell = page.getByRole('button', { name: /^Notificaciones/ });
    await expect(bell).toHaveAccessibleName('Notificaciones, 2 sin leer');

    await bell.click();
    await expect(page.getByText('Aviso del propietario')).toBeVisible();
    // The stream-pushed row is in the panel without any refetch.
    await expect(page.getByText('Cliente nuevo desde el sitio web')).toBeVisible();

    // Clicking a row marks it read and follows its deep link.
    await page.getByText('Aviso del propietario').click();
    await expect(page).toHaveURL(/\/customers\/c-1$/);
    expect(api.markedRead()).toContain('n-1');
    await expect(bell).toHaveAccessibleName('Notificaciones, 1 sin leer');

    // Read-all clears the badge entirely.
    await bell.click();
    await page.getByRole('button', { name: 'Marcar todas como leídas' }).click();
    await expect(bell).toHaveAccessibleName('Notificaciones');
    expect(api.readAllCalls()).toBe(1);
  });

  test('shows the empty state when the feed is empty', async ({ page }) => {
    await page.route(/\/notifications\/stream$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: unread-count\ndata: 0\n\n',
      }),
    );
    await page.route(/\/notifications(\?.*)?$/, (route) =>
      route.fulfill({ json: { items: [], total: 0, unreadCount: 0, page: 1, limit: 25 } }),
    );

    await page.goto('/dashboard');

    const bell = page.getByRole('button', { name: 'Notificaciones' });
    await bell.click();
    await expect(page.getByText('Sin notificaciones por ahora.')).toBeVisible();
  });
});

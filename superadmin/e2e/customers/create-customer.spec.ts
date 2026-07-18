import { expect, test } from '@playwright/test';
import { mockCustomersApi, selectOption, signIn } from '../support/superadmin';

test.describe('Create client — /customers/new', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('creates a client from the minimal required fields', async ({ page }) => {
    const api = await mockCustomersApi(page);

    await page.goto('/customers/new');
    await expect(page.getByRole('heading', { name: 'Nuevo cliente' })).toBeVisible();

    // Required: the commercial name + the primary contact (seeded first row).
    // Status/source default to valid values.
    await page.locator('#cust-name').fill('Refrigeración del Norte SA de CV');
    await page.locator('#contact-name-0').fill('Laura Méndez');

    const submit = page.getByRole('button', { name: 'Crear cliente' });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Success surfaces as a toast, then a redirect back to the directory.
    await expect(page.getByText('Cliente creado')).toBeVisible();
    await expect(page).toHaveURL(/\/customers$/);

    expect(api.lastCreate()).toMatchObject({
      name: 'Refrigeración del Norte SA de CV',
      status: 'active',
      source: 'other',
      contacts: [{ name: 'Laura Méndez', isDefault: true }],
    });
  });

  test('keeps submit disabled until name and a primary contact are entered', async ({ page }) => {
    await mockCustomersApi(page);
    await page.goto('/customers/new');

    const name = page.locator('#cust-name');
    const contact = page.locator('#contact-name-0');
    const submit = page.getByRole('button', { name: 'Crear cliente' });

    await expect(submit).toBeDisabled();
    // A contact without the commercial name is still not enough.
    await contact.fill('Laura Méndez');
    await expect(submit).toBeDisabled();
    await name.fill('Acme');
    await expect(submit).toBeEnabled();
    await name.clear();
    await expect(submit).toBeDisabled();
  });

  test('sends the full form payload — contacts, tags, CRM selects and comments', async ({
    page,
  }) => {
    const api = await mockCustomersApi(page);
    await page.goto('/customers/new');

    // General
    await page.locator('#cust-name').fill('Climas Monterrey');
    await page.locator('#cust-address').fill('Av. Constitución 100, Monterrey');
    await page.locator('#cust-observation').fill('Cliente mayorista, factura mensual.');

    // Tags — Enter commits each chip
    const tags = page.locator('#cust-tags');
    await tags.fill('mayoreo');
    await tags.press('Enter');
    await tags.fill('vip');
    await tags.press('Enter');

    // CRM selects (PrimeNG overlays render options to the body)
    await selectOption(page, 'cust-status', 'Lead');
    await selectOption(page, 'cust-source', 'Sitio web');

    // Primary contact (the seeded first row — default).
    await page.locator('#contact-name-0').fill('Ana Torres');
    await page.locator('#contact-phone-0').fill('8110002000');
    await page.locator('#contact-email-0').fill('ana@climasmty.mx');

    // A second contact (not the default).
    await page.getByRole('button', { name: 'Agregar contacto' }).click();
    await page.locator('#contact-name-1').fill('Cuentas por pagar');

    await page.getByRole('button', { name: 'Crear cliente' }).click();
    await expect(page.getByText('Cliente creado')).toBeVisible();

    expect(api.lastCreate()).toMatchObject({
      name: 'Climas Monterrey',
      address: 'Av. Constitución 100, Monterrey',
      observation: 'Cliente mayorista, factura mensual.',
      tags: ['mayoreo', 'vip'],
      status: 'lead',
      source: 'website',
      contacts: [
        { name: 'Ana Torres', phone: '8110002000', email: 'ana@climasmty.mx', isDefault: true },
        { name: 'Cuentas por pagar', isDefault: false },
      ],
    });
  });
});

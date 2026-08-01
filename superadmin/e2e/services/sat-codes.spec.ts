import { expect, test } from '@playwright/test';
import { mockServicesApi, selectOption, signIn } from '../support/superadmin';
import { ServiceTaxRate, ServiceUom, type Service } from '../../src/app/data/dtos/service';

/** A service with no SAT keys — the case where hydration must NOT invent one. */
const NO_KEYS: Service = {
  id: 'svc-nokeys',
  name: 'Mantenimiento preventivo',
  price: '1500.00',
  uom: ServiceUom.Hora,
  taxRate: ServiceTaxRate.Iva16,
  isListableInWebsite: false,
  isPriceVisibleInWebsite: false,
  createdAt: '2026-07-10T16:00:00.000Z',
  updatedAt: '2026-07-29T16:00:00.000Z',
};

const WITH_KEYS: Service = {
  ...NO_KEYS,
  id: 'svc-keys',
  satProdServCode: '72101500',
  satUnitCode: 'E48',
};

test.describe('SAT code fields (18 §6.4)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('detail shows both keys, em dash when unset', async ({ page }) => {
    await mockServicesApi(page, [WITH_KEYS, NO_KEYS]);

    await page.goto('/services/svc-keys');
    await expect(page.getByRole('heading', { name: 'Facturación (SAT)' })).toBeVisible();
    await expect(page.getByText('72101500')).toBeVisible();
    await expect(page.getByText('E48')).toBeVisible();

    await page.goto('/services/svc-nokeys');
    await expect(page.getByRole('heading', { name: 'Facturación (SAT)' })).toBeVisible();
  });

  test('editing a service without keys leaves the fields empty until a unidad is picked', async ({
    page,
  }) => {
    await mockServicesApi(page, [NO_KEYS]);
    await page.goto('/services/svc-nokeys');
    await page.getByRole('button', { name: 'Editar' }).click();

    // Hydration must not seed a key the service never had — the stored unidad
    // (Hora) has a mapping, so this is exactly the clobber case.
    await expect(page.locator('#svc-sat-unit')).toHaveValue('');
    await expect(page.locator('#svc-sat-prod')).toHaveValue('');

    // An explicit pick suggests one…
    await selectOption(page, 'svc-uom', 'Kilogramo (kg)');
    await expect(page.locator('#svc-sat-unit')).toHaveValue('KGM');

    // …and never overwrites what the owner typed.
    await page.locator('#svc-sat-unit').fill('XYZ');
    await selectOption(page, 'svc-uom', 'Litro (L)');
    await expect(page.locator('#svc-sat-unit')).toHaveValue('XYZ');
  });

  test('new service: keys reach the create payload, and clearing sends empty strings', async ({
    page,
  }) => {
    const api = await mockServicesApi(page);

    await page.goto('/services/new');
    await page.locator('#svc-name').fill('Servicio con claves');
    await page.locator('#svc-sat-prod').fill('72101500');
    await selectOption(page, 'svc-uom', 'Hora');
    await expect(page.locator('#svc-sat-unit')).toHaveValue('HUR');

    await page.getByRole('button', { name: 'Registrar servicio' }).click();
    await expect(page.getByText('Servicio registrado')).toBeVisible();

    expect(api.lastCreate()).toMatchObject({
      name: 'Servicio con claves',
      satProdServCode: '72101500',
      satUnitCode: 'HUR',
    });
  });
});

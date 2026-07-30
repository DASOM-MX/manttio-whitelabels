import { expect, test } from '@playwright/test';
import { mockServicesApi, signIn } from '../support/superadmin';
import { ServiceTaxRate, ServiceUom, type Service } from '../../src/app/data/dtos/service';

const SOURCE: Service = {
  id: 'svc-src',
  name: 'Mantenimiento preventivo de chiller',
  price: '1750.00',
  cost: '950.00',
  uom: ServiceUom.Servicio,
  description: 'Incluye lavado de serpentines y revisión de presiones.',
  websiteDescription: 'Mantenimiento completo con reporte fotográfico.',
  websiteImageKey: 'website/foto.jpg',
  websiteImageUrl: 'https://images.example/website/foto.jpg',
  internalServiceCode: 'MP-001',
  taxRate: ServiceTaxRate.Iva16,
  isListableInWebsite: true,
  isPriceVisibleInWebsite: true,
  createdAt: '2026-07-10T16:00:00.000Z',
  updatedAt: '2026-07-29T16:00:00.000Z',
};

test.describe('Duplicate a service — /services/new?from= (18 §6.2)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('list row Duplicar → prefilled create → tweak → save carries clone provenance', async ({
    page,
  }) => {
    const api = await mockServicesApi(page, [SOURCE]);

    await page.goto('/services');
    await page.getByRole('link', { name: `Duplicar servicio ${SOURCE.name}` }).click();
    await expect(page).toHaveURL(/\/services\/new\?from=svc-src$/);
    await expect(page.getByRole('heading', { name: 'Duplicar servicio' })).toBeVisible();

    // Verbatim copy — except the catalog code, which is unique across the
    // live catalog and must arrive empty.
    await expect(page.locator('#svc-name')).toHaveValue(SOURCE.name);
    await expect(page.locator('#svc-description')).toHaveValue(SOURCE.description!);
    await expect(page.locator('#svc-code')).toHaveValue('');

    // The plan's manual pass, scripted: clone → tweak → save.
    await page.locator('#svc-name').fill('Mantenimiento preventivo de chiller 10 TR');
    await page.getByRole('button', { name: 'Registrar servicio' }).click();

    await expect(page.getByText('Servicio registrado')).toBeVisible();
    await expect(page).toHaveURL(/\/services$/);

    // The POST is a normal create plus the provenance hint — the id's
    // presence is what makes the backend's created event say via: 'clone'.
    expect(api.lastCreate()).toMatchObject({
      name: 'Mantenimiento preventivo de chiller 10 TR',
      price: 1750,
      cost: 950,
      uom: ServiceUom.Servicio,
      taxRate: ServiceTaxRate.Iva16,
      // Same R2 object as the source — copying never re-uploads.
      websiteImageKey: 'website/foto.jpg',
      sourceServiceId: 'svc-src',
    });
    // Cleared, not copied: '' is trimmed off the payload entirely.
    expect(api.lastCreate()!.internalServiceCode).toBeUndefined();

    // Both rows independent: the source is untouched, the copy is a new row.
    // `.first()`: the row-action aria-labels repeat the service name, so the
    // actions cell matches the same name filter as the name cell.
    const clone = api.created()[0]!;
    expect(clone.id).not.toBe(SOURCE.id);
    await expect(
      page.getByRole('cell', { name: 'Mantenimiento preventivo de chiller 10 TR' }).first(),
    ).toBeVisible();
  });

  test('the detail view offers Duplicar and lands on the same prefilled create', async ({
    page,
  }) => {
    await mockServicesApi(page, [SOURCE]);

    await page.goto('/services/svc-src');
    await page.getByRole('link', { name: 'Duplicar' }).click();

    await expect(page).toHaveURL(/\/services\/new\?from=svc-src$/);
    await expect(page.getByRole('heading', { name: 'Duplicar servicio' })).toBeVisible();
    await expect(page.locator('#svc-name')).toHaveValue(SOURCE.name);
    await expect(page.locator('#svc-code')).toHaveValue('');
  });
});

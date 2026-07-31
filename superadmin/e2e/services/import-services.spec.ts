import { expect, test } from '@playwright/test';
import { mockServicesApi, signIn } from '../support/superadmin';

/** Tenant-style price list: none of the headers are canonical — the alias
 *  auto-match has to resolve every one ("P.V." → price, "Clave" → código…),
 *  and the cells carry labels ("Servicio", "IVA 16% (general)") and formatted
 *  money, not wire values. */
const TENANT_CSV = [
  'Concepto,P.V.,Costo,Unidad,IVA,Clave',
  'Mantenimiento preventivo,"$1,500.00",800,Servicio,IVA 16% (general),MP-001',
  'Recarga de gas,950.5,,Hora,Exento,',
].join('\r\n');

/** No unidad/IVA columns (the fixed-value defaults must cover them), one bad
 *  price and a código repeated in-file. */
const BROKEN_CSV = [
  'Concepto,Precio,Clave',
  'Servicio A,100,X-1',
  'Servicio B,abc,X-1',
].join('\r\n');

const uploadCsv = async (
  page: import('@playwright/test').Page,
  content: string,
): Promise<void> => {
  await page.locator('input[type=file]').setInputFiles({
    name: 'lista-de-precios.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(content, 'utf8'),
  });
};

test.describe('CSV import — /services/import (18 §6.3)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('tenant headers auto-match; labels and formatted money resolve to canonical rows', async ({
    page,
  }) => {
    await mockServicesApi(page);
    let importBody: { rows: unknown[] } | null = null;
    await page.route(/\/services\/import$/, (route) => {
      // /services/import is also the SPA URL — only the API POST is ours.
      if (route.request().method() !== 'POST') return route.fallback();
      importBody = route.request().postDataJSON() as { rows: unknown[] };
      return route.fulfill({ status: 201, json: { imported: importBody.rows.length } });
    });

    await page.goto('/services/import');
    await uploadCsv(page, TENANT_CSV);

    // The preview proves the mapping: values resolved from aliased columns.
    await expect(page.getByRole('cell', { name: 'Mantenimiento preventivo' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '$1,500.00' })).toBeVisible();
    await expect(page.getByText('todas listas para importar')).toBeVisible();

    await page.getByRole('button', { name: 'Importar 2 servicios' }).click();
    await expect(page.getByText('Catálogo importado')).toBeVisible();
    await expect(page).toHaveURL(/\/services$/);

    // Canonical rows on the wire — wire-enum codes and plain numbers, exactly
    // what a form create would send.
    expect(importBody!.rows).toEqual([
      {
        name: 'Mantenimiento preventivo',
        price: 1500,
        cost: 800,
        uom: 'servicio',
        taxRate: 'iva_16',
        internalServiceCode: 'MP-001',
        isListableInWebsite: false,
        isPriceVisibleInWebsite: false,
      },
      {
        name: 'Recarga de gas',
        price: 950.5,
        uom: 'hora',
        taxRate: 'exento',
        isListableInWebsite: false,
        isPriceVisibleInWebsite: false,
      },
    ]);
  });

  test('per-row errors block the import; missing enum columns fall back to fixed defaults', async ({
    page,
  }) => {
    await mockServicesApi(page);
    await page.goto('/services/import');
    await uploadCsv(page, BROKEN_CSV);

    // Line 3 carries both problems; nothing imports while any row fails.
    await expect(page.getByText('1 con errores')).toBeVisible();
    await expect(page.getByText('Precio inválido: "abc"')).toBeVisible();
    await expect(page.getByText('El código "X-1" se repite en el archivo')).toBeVisible();
    await expect(page.getByRole('button', { name: /Importar 2 servicios/ })).toBeDisabled();

    // The valid row still previews fully — uom/IVA came from the fixed
    // defaults, not from any column.
    await expect(page.getByRole('cell', { name: 'Servicio A' })).toBeVisible();
  });
});

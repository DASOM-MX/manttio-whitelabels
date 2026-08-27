import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { ServiceTaxRate, ServiceUom } from '../../src/app/data/dtos/service';
import { mockServicesApi, signIn } from '../support/superadmin';
import type { Service } from '../../src/app/data/dtos/service';

/** Tenant-style price list: none of the headers are canonical — the alias
 *  auto-match has to resolve every one ("P.V." → price, "Clave" → código…),
 *  and the cells carry labels ("Servicio", "IVA 16% (general)"), bare unit
 *  symbols ("TR" — how a price list actually spells a thermal unit) and
 *  formatted money, not wire values. */
const TENANT_CSV = [
  'Concepto,P.V.,Costo,Unidad,IVA,Clave',
  'Mantenimiento preventivo,"$1,500.00",800,Servicio,IVA 16% (general),MP-001',
  'Recarga de gas,950.5,,Hora,Exento,',
  'Renta de chiller por carga térmica,"$2,000.00",,TR,IVA 16% (general),',
].join('\r\n');

/** No unidad/IVA columns (the fixed-value defaults must cover them), one bad
 *  price and a código repeated in-file. */
const BROKEN_CSV = [
  'Concepto,Precio,Clave',
  'Servicio A,100,X-1',
  'Servicio B,abc,X-1',
].join('\r\n');

const uploadCsv = async (page: Page, content: string): Promise<void> => {
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

    await page.getByRole('button', { name: 'Importar 3 servicios' }).click();
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
        isReportSource: false,
        isListableInWebsite: false,
        isPriceVisibleInWebsite: false,
      },
      {
        name: 'Recarga de gas',
        price: 950.5,
        uom: 'hora',
        taxRate: 'exento',
        isReportSource: false,
        isListableInWebsite: false,
        isPriceVisibleInWebsite: false,
      },
      {
        name: 'Renta de chiller por carga térmica',
        price: 2000,
        uom: 'tonelada_refrigeracion',
        taxRate: 'iva_16',
        isReportSource: false,
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

  test('an exported catalog re-imports with every column auto-matched', async ({ page }) => {
    // Full-fat + minimal rows: accents and a comma in the name exercise the
    // CSV quoting, wire-enum cells and fixed-2 money exercise the canonical
    // round trip the export promises.
    const now = new Date().toISOString();
    const seed: Service[] = [
      {
        id: 'svc-1',
        name: 'Instalación de chiller, arranque y pruebas',
        price: '18500.00',
        cost: '9250.50',
        uom: ServiceUom.Servicio,
        taxRate: ServiceTaxRate.Iva16,
        isReportSource: true,
        internalServiceCode: 'INST-01',
        description: 'Incluye pruebas de presión',
        websiteDescription: 'Instalación profesional',
        satProdServCode: '80101500',
        satUnitCode: 'E48',
        isListableInWebsite: true,
        isPriceVisibleInWebsite: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'svc-2',
        name: 'Recarga de gas R-410A',
        price: '950.00',
        uom: ServiceUom.Hora,
        taxRate: ServiceTaxRate.Exento,
        isReportSource: false,
        isListableInWebsite: false,
        isPriceVisibleInWebsite: false,
        createdAt: now,
        updatedAt: now,
      },
    ];
    await mockServicesApi(page, seed);

    await page.goto('/services');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);
    const csv = await readFile(await download.path(), 'utf8');

    // Re-import into an *empty* catalog (a fresh mock shadows the seeded
    // routes — later registrations win), or the exported códigos would trip
    // the dup-vs-catalog check against their own source rows.
    await mockServicesApi(page);
    let importBody: { rows: unknown[] } | null = null;
    await page.route(/\/services\/import$/, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      importBody = route.request().postDataJSON() as { rows: unknown[] };
      return route.fulfill({ status: 201, json: { imported: importBody.rows.length } });
    });

    await page.goto('/services/import');
    await uploadCsv(page, csv);

    // Every column auto-matched: no missing-required callout, zero errors.
    await expect(page.getByText('todas listas para importar')).toBeVisible();
    await expect(page.getByText('Falta asignar columna')).not.toBeVisible();

    await page.getByRole('button', { name: 'Importar 2 servicios' }).click();
    await expect(page.getByText('Catálogo importado')).toBeVisible();

    // The wire rows are exactly what a form create would send — the export's
    // fixed-2 strings and booleans came back as numbers and flags, untouched.
    expect(importBody!.rows).toEqual([
      {
        name: 'Instalación de chiller, arranque y pruebas',
        price: 18500,
        cost: 9250.5,
        uom: 'servicio',
        taxRate: 'iva_16',
        internalServiceCode: 'INST-01',
        description: 'Incluye pruebas de presión',
        websiteDescription: 'Instalación profesional',
        satProdServCode: '80101500',
        satUnitCode: 'E48',
        isReportSource: true,
        isListableInWebsite: true,
        isPriceVisibleInWebsite: true,
      },
      {
        name: 'Recarga de gas R-410A',
        price: 950,
        uom: 'hora',
        taxRate: 'exento',
        isReportSource: false,
        isListableInWebsite: false,
        isPriceVisibleInWebsite: false,
      },
    ]);
  });
});

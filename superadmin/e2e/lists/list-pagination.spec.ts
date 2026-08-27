import { test } from '@playwright/test';
import { signIn } from '../support/superadmin';
import { expectServerSidePaging, stubIdleApi } from '../support/paged-list';
import { CustomerSource, CustomerStatus } from '../../src/app/data/dtos/customer';
import type { LegacyCustomerRow } from '../../src/app/data/dtos/customer-legacy';
import type { User } from '../../src/app/data/dtos/user';
import { TemplateStatus, type ReportTemplate } from '../../src/app/data/dtos/report-template';
import type { ReportSummary } from '../../src/app/data/dtos/report';
import { ReportStatus } from '../../src/app/model/enums/report/report-status.enum';
import type { Equipment } from '../../src/app/data/dtos/equipment';
import { ServiceTaxRate, ServiceUom, type Service } from '../../src/app/data/dtos/service';
import type { QuotationSummary } from '../../src/app/data/dtos/quotation/quotation';
import { QuotationStatus } from '../../src/app/model/enums/quotation/quotation-status.enum';
import type { ServiceOrder } from '../../src/app/data/dtos/service-order';
import { ServiceOrderPriority } from '../../src/app/model/enums/service-order/service-order-priority.enum';
import { ServiceOrderStatus } from '../../src/app/model/enums/service-order/service-order-status.enum';
import type { Contract } from '../../src/app/data/dtos/contract/contract';
import { ContractFileType } from '../../src/app/model/enums/contract/contract-file-type.enum';
import { ContractType } from '../../src/app/model/enums/contract/contract-type.enum';
import { ContractValidity } from '../../src/app/model/enums/contract/contract-validity.enum';

/**
 * The 21 CP-6 regression guard: one test per lazy list page, all running the
 * same scenario — turn to page 2 and prove the rows on screen came from the
 * server's page 2.
 *
 * This is the bug plan 21 was opened for (21 §1): `GET /customers` ignored
 * `page`, and because PrimeNG in lazy mode renders whatever it is handed, the
 * clients list turned pages that never changed a row. Nothing about that
 * failure is visible from the client's side alone — hence a guard that watches
 * the request *and* the rendered rows.
 *
 * Adding a lazy list page? Add its case here. Two lines of seed data is the
 * whole cost, and an unguarded list is exactly how this shipped broken.
 */

/** Three pages of 10 — enough that page 2 is neither the first nor the last. */
const ROW_COUNT = 25;
const rows = <T,>(build: (n: number, label: string) => T): T[] =>
  Array.from({ length: ROW_COUNT }, (_, i) => build(i + 1, String(i + 1).padStart(3, '0')));

const NOW = '2026-08-01T12:00:00.000Z';

test.describe('List pagination — page 2 renders page-2 rows (21 CP-6)', () => {
  test.beforeEach(async ({ page }) => {
    // Order matters: the idle catch-all must be registered before signIn so
    // signIn's stubs (and each test's list stub) win over it.
    await stubIdleApi(page);
    await signIn(page);
  });

  test('clients — /customers', async ({ page }) => {
    await expectServerSidePaging<LegacyCustomerRow>(page, {
      route: '/customers',
      endpoint: '/customers',
      firstCell: (row) => row.name,
      rows: rows((n, label) => ({
        id: `cust-${n}`,
        name: `Cliente ${label}`,
        contactName: `Contacto ${label}`,
        status: CustomerStatus.Active,
        source: CustomerSource.Other,
        tags: [],
        contacts: [],
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
  });

  test('users — /users', async ({ page }) => {
    await expectServerSidePaging<User>(page, {
      route: '/users',
      endpoint: '/users',
      firstCell: (row) => row.name,
      rows: rows((n, label) => ({
        id: `user-${n}`,
        name: `Usuario ${label}`,
        paternalLastName: 'Pérez',
        maternalLastName: 'Ruiz',
        email: `usuario${label}@e2e.test`,
        role: 'technician',
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
  });

  test('report templates — /templates', async ({ page }) => {
    await expectServerSidePaging<ReportTemplate>(page, {
      route: '/templates',
      endpoint: '/report-templates',
      firstCell: (row) => row.name,
      rows: rows((n, label) => ({
        id: `tpl-${n}`,
        name: `Plantilla ${label}`,
        status: TemplateStatus.Active,
        sections: [],
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
  });

  test('reports — /reports', async ({ page }) => {
    await expectServerSidePaging<ReportSummary>(page, {
      route: '/reports',
      endpoint: '/reports',
      firstCell: (row) => row.folio!,
      rows: rows((n, label) => ({
        id: `rep-${n}`,
        folio: `RPT-${label}`,
        customerId: `cust-${n}`,
        customerName: `Cliente ${label}`,
        technicianId: `user-${n}`,
        technicianName: `Técnico ${label}`,
        templateId: 'tpl-1',
        templateName: 'Mantenimiento',
        serviceDate: '2026-07-15',
        status: ReportStatus.Finished,
        createdAt: NOW,
      })),
    });
  });

  test('equipment — /equipment', async ({ page }) => {
    await expectServerSidePaging<Equipment>(page, {
      route: '/equipment',
      endpoint: '/equipment',
      firstCell: (row) => row.name!,
      rows: rows((n, label) => ({
        id: `eq-${n}`,
        customerId: `cust-${n}`,
        customerName: `Cliente ${label}`,
        name: `Equipo ${label}`,
        kind: 'Chiller',
        serialNumber: `SN-${label}`,
        origin: 'externo',
        status: 'active',
        createdAt: NOW,
      })),
    });
  });

  test('service catalog — /services', async ({ page }) => {
    await expectServerSidePaging<Service>(page, {
      route: '/services',
      endpoint: '/services',
      firstCell: (row) => row.name,
      rows: rows((n, label) => ({
        id: `svc-${n}`,
        name: `Servicio ${label}`,
        price: '1500.00',
        cost: '900.00',
        uom: ServiceUom.Servicio,
        taxRate: ServiceTaxRate.Iva16,
        internalServiceCode: `SVC-${label}`,
        isReportSource: true,
        isListableInWebsite: false,
        isPriceVisibleInWebsite: false,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
  });

  test('quotations — /quotations', async ({ page }) => {
    await expectServerSidePaging<QuotationSummary>(page, {
      route: '/quotations',
      endpoint: '/quotations',
      firstCell: (row) => row.folio,
      rows: rows((n, label) => ({
        id: `quo-${n}`,
        folio: `COT-${label}`,
        customerId: `cust-${n}`,
        customerName: `Cliente ${label}`,
        status: QuotationStatus.Draft,
        validUntil: '2026-09-30',
        isOverdue: false,
        total: '5800.00',
        tally: { reviewers: 2, approved: 0, declined: 0, pending: 2 },
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
  });

  test('service orders — /service-orders', async ({ page }) => {
    await expectServerSidePaging<ServiceOrder>(page, {
      route: '/service-orders',
      endpoint: '/service-orders',
      firstCell: (row) => row.folio,
      rows: rows((n, label) => ({
        id: `ord-${n}`,
        folio: `OS-${label}`,
        customerId: `cust-${n}`,
        customerName: `Cliente ${label}`,
        priority: ServiceOrderPriority.Normal,
        status: ServiceOrderStatus.Open,
        servicesCount: 2,
        reportsTotal: 2,
        reportsFinished: 1,
        createdBy: 'u-e2e',
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
  });

  test('contracts — /contracts', async ({ page }) => {
    await expectServerSidePaging<Contract>(page, {
      route: '/contracts',
      endpoint: '/contracts',
      firstCell: (row) => row.folio,
      rows: rows((n, label) => ({
        id: `ctr-${n}`,
        folio: `CTR-${label}`,
        customerId: `cust-${n}`,
        customerName: `Cliente ${label}`,
        name: `Contrato ${label}`,
        type: ContractType.ProgrammedMaintenance,
        fileName: `contrato-${label}.pdf`,
        fileType: ContractFileType.Pdf,
        fileMime: 'application/pdf',
        visibleToRoles: [],
        equipment: [],
        validFromDate: '2026-01-01',
        expiryDate: '2026-12-31',
        validity: ContractValidity.Active,
        tags: [],
        createdBy: 'u-e2e',
        createdAt: NOW,
      })),
    });
  });
});

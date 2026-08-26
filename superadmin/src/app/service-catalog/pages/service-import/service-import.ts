import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { LucideRefreshCw, LucideUpload } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { AuthState } from '../../../../state/auth/auth.state';
import { ServicesState } from '../../../../state/services/services.state';
import { ImportServices, LoadServiceOptions } from '../../../../state/services/services.actions';
import { hasRole } from '../../../guards/has-role.guard';
import { SERVICE_IMPORT_FIELDS } from '../../../model/constants/services/service-import-fields.const';
import { SERVICE_IMPORT_MAX_ROWS } from '../../../model/constants/services/service-import-max-rows.const';
import { SERVICE_TAX_RATE_LABELS } from '../../../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_UOM_LABELS } from '../../../model/constants/services/service-uom-labels.const';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { errorMessage } from '../../../data/utils';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { parseCsv, type ParsedCsv } from '../../utils/csv.utils';
import {
  autoMatchMapping,
  resolveServiceImport,
  unmappedRequiredFields,
} from '../../utils/service-import.utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type {
  ServiceFieldMapping,
  ServiceImportErrorRow,
  ServiceImportField,
  ServiceImportMapping,
} from '../../../data/types/services/service-import';

interface MapperSelectItem {
  label: string;
  value: string;
}
interface MapperSelectGroup {
  label: string;
  items: MapperSelectItem[];
}
interface MapperViewRow {
  field: ServiceImportField;
  label: string;
  requiresColumn: boolean;
  groups: MapperSelectGroup[];
  value: string | null;
}

/** CSV import (18 §6.3): upload → parse → field mapper → preview → confirm.
 *  Everything up to the confirm is client-side — the mapper resolves tenant
 *  headers to canonical rows, so `POST /services/import` receives the same
 *  shape a form create sends. The preview's validation is a convenience: the
 *  backend re-validates every row and the import is all-or-nothing there. */
@Component({
  selector: 'app-service-import',
  imports: [
    RouterLink,
    FormsModule,
    SelectModule,
    TableModule,
    MoneyPipe,
    ServiceTaxRateShortPipe,
    ServiceUomShortPipe,
    PageHeader,
    LucideRefreshCw,
    LucideUpload,
  ],
  templateUrl: './service-import.html',
})
export class ServiceImport implements HasPendingChanges {
  private store = inject(Store);
  private router = inject(Router);
  private messages = inject(MessageService);

  private me = select(AuthState.me);
  private services = select(ServicesState.options);

  protected canManage = computed(() => hasRole(this.me(), ['owner', 'admin']));

  protected fileName = signal('');
  protected parsed = signal<ParsedCsv | null>(null);
  protected mapping = signal<ServiceImportMapping | null>(null);
  protected busy = signal(false);
  /** 422 rows from the backend, displayed verbatim under the preview. */
  protected serverErrors = signal<ServiceImportErrorRow[]>([]);
  private done = false;

  /** Live catalog códigos, for the dup-vs-catalog preview check. */
  private existingCodes = computed(
    () =>
      new Set(
        this.services()
          .map((s) => s.internalServiceCode)
          .filter((c): c is string => !!c),
      ),
  );

  protected missingRequired = computed(() => {
    const mapping = this.mapping();
    if (!mapping) return [];
    const missing = unmappedRequiredFields(mapping);
    return SERVICE_IMPORT_FIELDS.filter((s) => missing.includes(s.field)).map((s) => s.label);
  });
  protected missingRequiredText = computed(() => this.missingRequired().join(', '));

  protected preview = computed(() => {
    const parsed = this.parsed();
    const mapping = this.mapping();
    if (!parsed || !mapping || this.missingRequired().length > 0) return null;
    return resolveServiceImport(parsed, mapping, this.existingCodes());
  });

  /** Preview rows with the error list pre-joined — templates don't call
   *  functions. */
  protected previewRows = computed(
    () =>
      this.preview()?.rows.map((row) => ({ ...row, errorText: row.errors.join(' · ') })) ?? [],
  );

  protected errorCount = computed(() => this.preview()?.errorCount ?? 0);
  protected rowCount = computed(() => this.preview()?.rows.length ?? 0);

  /** Client mirror of the backend's 500-row ceiling — blocks with a callout
   *  instead of letting the server answer a raw envelope 400. */
  protected readonly maxRows = SERVICE_IMPORT_MAX_ROWS;
  protected tooManyRows = computed(() => this.rowCount() > this.maxRows);

  protected canImport = computed(
    () =>
      this.rowCount() > 0 &&
      this.errorCount() === 0 &&
      this.missingRequired().length === 0 &&
      !this.tooManyRows() &&
      !this.busy(),
  );

  protected serverErrorRows = computed(() => {
    // The submitted array is the preview in order, so the 422's 0-based index
    // maps to that preview row's own file line (blank rows don't shift it).
    const rows = this.preview()?.rows ?? [];
    return this.serverErrors().map((err) => ({
      line: err.index >= 0 ? (rows[err.index]?.line ?? null) : null,
      message: err.message,
    }));
  });

  private static readonly UOM_FIXED_ITEMS: MapperSelectItem[] = Object.entries(
    SERVICE_UOM_LABELS,
  ).map(([code, label]) => ({ label, value: `fixed:${code}` }));
  private static readonly TAX_FIXED_ITEMS: MapperSelectItem[] = Object.entries(
    SERVICE_TAX_RATE_LABELS,
  ).map(([code, label]) => ({ label, value: `fixed:${code}` }));

  /** One select per catalog field: the file's columns (with a sample value so
   *  the owner sees what they're pointing at), a fixed-value group for
   *  enum/boolean fields, and Omitir for the optionals. */
  protected mapperRows = computed<MapperViewRow[]>(() => {
    const parsed = this.parsed();
    const mapping = this.mapping();
    if (!parsed || !mapping) return [];

    const columnItems: MapperSelectItem[] = parsed.headers.map((header) => {
      const sample = this.sampleFor(header, parsed);
      return { label: sample ? `${header} — ej. ${sample}` : header, value: `col:${header}` };
    });

    return SERVICE_IMPORT_FIELDS.map((spec) => {
      const groups: MapperSelectGroup[] = [{ label: 'Columnas del archivo', items: columnItems }];
      if (spec.kind === 'uom') {
        groups.push({ label: 'Mismo valor para todas las filas', items: ServiceImport.UOM_FIXED_ITEMS });
      }
      if (spec.kind === 'taxRate') {
        groups.push({ label: 'Mismo valor para todas las filas', items: ServiceImport.TAX_FIXED_ITEMS });
      }
      if (spec.kind === 'boolean') {
        groups.push({
          label: 'Mismo valor para todas las filas',
          items: [
            { label: 'Sí', value: 'fixed:true' },
            { label: 'No', value: 'fixed:false' },
          ],
        });
      }
      if (!spec.requiresColumn) {
        groups.push({ label: 'Sin datos', items: [{ label: 'Omitir', value: 'omit' }] });
      }

      const current = mapping[spec.field];
      const value =
        current.kind === 'column'
          ? current.header
            ? `col:${current.header}`
            : null
          : current.kind === 'fixed'
            ? `fixed:${current.value}`
            : 'omit';

      return {
        field: spec.field,
        label: spec.label,
        requiresColumn: spec.requiresColumn ?? false,
        groups,
        value,
      };
    });
  });

  constructor() {
    // The whole catalog is already list-sized — loading it here powers the
    // dup-vs-catalog preview check.
    this.store.dispatch(new LoadServiceOptions());
  }

  hasPendingChanges(): boolean {
    return this.parsed() !== null && !this.done && !this.busy();
  }

  private sampleFor(header: string, parsed: ParsedCsv): string {
    const index = parsed.headers.indexOf(header);
    const cell =
      parsed.rows.map((row) => row.cells[index]?.trim() ?? '').find((value) => value !== '') ?? '';
    return cell.length > 24 ? `${cell.slice(0, 24)}…` : cell;
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      this.messages.add({
        severity: 'error',
        summary: 'Archivo vacío',
        detail: 'El archivo no tiene encabezados o filas de datos.',
      });
      return;
    }
    this.serverErrors.set([]);
    this.fileName.set(file.name);
    this.parsed.set(parsed);
    this.mapping.set(autoMatchMapping(parsed.headers));
  }

  protected resetFile(): void {
    this.fileName.set('');
    this.parsed.set(null);
    this.mapping.set(null);
    this.serverErrors.set([]);
  }

  protected onMappingChange(field: ServiceImportField, encoded: string | null): void {
    const mapping = this.mapping();
    if (!mapping || encoded === null) return;
    let next: ServiceFieldMapping;
    if (encoded === 'omit') next = { kind: 'omit' };
    else if (encoded.startsWith('fixed:')) next = { kind: 'fixed', value: encoded.slice(6) };
    else next = { kind: 'column', header: encoded.slice(4) };
    // A 422's row messages describe the mapping they were computed under —
    // stale the moment it changes.
    this.serverErrors.set([]);
    this.mapping.set({ ...mapping, [field]: next });
  }

  protected submit(): void {
    const preview = this.preview();
    if (!preview || !this.canImport()) return;
    const rows = preview.rows.map((r) => r.row!);

    this.busy.set(true);
    this.serverErrors.set([]);
    this.store.dispatch(new ImportServices(rows)).subscribe({
      next: () => {
        this.busy.set(false);
        this.done = true;
        this.messages.add({
          severity: 'success',
          summary: 'Catálogo importado',
          detail: `${rows.length} servicio(s) registrados.`,
        });
        this.router.navigate(['/services']);
      },
      error: (err) => {
        this.busy.set(false);
        const body = (err as { error?: { rows?: ServiceImportErrorRow[] } })?.error;
        this.serverErrors.set(body?.rows ?? []);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo importar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}

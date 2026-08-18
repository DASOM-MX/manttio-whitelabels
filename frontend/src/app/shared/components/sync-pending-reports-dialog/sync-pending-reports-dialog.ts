import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Actions, Store, ofActionErrored, ofActionSuccessful, select } from '@ngxs/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { OfflineReportsState } from '../../../../state/offline-reports/offline-reports.state';
import {
  DiscardPendingReport,
  SyncOfflineReports,
} from '../../../../state/offline-reports/offline-reports.actions';
import { SyncDialogBridge } from '../../../../offline/sync-dialog-bridge.service';
import { PendingReportStatus } from '../../../../offline/pending-report.model';

interface SyncRow {
  tempId: string;
  typeLabel: string;
  createdByName: string;
  createdAt: string;
  isUploading: boolean;
  isFailed: boolean;
  lastError?: string;
}

@Component({
  selector: 'app-sync-pending-reports-dialog',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: './sync-pending-reports-dialog.html',
  styleUrl: './sync-pending-reports-dialog.scss',
})
export class SyncPendingReportsDialog {
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);
  private confirmService = inject(ConfirmationService);
  private bridge = inject(SyncDialogBridge);

  private pending = select(OfflineReportsState.pending);
  uploading = select(OfflineReportsState.uploading);
  private pendingCount = select(OfflineReportsState.count);

  dialogOpen = signal(false);
  selected = signal<Set<string>>(new Set());
  /** True between dispatching SyncOfflineReports and the Actions stream settling.
   *  Lets the success/error subscribers ignore unrelated dispatches. */
  private submitting = signal(false);

  rows = computed<SyncRow[]>(() =>
    this.pending().map((p) => ({
      tempId: p.tempId,
      typeLabel: p.reportType,
      createdByName: p.createdBy.name,
      createdAt: p.createdAt,
      isUploading: p.status === PendingReportStatus.Uploading,
      isFailed: p.status === PendingReportStatus.Failed,
      lastError: p.lastError,
    })),
  );

  selectedCount = computed(() => this.selected().size);
  allSelected = computed(
    () => this.rows().length > 0 && this.selectedCount() === this.rows().length,
  );
  canConfirm = computed(() => this.selectedCount() > 0 && !this.uploading());

  constructor() {
    this.bridge.request$.pipe(takeUntilDestroyed()).subscribe(() => this.open());

    this.actions$
      .pipe(ofActionSuccessful(SyncOfflineReports), takeUntilDestroyed())
      .subscribe(() => {
        if (!this.submitting()) return;
        this.submitting.set(false);
        this.close();
        const remaining = this.pendingCount();
        if (remaining === 0) {
          this.messages.add({ severity: 'success', summary: 'Reportes sincronizados' });
        } else {
          this.messages.add({
            severity: 'warn',
            summary: `${remaining} reporte${remaining === 1 ? '' : 's'} sin subir`,
            detail: 'Puedes reintentar desde el detalle del reporte.',
          });
        }
      });

    this.actions$
      .pipe(ofActionErrored(SyncOfflineReports), takeUntilDestroyed())
      .subscribe(() => {
        if (!this.submitting()) return;
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudieron sincronizar los reportes',
        });
      });

    this.actions$
      .pipe(ofActionSuccessful(DiscardPendingReport), takeUntilDestroyed())
      .subscribe((action: DiscardPendingReport) => {
        if (!this.dialogOpen()) return;
        this.selected.update((set) => {
          if (!set.has(action.tempId)) return set;
          const next = new Set(set);
          next.delete(action.tempId);
          return next;
        });
        this.messages.add({ severity: 'info', summary: 'Reporte descartado' });
        if (this.pendingCount() === 0) this.close();
      });

    this.actions$
      .pipe(ofActionErrored(DiscardPendingReport), takeUntilDestroyed())
      .subscribe(() => {
        if (!this.dialogOpen()) return;
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo descartar el reporte',
        });
      });
  }

  /** Opens the dialog with every queued report ticked by default. No-op when the
   *  queue is empty so the reconnect prompt stays silent in that case. */
  open(): void {
    const ids = this.pending().map((p) => p.tempId);
    if (ids.length === 0) return;
    this.selected.set(new Set(ids));
    this.dialogOpen.set(true);
  }

  close(): void {
    this.dialogOpen.set(false);
    this.selected.set(new Set());
  }

  cancel(): void {
    if (this.uploading()) return;
    this.close();
  }

  toggle(tempId: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selected.set(new Set());
    } else {
      this.selected.set(new Set(this.rows().map((r) => r.tempId)));
    }
  }

  confirm(): void {
    if (!this.canConfirm()) return;
    this.submitting.set(true);
    this.store.dispatch(new SyncOfflineReports(Array.from(this.selected())));
  }

  askDiscard(event: Event, row: SyncRow): void {
    event.stopPropagation();
    if (this.uploading()) return;
    this.confirmService.confirm({
      header: 'Descartar reporte',
      message: 'Se eliminará este reporte sin subirlo. Esta acción no se puede deshacer.',
      icon: 'pi pi-trash',
      acceptLabel: 'Descartar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.store.dispatch(new DiscardPendingReport(row.tempId)),
    });
  }

  isSelected(tempId: string): boolean {
    return this.selected().has(tempId);
  }
}

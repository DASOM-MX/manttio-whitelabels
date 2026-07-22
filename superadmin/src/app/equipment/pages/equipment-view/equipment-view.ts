import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { CarouselModule } from 'primeng/carousel';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LucideLink, LucidePencil, LucideUnlink } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { EquipmentState } from '../../../../state/equipment/equipment.state';
import {
  LinkReport,
  LoadEquipmentDetail,
  SetEquipmentStatus,
  UnlinkReport,
} from '../../../../state/equipment/equipment.actions';
import { EquipmentService } from '../../../services/http/equipment.service';
import {
  EquipmentStatusLabelPipe,
  EquipmentStatusSeverityPipe,
} from '../../../pipes/equipment-status.pipe';
import {
  EquipmentOriginLabelPipe,
  EquipmentOriginSeverityPipe,
} from '../../../pipes/equipment-origin.pipe';
import { EquipmentFormDialog } from '../../components/equipment-form-dialog/equipment-form-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';
import type { EquipmentReportLink } from '../../../data/dtos/equipment';

/** Equipment detail (11 §4): all fields + WMS unit link, derived service
 *  history (linked reports) with retro-link/unlink, retire/reactivate. */
@Component({
  selector: 'app-equipment-view',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    TagModule,
    CarouselModule,
    EquipmentStatusLabelPipe,
    EquipmentStatusSeverityPipe,
    EquipmentOriginLabelPipe,
    EquipmentOriginSeverityPipe,
    EquipmentFormDialog,
    PageHeader,
    LucidePencil,
    LucideLink,
    LucideUnlink,
  ],
  templateUrl: './equipment-view.html',
})
export class EquipmentView {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private api = inject(EquipmentService);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);

  protected equipment = select(EquipmentState.selected);
  protected formDialog = viewChild<EquipmentFormDialog>('formDialog');

  /** Retro-link candidates (same-client reports not yet linked). */
  protected reportOptions = signal<{ label: string; value: string }[]>([]);
  protected linkControl = new FormControl('', { nonNullable: true });
  protected linking = signal(false);

  protected isRetired = computed(() => this.equipment()?.status === 'retired');

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new LoadEquipmentDetail(id));
    // Candidates refresh whenever the detail (and its linked set) changes.
    effect(() => {
      if (this.equipment()) this.loadReportOptions();
    });
  }

  protected openEdit(): void {
    const eq = this.equipment();
    if (eq) this.formDialog()?.open({ equipment: eq });
  }

  protected refresh(): void {
    const eq = this.equipment();
    if (eq) this.store.dispatch(new LoadEquipmentDetail(eq.id));
  }

  /** Load same-client reports for the attach select (on demand). */
  protected loadReportOptions(): void {
    const eq = this.equipment();
    if (!eq) return;
    this.api.reportOptions(eq.customerId).subscribe({
      next: (items) => {
        const linked = new Set((eq.reports ?? []).map((r) => r.id));
        this.reportOptions.set(
          items
            .filter((r) => !linked.has(r.id))
            .map((r) => ({
              label: `${r.folio ?? r.id} · ${r.serviceDate}`,
              value: r.id,
            })),
        );
      },
      error: () => this.reportOptions.set([]),
    });
  }

  protected attach(): void {
    const eq = this.equipment();
    const reportId = this.linkControl.value;
    if (!eq || !reportId || this.linking()) return;
    this.linking.set(true);
    this.store.dispatch(new LinkReport(eq.id, reportId)).subscribe({
      next: () => {
        this.linking.set(false);
        this.linkControl.setValue('');
        this.messages.add({ severity: 'success', summary: 'Reporte vinculado' });
      },
      error: (err) => {
        this.linking.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo vincular',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  protected detach(report: EquipmentReportLink): void {
    const eq = this.equipment();
    if (!eq) return;
    // Categorization fix, not an audit record (11 §2) — plain confirm.
    this.confirmation.confirm({
      header: 'Desvincular reporte',
      message: 'El reporte no se toca; solo deja de contar en el historial de esta unidad.',
      acceptLabel: 'Desvincular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-danger',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.store.dispatch(new UnlinkReport(eq.id, report.id)).subscribe({
          error: (err) =>
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo desvincular',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            }),
        });
      },
    });
  }

  protected toggleStatus(): void {
    const eq = this.equipment();
    if (!eq) return;
    const target = eq.status === 'active' ? 'retired' : 'active';
    this.confirmation.confirm({
      header: target === 'retired' ? 'Retirar equipo' : 'Reactivar equipo',
      message:
        target === 'retired'
          ? 'La unidad deja de aparecer como activa; su historial se conserva.'
          : 'La unidad vuelve a aparecer como activa.',
      acceptLabel: target === 'retired' ? 'Retirar' : 'Reactivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: target === 'retired' ? 'btn-danger' : 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.store.dispatch(new SetEquipmentStatus(eq.id, target)).subscribe({
          next: () =>
            this.messages.add({
              severity: 'success',
              summary: target === 'retired' ? 'Equipo retirado' : 'Equipo reactivado',
            }),
          error: (err) =>
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo cambiar el estado',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            }),
        });
      },
    });
  }
}

import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import {
  LucideDownload,
  LucideFileSignature,
  LucideFileSpreadsheet,
  LucideFileText,
} from '@lucide/angular';
import { Actions, ofActionErrored, select, Store } from '@ngxs/store';
import { ContractsState } from '../../../../state/contracts/contracts.state';
import { ContractsLoadOne } from '../../../../state/contracts/contracts.actions';
import { PortalContractsService } from '../../../services/http/portal-contracts.service';
import {
  ContractFileGlyphPipe,
  ContractTypeLabelPipe,
  ContractValidityLabelPipe,
  ContractValiditySeverityPipe,
} from '../../../pipes/contract.pipe';
import { FileSizePipe } from '../../../pipes/file-size.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadBlob, errorMessage } from '../../../data/utils';

/** Read-only contract detail (04 §4): the metadata block plus a download of
 *  the stored document. The document is not always a PDF, so the detail
 *  page — never the list — is what carries the real `fileName`/`fileMime`
 *  the download honours; there is no viewer to promise. */
@Component({
  selector: 'app-contract-detail',
  imports: [
    DatePipe,
    RouterLink,
    TagModule,
    ContractTypeLabelPipe,
    ContractValidityLabelPipe,
    ContractValiditySeverityPipe,
    ContractFileGlyphPipe,
    FileSizePipe,
    PageHeader,
    LucideDownload,
    LucideFileSignature,
    LucideFileSpreadsheet,
    LucideFileText,
  ],
  templateUrl: './contract-detail.html',
})
export class ContractDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly messages = inject(MessageService);
  private readonly contractsApi = inject(PortalContractsService);
  private readonly destroyRef = inject(DestroyRef);

  protected contract = select(ContractsState.selected);
  protected loading = select(ContractsState.selectedLoading);
  private error = select(ContractsState.selectedError);

  /** True once the load has settled with no contract to show — a real 404,
   *  not the initial-paint gap before the dispatch below runs. */
  protected notFound = computed(() => !this.loading() && !this.contract() && !!this.error());

  protected downloading = signal(false);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new ContractsLoadOne(id));

    this.actions$
      .pipe(ofActionErrored(ContractsLoadOne), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar el contrato',
          detail: this.error() ?? undefined,
        });
      });
  }

  /** Fetches the bytes and hands them to the browser under the document's
   *  own name — never a hardcoded `.pdf` (04 §4). The blob itself already
   *  carries the response's real content-type. */
  protected download(): void {
    const c = this.contract();
    if (!c || this.downloading()) return;
    this.downloading.set(true);
    this.contractsApi
      .downloadFile(c.id)
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({
        next: (blob) => downloadBlob(blob, c.fileName),
        error: (err: unknown) =>
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo descargar el documento',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          }),
      });
  }
}

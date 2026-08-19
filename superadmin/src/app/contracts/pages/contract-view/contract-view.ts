import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import {
  LucideDownload,
  LucideFileSpreadsheet,
  LucideFileText,
  LucidePencil,
  LucideTrash,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ContractsState } from '../../../../state/contracts/contracts.state';
import { LoadContract } from '../../../../state/contracts/contracts.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { ContractsService } from '../../../services/http/contracts.service';
import {
  ContractFileGlyphPipe,
  ContractTypeLabelPipe,
  ContractValidityLabelPipe,
  ContractValiditySeverityPipe,
  ContractVisibilityLabelPipe,
} from '../../../pipes/contract.pipe';
import { FileSizePipe } from '../../../pipes/file-size.pipe';
import { DeleteContractDialog } from '../../components/delete-contract-dialog/delete-contract-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { hasRole } from '../../../guards/has-role.guard';
import { errorMessage } from '../../../data/utils';

/** Contract detail (13 §6): the record, the stored document, and what it
 *  covers.
 *
 *  The document is **not a link** — it lives in a private bucket and is fetched
 *  as bytes through `GET /contracts/:id/file`, which re-checks access on every
 *  request (13 §1.2). There is no URL to copy, bookmark or leak. */
@Component({
  selector: 'app-contract-view',
  imports: [
    RouterLink,
    TableModule,
    TagModule,
    ContractTypeLabelPipe,
    ContractValidityLabelPipe,
    ContractValiditySeverityPipe,
    ContractFileGlyphPipe,
    ContractVisibilityLabelPipe,
    FileSizePipe,
    DeleteContractDialog,
    PageHeader,
    LucideDownload,
    LucideFileSpreadsheet,
    LucideFileText,
    LucidePencil,
    LucideTrash,
  ],
  templateUrl: './contract-view.html',
})
export class ContractView {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ContractsService);
  private messages = inject(MessageService);

  protected contract = select(ContractsState.selected);
  private me = select(AuthState.me);

  /** Deleting a contract is owner/admin only (13 §4); office files and edits. */
  protected canDelete = computed(() => hasRole(this.me(), ['owner', 'admin']));

  protected downloading = signal(false);

  protected deleteDialog = viewChild<DeleteContractDialog>('deleteDialog');

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new LoadContract(id));
  }

  protected openDelete(): void {
    const contract = this.contract();
    if (contract) this.deleteDialog()?.open(contract);
  }

  /** A deleted contract has no view left to show. */
  protected onDeleted(): void {
    this.router.navigate(['/contracts']);
  }

  /** Fetch the bytes and hand them to the browser (the report-PDF precedent).
   *  Nothing is stored or linked — the object URL is revoked immediately. */
  protected download(): void {
    const contract = this.contract();
    if (!contract || this.downloading()) return;
    this.downloading.set(true);
    this.api.download(contract.id).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = contract.fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.downloading.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo descargar el documento',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}

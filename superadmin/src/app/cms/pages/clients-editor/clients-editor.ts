import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LucideImageUp, LucidePlus, LucidePencil, LucideTrash2 } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CmsState } from '../../../../state/cms/cms.state';
import {
  CreateCmsClient,
  DeleteCmsClient,
  LoadCmsClients,
  PublishCms,
  UpdateCmsClient,
} from '../../../../state/cms/cms.actions';
import { UploadService } from '../../../services/http/upload.service';
import { PublishBar } from '../../components/publish-bar/publish-bar';
import { RichText } from '../../components/rich-text/rich-text';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { CmsClient } from '../../../data/dtos/cms';

/** Clients-document editor (04 §3): table of entries + drawer form; logo
 *  upload → R2 key; business relation through the constrained rich-text
 *  control. Draft→publish like the home editor. */
@Component({
  selector: 'app-clients-editor',
  imports: [
    ReactiveFormsModule,
    TableModule,
    DrawerModule,
    InputTextModule,
    PublishBar,
    RichText,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideImageUp,
  ],
  templateUrl: './clients-editor.html',
})
export class ClientsEditor implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private uploads = inject(UploadService);

  protected clients = select(CmsState.clients);
  protected unpublished = select(CmsState.clientsUnpublished);
  protected loading = select(CmsState.loading);

  protected drawerOpen = signal(false);
  protected busy = signal(false);
  protected editing = signal<CmsClient | null>(null);
  protected logo = signal<{ key?: string; url?: string; uploading: boolean }>({
    uploading: false,
  });

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    legal: [''],
    sector: [''],
    businessRelationDescription: [''],
  });

  constructor() {
    this.store.dispatch(new LoadCmsClients());
  }

  hasPendingChanges(): boolean {
    return this.drawerOpen() && this.form.dirty;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', legal: '', sector: '', businessRelationDescription: '' });
    this.logo.set({ uploading: false });
    this.drawerOpen.set(true);
  }

  protected openEdit(client: CmsClient): void {
    this.editing.set(client);
    this.form.reset({
      name: client.name,
      legal: client.legal ?? '',
      sector: client.sector ?? '',
      businessRelationDescription: client.businessRelationDescription ?? '',
    });
    this.logo.set({ key: client.logoKey, url: client.logoUrl, uploading: false });
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    if (this.form.dirty) {
      this.confirmation.confirm({
        header: 'Cambios sin guardar',
        message: '¿Cerrar el formulario y descartar los cambios?',
        acceptLabel: 'Descartar',
        rejectLabel: 'Seguir editando',
        acceptButtonStyleClass: 'btn-danger',
        rejectButtonStyleClass: 'btn-neutral',
        accept: () => this.drawerOpen.set(false),
      });
      return;
    }
    this.drawerOpen.set(false);
  }

  protected onLogoFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.logo.update((s) => ({ ...s, uploading: true }));
    this.uploads.uploadImage(file).subscribe({
      next: ({ key, url }) => {
        this.logo.set({ key, url, uploading: false });
        this.form.markAsDirty();
      },
      error: (err) => {
        this.logo.update((s) => ({ ...s, uploading: false }));
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo subir el logotipo',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) return;
    const raw = this.form.getRawValue();
    const payload = {
      name: raw.name,
      legal: raw.legal || undefined,
      sector: raw.sector || undefined,
      logoKey: this.logo().key,
      businessRelationDescription: raw.businessRelationDescription || undefined,
    };
    const editing = this.editing();
    this.busy.set(true);
    this.store
      .dispatch(editing ? new UpdateCmsClient(editing.id, payload) : new CreateCmsClient(payload))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.drawerOpen.set(false);
          this.form.markAsPristine();
          this.messages.add({
            severity: 'success',
            summary: editing ? 'Cliente actualizado' : 'Cliente agregado',
            detail: 'Recuerda publicar para verlo en el sitio.',
          });
        },
        error: (err) => {
          this.busy.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo guardar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }

  protected remove(client: CmsClient): void {
    this.confirmation.confirm({
      header: 'Eliminar cliente',
      message: `¿Eliminar «${client.name}» del contenido? Se aplicará al publicar.`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-danger',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.store.dispatch(new DeleteCmsClient(client.id)).subscribe({
          error: (err) =>
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo eliminar',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            }),
        });
      },
    });
  }

  protected publish(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.store.dispatch(new PublishCms('clients')).subscribe({
      next: () => {
        this.busy.set(false);
        this.messages.add({
          severity: 'success',
          summary: 'Publicado',
          detail: 'La sección de clientes ya está en el sitio público.',
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo publicar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}

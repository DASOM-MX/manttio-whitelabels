import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { from } from 'rxjs';
import { MessageService } from 'primeng/api';
import { LucideCopy, LucideDynamicIcon, LucideGlobe } from '@lucide/angular';
import { BrandState } from '../../../../state/brand/brand.state';
import { SHARE_CHANNELS } from '../../../model/constants/customer/share-channels.const';
import type { ShareLinkView } from '../../../data/dtos/share-links';

/** Canonical share links per channel (utm-params plan 01 CP-3): the tenant
 *  site's /contact-us plus each channel's UTM query, built from the brand
 *  loaded at boot — no page-local fetch. siteUrl is manager-provisioned; while
 *  it's absent the page shows an actionless empty state. */
@Component({
  selector: 'app-share-links',
  imports: [LucideCopy, LucideDynamicIcon, LucideGlobe],
  templateUrl: './share-links.html',
})
export class ShareLinks {
  private store = inject(Store);
  private messages = inject(MessageService);

  protected readonly brandLoaded = this.store.selectSignal(BrandState.loaded);
  private readonly brand = this.store.selectSignal(BrandState.brand);

  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  /** null → siteUrl not provisioned → empty state. */
  protected readonly links = computed<ShareLinkView[] | null>(() => {
    const siteUrl = this.brand()?.siteUrl?.trim().replace(/\/+$/, '');
    if (!siteUrl) return null;
    return SHARE_CHANNELS.map((channel) => ({
      ...channel,
      url: `${siteUrl}/contact-us${channel.query ? `?${channel.query}` : ''}`,
    }));
  });

  protected copy(link: ShareLinkView): void {
    from(navigator.clipboard.writeText(link.url)).subscribe({
      next: () =>
        this.messages.add({ severity: 'success', summary: `Enlace de ${link.label} copiado` }),
      error: () =>
        this.messages.add({
          severity: 'warn',
          summary: 'No se pudo copiar',
          detail: 'Selecciona y copia el enlace manualmente.',
        }),
    });
  }
}

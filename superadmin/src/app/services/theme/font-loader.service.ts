import { Injectable } from '@angular/core';
import type { FontCatalogEntry } from '../../data/dtos/brand';

/** On-demand catalog font loading for the brand editor's sample previews
 *  (03 §6) — catalog fonts never ship with the superadmin bundle; Nunito Sans
 *  stays the product chrome. Resolves quietly on failure (preview just falls
 *  back to the system stack). */
@Injectable({ providedIn: 'root' })
export class FontLoaderService {
  private readonly loaded = new Set<string>();

  async ensureLoaded(entry: FontCatalogEntry): Promise<void> {
    const url = entry.files?.variable;
    if (!url || this.loaded.has(entry.code)) return;
    try {
      const face = new FontFace(entry.label, `url(${url})`, {
        weight: '100 900',
        display: 'swap',
      });
      await face.load();
      document.fonts.add(face);
      this.loaded.add(entry.code);
    } catch {
      // Preview falls back to the system stack; the picker still works.
    }
  }
}

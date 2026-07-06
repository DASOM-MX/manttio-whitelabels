import type { FontCatalogEntry } from '../data/dtos/brand';

const loaded = new Set<string>();

/** Load a catalog font on demand for the editor's sample previews (03 §6) —
 *  catalog fonts never ship with the superadmin bundle; Commissioner stays
 *  the product chrome. Resolves quietly on failure (preview just falls back). */
export const ensureFontLoaded = async (entry: FontCatalogEntry): Promise<void> => {
  const url = entry.files?.variable;
  if (!url || loaded.has(entry.code)) return;
  try {
    const face = new FontFace(entry.label, `url(${url})`, {
      weight: '100 900',
      display: 'swap',
    });
    await face.load();
    document.fonts.add(face);
    loaded.add(entry.code);
  } catch {
    // Preview falls back to the system stack; the picker still works.
  }
};

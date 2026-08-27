// Generates the PWA icon set from the tenant's uploaded mark (plan 02 §2,
// decided 2026-07-12: the backend generates, the manifest route injects).
// PNG in, PNG out — a missing object or non-PNG source fails soft to null:
// the brand still saves and the app manifest falls back to its neutral
// bundled set. Regenerated on every brand save (rare admin writes; the mark,
// its bytes, or the maskable background may all have changed) — the caller
// deletes the superseded objects.

import UPNG from 'upng-js';
import { putObject } from '../../storage/services/storage.service';
import { BRAND_ICON_SPECS } from '../constants/icon-specs';
import { compositeIcon } from '../utils/rgba-image';
import type { IconBackground, RgbaImage } from '../utils/rgba-image';
import type { BrandIconsRecord } from '../types/brand-icons.types';

/** Maskable spec: content must survive any platform mask inside the inner 80%. */
const MASKABLE_SAFE_ZONE = 0.8;

const iconKey = (filename: string) => `icons/${Date.now()}-${filename}`;

/** Solid tile behind the maskable icons. Literal white since 22 CP-1: the
 *  chrome neutral left the brand contract, and an icon plate is a plate — the
 *  platform mask crops it, so it must be the one color every launcher reads
 *  as "no plate". */
const MASKABLE_BACKGROUND: IconBackground = { r: 255, g: 255, b: 255 };

export const generateBrandIcons = async (
  bucket: R2Bucket,
  sourceKey: string,
): Promise<BrandIconsRecord | null> => {
  const object = await bucket.get(sourceKey);
  if (!object) return null;

  let src: RgbaImage;
  try {
    const png = UPNG.decode(await object.arrayBuffer());
    src = {
      width: png.width,
      height: png.height,
      data: new Uint8Array(UPNG.toRGBA8(png)[0]!),
    };
  } catch {
    return null; // not a decodable PNG — icon set skipped, manifest goes neutral
  }

  const record: Partial<Record<keyof BrandIconsRecord, string>> = {};
  for (const spec of BRAND_ICON_SPECS) {
    const image = spec.maskable
      ? compositeIcon(src, spec.size, MASKABLE_SAFE_ZONE, MASKABLE_BACKGROUND)
      : compositeIcon(src, spec.size, 1, null);
    const bytes = UPNG.encode([image.data.buffer as ArrayBuffer], spec.size, spec.size, 0);
    record[spec.field] = await putObject(bucket, iconKey(spec.filename), bytes, 'image/png');
  }
  return record as BrandIconsRecord;
};

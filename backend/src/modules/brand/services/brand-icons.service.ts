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
import { hslToRgb01 } from '../utils/hsl-color';
import { compositeIcon } from '../utils/rgba-image';
import type { IconBackground, RgbaImage } from '../utils/rgba-image';
import type { BrandColors } from '../dtos/brand.dto';
import type { BrandIconsRecord } from '../types/brand-icons.types';

/** Maskable spec: content must survive any platform mask inside the inner 80%. */
const MASKABLE_SAFE_ZONE = 0.8;

const iconKey = (filename: string) => `icons/${Date.now()}-${filename}`;

/** Solid tile behind the maskable icons — the brand's surface-0, white when
 *  the scale value doesn't parse. */
const maskableBackground = (colors: BrandColors): IconBackground => {
  const rgb = hslToRgb01(colors.surface['0'] ?? '');
  if (!rgb) return { r: 255, g: 255, b: 255 };
  const channel = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255);
  return { r: channel(rgb.r), g: channel(rgb.g), b: channel(rgb.b) };
};

export const generateBrandIcons = async (
  bucket: R2Bucket,
  sourceKey: string,
  colors: BrandColors,
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

  const background = maskableBackground(colors);
  const record: Partial<Record<keyof BrandIconsRecord, string>> = {};
  for (const spec of BRAND_ICON_SPECS) {
    const image = spec.maskable
      ? compositeIcon(src, spec.size, MASKABLE_SAFE_ZONE, background)
      : compositeIcon(src, spec.size, 1, null);
    const bytes = UPNG.encode([image.data.buffer as ArrayBuffer], spec.size, spec.size, 0);
    record[spec.field] = await putObject(bucket, iconKey(spec.filename), bytes, 'image/png');
  }
  return record as BrandIconsRecord;
};

import type { BrandIconsRecord } from '../types/brand-icons.types';

export type BrandIconSpec = {
  field: keyof BrandIconsRecord;
  size: number;
  maskable: boolean;
  filename: string;
};

/** The PWA manifest icon set generated from the tenant mark on brand save:
 *  'any' icons keep transparency (contain-fit); 'maskable' icons sit inside
 *  the 80% safe zone over a solid surface-0 tile (the maskable spec's
 *  full-bleed requirement). */
export const BRAND_ICON_SPECS: BrandIconSpec[] = [
  { field: 'any192Key', size: 192, maskable: false, filename: 'icon-192.png' },
  { field: 'any512Key', size: 512, maskable: false, filename: 'icon-512.png' },
  { field: 'maskable192Key', size: 192, maskable: true, filename: 'icon-maskable-192.png' },
  { field: 'maskable512Key', size: 512, maskable: true, filename: 'icon-maskable-512.png' },
];

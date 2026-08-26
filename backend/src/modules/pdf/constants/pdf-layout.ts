import { rgb } from 'pdf-lib';
import type { PdfTheme } from '../types/pdf.types';

// US Letter portrait with 40pt margins — page geometry for the generic PDF toolkit.
export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Document theme defaults. `fill` and `border` are not fallbacks any more:
// the chrome neutral left the brand contract (22 § Target 3), so these *are*
// the values every document renders — the fixed grayscale ramp's surface-100
// and surface-300. `text` and `accentFill` stay tenant-driven and keep these
// as the fail-soft used when a renderer is created without a brand theme.
export const DEFAULT_PDF_THEME: PdfTheme = {
  fill: rgb(0.96, 0.96, 0.96),
  border: rgb(0.82, 0.82, 0.82),
  text: rgb(0.1, 0.13, 0.2),
  accentFill: rgb(0.96, 0.96, 0.96),
};

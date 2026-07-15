import { rgb } from 'pdf-lib';
import type { PdfTheme } from '../types/pdf.types';

// US Letter portrait with 40pt margins — page geometry for the generic PDF toolkit.
export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Neutral default theme. Documents render with the tenant's brand-derived
// theme (see reports/helpers/report-pdf.helpers.ts) — this is the fail-soft
// used when a renderer is created without one.
export const DEFAULT_PDF_THEME: PdfTheme = {
  fill: rgb(0.863, 0.863, 0.863),
  border: rgb(0.6, 0.6, 0.6),
  text: rgb(0.1, 0.13, 0.2),
};

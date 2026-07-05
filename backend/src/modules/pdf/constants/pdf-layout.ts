import { rgb } from 'pdf-lib';

// US Letter portrait with 40pt margins — page geometry for the generic PDF toolkit.
export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Default theme colors. Whitelabel customization will eventually parameterize these
// per client; for now they are the shared defaults every document uses.
export const FILL_GRAY = rgb(0.863, 0.863, 0.863); // #DCDCDC
export const BORDER = rgb(0.6, 0.6, 0.6);
export const TEXT = rgb(0.1, 0.13, 0.2);

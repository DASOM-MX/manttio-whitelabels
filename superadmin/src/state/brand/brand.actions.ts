import type { SaveBrandRequest } from '../../app/data/dtos/brand';

/** Boot fetch of the public `GET /brand` (03 §4): pre-auth — the login screen
 *  already shows tenant logo + colors. Applies the theme on arrival. */
export class LoadBrand {
  static readonly type = '[Brand] Load Brand';
}

/** Owner-only `PUT /brand` — direct-apply (03 §8): re-themes superadmin
 *  immediately, no reload. */
export class SaveBrand {
  static readonly type = '[Brand] Save Brand';
  constructor(public payload: SaveBrandRequest) {}
}

/** Fetch the curated font catalog (03 §2.1) — the editor's pickers. */
export class LoadFonts {
  static readonly type = '[Brand] Load Fonts';
}

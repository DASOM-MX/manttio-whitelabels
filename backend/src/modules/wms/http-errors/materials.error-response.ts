import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import {
  MaterialHasStockError,
  SkuInUseError,
  TrackingImmutableError,
  UpcInUseError,
} from './materials.error';

/** Catalog domain errors → the API's `{ error, message }` shape (02 §9).
 *  Anything unrecognized is rethrown so real faults still reach the global
 *  handler as a logged 500. */
export const materialErrorResponse = (c: Context<AppBindings>, err: unknown) => {
  if (err instanceof SkuInUseError) {
    return c.json(
      { error: 'sku_in_use', message: `Ya existe un material con el SKU "${err.sku}".` },
      409,
    );
  }
  if (err instanceof UpcInUseError) {
    return c.json(
      {
        error: 'upc_in_use',
        message: `Ya existe un material con el código de barras "${err.upc}".`,
      },
      409,
    );
  }
  if (err instanceof TrackingImmutableError) {
    return c.json(
      {
        error: 'tracking_immutable',
        message: 'Este material ya tiene movimientos; su tipo de control no puede cambiarse.',
      },
      409,
    );
  }
  if (err instanceof MaterialHasStockError) {
    return c.json(
      {
        error: 'material_has_stock',
        message: 'Este material todavía tiene existencias; agótalas antes de eliminarlo.',
      },
      409,
    );
  }
  throw err;
};

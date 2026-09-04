import type { ParamMap, Params } from '@angular/router';

/** How one list page maps between its URL params and its filter controls
 *  (04 §1: filters + page live in the URL, `queryParamMap` is the single
 *  load path). */
export interface ListQueryConfig {
  /** Sync sanitized URL params into the form controls (`emitEvent: false` —
   *  the URL is already the source of truth here). */
  read: (params: ParamMap) => void;
  /** Serialize current control values into URL params; empty → null so the
   *  param drops off the URL. */
  write: () => Params;
  /** Dispatch the load for the current (sanitized) state. */
  load: (page: number) => void;
}

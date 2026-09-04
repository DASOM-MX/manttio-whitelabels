import type { Observable } from 'rxjs';

/** The slice of `AbstractControl` the list-filter bindings need. */
export interface FilterControl {
  valueChanges: Observable<unknown>;
}

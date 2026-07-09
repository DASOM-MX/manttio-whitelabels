import { Pipe, PipeTransform } from '@angular/core';

/** Set-membership test as a pure pipe (no method calls in templates): only
 *  re-runs when the set reference changes — togglers must replace the Set. */
@Pipe({ name: 'inSet' })
export class InSetPipe implements PipeTransform {
  transform(set: ReadonlySet<unknown>, item: unknown): boolean {
    return set.has(item);
  }
}

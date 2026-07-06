import { Pipe, PipeTransform } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup } from '@angular/forms';

/** Pure cast/access pipes for reactive-forms templates (01 Angular rules:
 *  no inline component-method calls in templates — pure pipes memoize per
 *  input reference, so these run once per control, not once per CD pass). */

@Pipe({ name: 'asGroup' })
export class AsFormGroupPipe implements PipeTransform {
  transform(ctrl: AbstractControl): FormGroup {
    return ctrl as FormGroup;
  }
}

@Pipe({ name: 'asControl' })
export class AsFormControlPipe implements PipeTransform {
  transform<T = string>(ctrl: AbstractControl): FormControl<T> {
    return ctrl as FormControl<T>;
  }
}

@Pipe({ name: 'formArray' })
export class FormArrayPipe implements PipeTransform {
  transform(ctrl: AbstractControl, key: string): FormArray<FormGroup> {
    return (ctrl as FormGroup).controls[key] as FormArray<FormGroup>;
  }
}

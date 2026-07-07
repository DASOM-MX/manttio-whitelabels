import { Component, forwardRef, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { PopoverModule, Popover } from 'primeng/popover';
import { LucidePlus } from '@lucide/angular';
import { ServiceIcon } from '../service-icon/service-icon';
import { SERVICE_ICONS } from '../../../model/constants/cms/service-icons.const';

/** Curated icon picker (04 §6): a CVA trigger button + popover with the fixed
 *  3×4 grid of `SERVICE_ICONS` codes. Value is the code (`''` = none — the
 *  site falls back to its positional defaults). */
@Component({
  selector: 'app-icon-picker',
  imports: [PopoverModule, ServiceIcon, LucidePlus],
  templateUrl: './icon-picker.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IconPicker),
      multi: true,
    },
  ],
})
export class IconPicker implements ControlValueAccessor {
  protected readonly icons = SERVICE_ICONS;
  protected value = signal('');
  protected disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected pick(code: string, popover: Popover): void {
    this.value.set(code);
    this.onChange(code);
    this.onTouched();
    popover.hide();
  }

  protected clear(popover: Popover): void {
    this.pick('', popover);
  }
}

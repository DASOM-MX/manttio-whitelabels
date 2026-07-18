import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideX } from '@lucide/angular';

/** Free-text tag chips (07 §3). Plain text input — CVA over `string[]`; Enter
 *  or coma adds, chips remove. */
@Component({
  selector: 'app-tags-input',
  imports: [LucideX],
  templateUrl: './tags-input.html',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TagsInput), multi: true },
  ],
})
export class TagsInput implements ControlValueAccessor {
  controlId = input('tags-input');

  protected tags = signal<string[]>([]);
  protected draft = signal('');
  protected disabled = signal(false);

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string[] | null): void {
    this.tags.set([...(value ?? [])]);
  }
  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commit(event.target as HTMLInputElement);
    } else if (event.key === 'Backspace' && !this.draft() && this.tags().length) {
      this.remove(this.tags().length - 1);
    }
  }

  protected onChangeEvent(event: Event): void {
    // Commit a pending tag when the field loses focus with unsaved text.
    this.commit(event.target as HTMLInputElement);
  }

  protected onBlur(): void {
    this.onTouched();
  }

  private commit(input: HTMLInputElement): void {
    const value = this.draft().trim().replace(/,+$/, '');
    if (value && !this.tags().includes(value)) {
      this.tags.update((t) => [...t, value]);
      this.onChange(this.tags());
    }
    this.draft.set('');
    input.value = '';
  }

  protected remove(index: number): void {
    if (this.disabled()) return;
    this.tags.update((t) => t.filter((_, i) => i !== index));
    this.onChange(this.tags());
  }
}

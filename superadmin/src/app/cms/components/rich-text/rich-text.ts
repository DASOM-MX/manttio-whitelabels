import {
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideBold, LucideItalic, LucideList } from '@lucide/angular';

/** Constrained rich-text control (04 §3 — decided at CP-2: minimal custom
 *  contenteditable, no Quill dependency). Whitelist: bold / italic / bullet
 *  lists / paragraphs only; paste is forced to plain text, markup is
 *  re-sanitized on every change. The backend sanitizes authoritatively on
 *  write — this control just keeps honest input honest. */
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'UL', 'LI', 'P', 'BR', 'DIV']);

const sanitize = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
      } else {
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
};

@Component({
  selector: 'app-rich-text',
  imports: [LucideBold, LucideItalic, LucideList],
  templateUrl: './rich-text.html',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RichText), multi: true }],
})
export class RichText implements ControlValueAccessor, AfterViewInit {
  controlId = input('rich-text');
  ariaLabel = input('Texto enriquecido');

  protected editor = viewChild<ElementRef<HTMLElement>>('editor');
  protected disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private pendingValue = '';

  writeValue(value: string | null): void {
    this.pendingValue = sanitize(value ?? '');
    const el = this.editor()?.nativeElement;
    if (el) el.innerHTML = this.pendingValue;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  ngAfterViewInit(): void {
    const el = this.editor()?.nativeElement;
    if (el) el.innerHTML = this.pendingValue;
  }

  protected onInput(): void {
    const el = this.editor()?.nativeElement;
    if (el) this.onChange(sanitize(el.innerHTML));
  }

  protected onBlur(): void {
    this.onTouched();
  }

  protected onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  }

  protected exec(command: 'bold' | 'italic' | 'insertUnorderedList'): void {
    if (this.disabled()) return;
    const el = this.editor()?.nativeElement;
    if (!el) return;
    el.focus();
    document.execCommand(command);
    this.onInput();
  }
}

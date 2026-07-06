import { Component, TemplateRef, contentChild, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormArray } from '@angular/forms';
import { LucideChevronDown, LucideChevronUp, LucidePlus, LucideTrash2 } from '@lucide/angular';

/** FormArray-backed repeater (04 §3): add / remove / reorder for every jsonb
 *  array group. Reorder ships as up/down buttons — the required keyboard
 *  alternative (01 Accessibility) doubles as the whole interaction; row
 *  enter animates via the shared `animate.enter` class. The parent owns the
 *  row factory (emits `add`) and supplies the row template:
 *
 *  `<ng-template #row let-ctrl let-i="index">…</ng-template>`
 */
@Component({
  selector: 'app-repeater',
  imports: [NgTemplateOutlet, LucidePlus, LucideTrash2, LucideChevronUp, LucideChevronDown],
  templateUrl: './repeater.html',
})
export class Repeater {
  array = input.required<FormArray>();
  addLabel = input('Agregar');
  /** What a row is, for the icon-button aria-labels (e.g. "insignia"). */
  itemName = input('elemento');
  readOnly = input(false);

  add = output<void>();

  protected rowTemplate = contentChild.required<TemplateRef<unknown>>('row');

  protected remove(index: number): void {
    this.array().removeAt(index);
    this.array().markAsDirty();
  }

  protected move(index: number, delta: -1 | 1): void {
    const arr = this.array();
    const target = index + delta;
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(target, ctrl);
    arr.markAsDirty();
  }
}

import { Component, TemplateRef, contentChild, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormArray } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { LucideGripVertical, LucidePlus, LucideTrash2 } from '@lucide/angular';

/** FormArray-backed repeater (04 §3): add / remove / reorder for every jsonb
 *  array group. Rows are flat — content | delete | drag handle, no per-row
 *  border. Reorder is CDK drag-and-drop; the handle also moves the row with
 *  ↑/↓ when focused — the required keyboard alternative (01 Accessibility).
 *  Row enter animates via the shared `animate.enter` class. The parent owns
 *  the row factory (emits `add`) and supplies the row template:
 *
 *  `<ng-template #row let-ctrl let-i="index">…</ng-template>`
 */
@Component({
  selector: 'app-repeater',
  imports: [NgTemplateOutlet, CdkDropList, CdkDrag, CdkDragHandle, LucidePlus, LucideTrash2, LucideGripVertical],
  templateUrl: './repeater.html',
})
export class Repeater {
  array = input.required<FormArray>();
  addLabel = input('Agregar');
  /** What a row is, for the icon-button aria-labels (e.g. "insignia"). */
  itemName = input('elemento');
  /** Divider between rows — for multi-field rows that would otherwise run
   *  together now that per-row borders are gone. */
  divided = input(false);
  readOnly = input(false);

  add = output<void>();

  protected rowTemplate = contentChild.required<TemplateRef<unknown>>('row');

  protected remove(index: number): void {
    this.array().removeAt(index);
    this.array().markAsDirty();
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.move(event.previousIndex, event.currentIndex - event.previousIndex);
  }

  protected onHandleKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    this.move(index, event.key === 'ArrowUp' ? -1 : 1);
    (event.target as HTMLElement).focus();
  }

  private move(index: number, delta: number): void {
    if (!delta) return;
    const arr = this.array();
    const target = index + delta;
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(target, ctrl);
    arr.markAsDirty();
  }
}

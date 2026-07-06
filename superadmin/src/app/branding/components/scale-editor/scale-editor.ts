import { Component, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideChevronDown } from '@lucide/angular';

/** One palette scale (03 §3): base hex picker + derived strip, with an
 *  advanced expander exposing every step for individual override
 *  (progressive-disclosure — 01 Forms & feedback). */
@Component({
  selector: 'app-scale-editor',
  imports: [ReactiveFormsModule, LucideChevronDown],
  templateUrl: './scale-editor.html',
})
export class ScaleEditor {
  label = input.required<string>();
  inputId = input.required<string>();
  baseControl = input.required<FormControl<string>>();
  /** One control per step ('0'/'50'…'950'), owned by the page. */
  scaleGroup = input.required<FormGroup>();
  steps = input.required<readonly string[]>();
  readOnly = input(false);

  protected expanded = signal(false);

  protected stepControl(step: string): FormControl<string> {
    return this.scaleGroup().get(step) as FormControl<string>;
  }

  protected stepValue(step: string): string {
    return this.stepControl(step)?.value ?? '#FFFFFF';
  }
}

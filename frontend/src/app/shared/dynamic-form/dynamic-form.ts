import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldConfig, FieldOption } from '../../interfaces/field-config';
import { ImagePickerComponent } from '../../reports/components/image-picker/image-picker';
import { SignatureComponent } from '../../reports/components/signature-pad/signature-pad';
import type { SignedPayload } from '../../data/dtos/report';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-dynamic-form',
  imports: [
    ReactiveFormsModule,
    ImagePickerComponent,
    SignatureComponent,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    DatePickerModule,
    ButtonModule,
  ],
  templateUrl: './dynamic-form.html',
  styleUrl: './dynamic-form.scss',
})
export class DynamicForm implements OnInit {
  @Input() fields: FieldConfig[] = [];
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() signatureChanged = new EventEmitter<SignedPayload | null>();

  form!: FormGroup;
  private fb = inject(FormBuilder);

  ngOnInit() {
    const group: { [key: string]: any } = {};
    this.fields.forEach((field) => {
      // `image` is reported via a separate `(filesSelected)` emitter and has no
      // form control, so we skip it here. Every other field type ends up as a
      // direct form control and is required by default — that's what disables
      // the submit button on an empty form.
      if (field.type === 'image') return;
      group[field.name] = [field.defaultValue, Validators.required];
    });

    this.form = this.fb.group(group);
  }

  ///
  @Output() submitForm = new EventEmitter<any>();

  onSubmit() {
    if (this.form.valid) {
      this.submitForm.emit(this.form.value);
    }
    console.log('Formulario enviado:', this.form.value);
  }

  onFilesSelected(files: File[]) {
    this.filesSelected.emit(files);
  }

  onSignatureChanged(payload: SignedPayload | null) {
    this.form.patchValue({ signature: payload?.dataUrl ?? null });
    this.signatureChanged.emit(payload);
  }

  getOptions(field: FieldConfig): FieldOption[] {
    if (!field.options) return [];
    return field.options.map((opt) =>
      typeof opt === 'string' ? { label: opt, value: opt } : opt,
    );
  }
}

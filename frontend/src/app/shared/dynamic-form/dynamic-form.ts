import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FieldConfig } from './models/field-config.model';
import { ImagePickerComponent } from '../../components/image-picker/image-picker';

@Component({
  selector: 'app-dynamic-form',
  imports: [CommonModule, ReactiveFormsModule, ImagePickerComponent],
  templateUrl: './dynamic-form.html',
  styleUrl: './dynamic-form.scss'
})
export class DynamicForm implements OnInit {
  @Input() fields: FieldConfig[] = [];

  form!: FormGroup;
  private fb = inject(FormBuilder);

  ngOnInit() {
    const group: { [key: string]: any } = {};
    this.fields.forEach(field => {
      group[field.name] = [field.defaultValue];
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
}

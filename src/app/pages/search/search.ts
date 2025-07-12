import { ChangeDetectorRef, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { FieldConfig } from '../../shared/dynamic-form/models/field-config.model';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [DynamicForm],
  templateUrl: './search.html',
  styleUrl: './search.scss'
})
export class Search {





}



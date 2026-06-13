export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldConfig {
  type: 'text' | 'textarea' | 'number' | 'image' | 'select' | 'datetime-local' | 'signature';
  label: string;
  defaultValue: any;
  name: string;
  options?: string[] | FieldOption[];
}

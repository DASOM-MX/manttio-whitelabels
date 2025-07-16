export interface FieldConfig {
    type: 'text' | 'number' | 'image' | 'select' | 'datetime-local';
    label: string;
    defaultValue: any;
    name: string;
    options?: string[];
}
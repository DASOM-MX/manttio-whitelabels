import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

@Component({
  selector: 'app-image-picker',
  standalone: true,
  template: `
    <div class="space-y-5">
      <label
        for="fileInput"
        class="flex items-center justify-center gap-3 w-full min-h-16 px-5 py-4 border-2 border-dashed border-granite-300 bg-granite-50 hover:bg-sky-50 hover:border-sky-700 text-granite-800 hover:text-sky-800 font-bold text-lg rounded-xl cursor-pointer transition-colors"
      >
        <i class="pi pi-camera text-xl"></i>
        <span>Agregar fotos</span>
      </label>

      <input
        id="fileInput"
        type="file"
        accept="image/*"
        multiple
        (change)="onFileSelected($event)"
        class="hidden"
        capture="environment"
      >

      @if (existingImages.length > 0) {
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          @for (img of existingImages; track img; let i = $index) {
            <div class="relative group rounded-xl overflow-hidden border-2 border-granite-200 shadow-sm">
              <img [src]="img" class="w-full aspect-square object-cover">
              <button type="button"
                class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white size-8 rounded-full shadow-md inline-flex items-center justify-center font-bold transition-colors"
                (click)="removeExistingImage(i)">
                <i class="pi pi-times"></i>
              </button>
            </div>
          }
        </div>
      }

      @if (previews().length > 0) {
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          @for (preview of previews(); track preview; let i = $index) {
            <div class="relative group rounded-xl overflow-hidden border-2 border-sky-300 shadow-sm">
              <img [src]="preview" class="w-full aspect-square object-cover">
              <button type="button"
                class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white size-8 rounded-full shadow-md inline-flex items-center justify-center font-bold transition-colors"
                (click)="removeNewImage(i)">
                <i class="pi pi-times"></i>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ImagePickerComponent {
  @Input() existingImages: string[] = [];
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() imagesRemoved = new EventEmitter<string[]>();

  selectedFiles = signal<File[]>([]);
  previews = signal<string[]>([]);

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);
    this.selectedFiles.update((current) => [...current, ...files]);
    this.previews.update((current) => [
      ...current,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);

    this.filesSelected.emit(this.selectedFiles());
    input.value = '';
  }

  removeNewImage(index: number) {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
    this.previews.update((previews) => previews.filter((_, i) => i !== index));
    this.filesSelected.emit(this.selectedFiles());
  }

  removeExistingImage(index: number) {
    const removed = this.existingImages.splice(index, 1);
    this.imagesRemoved.emit(removed);
  }
}

import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-image-picker',
  standalone: true,
  template: `
    <div class="space-y-4">
      <!-- Botón para seleccionar imágenes -->
      <label
        for="fileInput"
        class="block flex items-center justify-center w-full text-center border hover:bg-primary font-medium p-2 rounded cursor-pointer transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
          stroke-width="1.5" class="size-6 text-gray-500 stroke-blue-400">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
        </svg>
        <span class="text-gray-600">Agregar fotos</span>
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
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4">
          @for (img of existingImages; track img; let i = $index) {
            <div class="relative group rounded-lg overflow-hidden shadow-md">
              <img [src]="img" class="w-full h-32 object-cover rounded">
              <button type="button"
                class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-full px-2 py-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                (click)="removeExistingImage(i)">
                ✕
              </button>
            </div>
          }
        </div>
      }

      @if (previews.length > 0) {
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4">
          @for (preview of previews; track preview; let i = $index) {
            <div class="relative group rounded-lg overflow-hidden shadow-md">
              <img [src]="preview" class="w-full h-32 object-cover rounded">
              <button type="button"
                class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-full px-2 py-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                (click)="removeNewImage(i)">
                ✕
              </button>
            </div>
          }
        </div>
      }
    </div>
  `
})
export class ImagePickerComponent {
  @Input() existingImages: string[] = [];
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() imagesRemoved = new EventEmitter<string[]>();

  selectedFiles: File[] = [];
  previews: string[] = [];

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);
    files.forEach(file => {
      this.selectedFiles.push(file);
      this.previews.push(URL.createObjectURL(file));
    });

    this.filesSelected.emit(this.selectedFiles);
    input.value = '';
  }

  removeNewImage(index: number) {
    this.selectedFiles.splice(index, 1);
    this.previews.splice(index, 1);
    this.filesSelected.emit(this.selectedFiles);
  }

  removeExistingImage(index: number) {
    const removed = this.existingImages.splice(index, 1);
    this.imagesRemoved.emit(removed);
  }
}

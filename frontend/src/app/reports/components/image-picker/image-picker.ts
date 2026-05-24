import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

@Component({
  selector: 'app-image-picker',
  standalone: true,
  templateUrl: './image-picker.html',
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
    const removed = this.existingImages[index];
    this.existingImages = this.existingImages.filter((_, i) => i !== index);
    this.imagesRemoved.emit([removed]);
  }
}

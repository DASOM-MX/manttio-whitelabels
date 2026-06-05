import { Component, ElementRef, EventEmitter, Input, Output, signal, viewChild } from '@angular/core';
import { Popover, PopoverModule } from 'primeng/popover';

@Component({
  selector: 'app-image-picker',
  standalone: true,
  imports: [PopoverModule],
  templateUrl: './image-picker.html',
})
export class ImagePickerComponent {
  @Input() existingImages: string[] = [];
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() imagesRemoved = new EventEmitter<string[]>();

  selectedFiles = signal<File[]>([]);
  previews = signal<string[]>([]);

  private sourcePopover = viewChild.required<Popover>('sourcePopover');
  private cameraInput = viewChild.required<ElementRef<HTMLInputElement>>('cameraInput');
  private galleryInput = viewChild.required<ElementRef<HTMLInputElement>>('galleryInput');

  toggleSource(event: Event) {
    this.sourcePopover().toggle(event);
  }

  openCamera() {
    this.sourcePopover().hide();
    this.cameraInput().nativeElement.click();
  }

  openGallery() {
    this.sourcePopover().hide();
    this.galleryInput().nativeElement.click();
  }

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

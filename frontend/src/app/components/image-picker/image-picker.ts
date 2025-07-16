// import { Component } from '@angular/core';

// @Component({
//   selector: 'app-image-picker',
//   imports: [],
//   templateUrl: './image-picker.html',
//   styleUrl: './image-picker.scss'
// })
// export class ImagePicker {

// }

import { Component, forwardRef, Input, OnDestroy } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-picker',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ImagePickerComponent),
      multi: true
    }
  ],
  template: `
    <div class="relative w-full">
      <!-- Image Preview Container -->
      <div 
        class="relative w-full h-44 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        [class.border-solid]="imageUrl"
        [class.border-gray-400]="imageUrl"
        (click)="openMenu()"
        (keydown.enter)="openMenu()"
        (keydown.space)="openMenu()"
        tabindex="0"
        role="button"
        [attr.aria-label]="imageUrl ? 'Change image' : 'Add image'"
      >
        <!-- Image Preview -->
        <img 
          *ngIf="imageUrl" 
          [src]="imageUrl" 
          alt="Selected image preview"
          class="w-full h-full object-cover"
        />
        
        <!-- No Image State -->
        <div 
          *ngIf="!imageUrl" 
          class="flex flex-col items-center justify-center h-full text-gray-500"
        >
          <!-- Camera Icon (Heroicons) -->
          <svg class="w-12 h-12 mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          <span class="text-sm font-medium">{{ placeholder }}</span>
          <span class="text-xs text-gray-400 mt-1">Tap to add image</span>
        </div>

        <!-- Loading State -->
        <div 
          *ngIf="loading" 
          class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
        >
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      </div>

      <!-- Action Menu -->
      <div 
        *ngIf="showMenu" 
        class="absolute bottom-0 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden"
        [@slideUp]
      >
        <div class="p-2 space-y-1">
          <button 
            *ngIf="hasCameraSupport"
            (click)="takePhoto()"
            class="w-full flex items-center px-4 py-3 text-left text-gray-700 hover:bg-gray-50 rounded-md transition-colors duration-150"
            type="button"
          >
            <svg class="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            Take Photo
          </button>
          
          <button 
            (click)="selectFromFiles()"
            class="w-full flex items-center px-4 py-3 text-left text-gray-700 hover:bg-gray-50 rounded-md transition-colors duration-150"
            type="button"
          >
            <svg class="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            Choose from Files
          </button>
          
          <button 
            *ngIf="imageUrl"
            (click)="removeImage()"
            class="w-full flex items-center px-4 py-3 text-left text-red-600 hover:bg-red-50 rounded-md transition-colors duration-150"
            type="button"
          >
            <svg class="w-5 h-5 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            Remove Image
          </button>
        </div>
      </div>

      <!-- Backdrop -->
      <div 
        *ngIf="showMenu"
        class="fixed inset-0 bg-black bg-opacity-25 z-40"
        (click)="closeMenu()"
      ></div>
    </div>

    <!-- Hidden File Input -->
    <input 
      #fileInput
      type="file" 
      accept="image/*"
      (change)="onFileSelected($event)"
      class="hidden"
      [attr.capture]="useCamera ? 'environment' : null"
    />
  `,
  styles: [`
    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `],
  animations: [
    // Add Angular animations if needed
  ]
})
export class ImagePickerComponent implements ControlValueAccessor, OnDestroy {
  @Input() placeholder: string = 'Add Image';
  @Input() disabled: boolean = false;
  @Input() maxFileSizeMB: number = 5;

  imageUrl: string | null = null;
  showMenu: boolean = false;
  loading: boolean = false;
  hasCameraSupport: boolean = false;
  useCamera: boolean = false;

  private onChange = (value: any) => { };
  private onTouched = () => { };

  constructor() {
    this.checkCameraSupport();
    this.setupClickOutsideHandler();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  // ControlValueAccessor implementation
  writeValue(value: any): void {
    if (value) {
      this.imageUrl = value;
    } else {
      this.imageUrl = null;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  // Menu handlers
  openMenu(): void {
    if (this.disabled) return;
    this.showMenu = true;
    this.onTouched();
  }

  closeMenu(): void {
    this.showMenu = false;
  }

  // Image capture methods
  takePhoto(): void {
    this.useCamera = true;
    this.triggerFileInput();
    this.closeMenu();
  }

  selectFromFiles(): void {
    this.useCamera = false;
    this.triggerFileInput();
    this.closeMenu();
  }

  removeImage(): void {
    this.imageUrl = null;
    this.onChange(null);
    this.closeMenu();
  }

  private triggerFileInput(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      // Set capture attribute for camera
      if (this.useCamera && this.hasCameraSupport) {
        fileInput.setAttribute('capture', 'environment');
      } else {
        fileInput.removeAttribute('capture');
      }
      fileInput.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      // Validate file size
      if (file.size > this.maxFileSizeMB * 1024 * 1024) {
        alert(`File size must be less than ${this.maxFileSizeMB}MB`);
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
      }

      this.loading = true;
      this.processImage(file);
    }

    // Reset input
    input.value = '';
  }

  private processImage(file: File): void {
    const reader = new FileReader();

    reader.onload = (e) => {
      this.loading = false;
      this.imageUrl = e.target?.result as string;
      this.onChange(this.imageUrl);
    };

    reader.onerror = () => {
      this.loading = false;
      alert('Error reading file');
    };

    reader.readAsDataURL(file);
  }

  private checkCameraSupport(): void {
    // Check if device has camera support
    this.hasCameraSupport = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  private setupClickOutsideHandler(): void {
    document.addEventListener('click', this.handleClickOutside.bind(this));
  }

  private handleClickOutside(event: Event): void {
    const target = event.target as HTMLElement;
    const component = target.closest('app-image-picker');

    if (!component && this.showMenu) {
      this.closeMenu();
    }
  }

  private cleanup(): void {
    document.removeEventListener('click', this.handleClickOutside.bind(this));

    // Clean up object URLs to prevent memory leaks
    if (this.imageUrl && this.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.imageUrl);
    }
  }
}
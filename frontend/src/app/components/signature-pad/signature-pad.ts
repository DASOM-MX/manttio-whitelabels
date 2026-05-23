import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, inject } from '@angular/core';
import SignaturePad from 'signature_pad';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-signature',
  template: `
    <div class="w-full max-w-full">
      <canvas #canvas class="w-full h-48 border-2 border-gray-300 rounded-lg block"></canvas>
      <div class="mt-2 flex gap-2">
        <button type="button" (click)="saveSignature()" class="bg-primary  rounded text-white font-semibold py-2 px-4">
          Guardar Firma
        </button>
        <button type="button" (click)="clearSignature()" class="border-2 border-primary text-primary   text-dark font-semibold py-2 px-4 rounded">
          Limpiar Firma
        </button>
      </div>
    </div>
  `
})
export class SignatureComponent implements AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() signatureChanged = new EventEmitter<string>();
  private signaturePad!: SignaturePad;
  private toast = inject(ToastService);

  ngAfterViewInit(): void {
    this.signaturePad = new SignaturePad(this.canvasRef.nativeElement, {
      backgroundColor: 'rgb(255, 255, 255)'
    });
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')!.scale(ratio, ratio);
    this.signaturePad.clear();
  }

  saveSignature(): void {
    if (this.signaturePad.isEmpty()) {
      this.toast.show('Por favor, firme antes de guardar', 'error');
      return;
    }

    const dataURL = this.signaturePad.toDataURL();
    // const blob = this.dataURLtoBlob(dataURL);
    // console.log("firma:", blob);
    this.signatureChanged.emit(dataURL);
  }

  clearSignature(): void {
    this.signaturePad.clear();
    this.signatureChanged.emit('');
  }

  private dataURLtoBlob(dataURL: string): Blob {
    const parts = dataURL.split(';base64,');
    const mime = parts[0].split(':')[1];
    const binary = atob(parts[1]);
    const array = [];
    for (let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
    }
    return new Blob([new Uint8Array(array)], { type: mime });
  }
}
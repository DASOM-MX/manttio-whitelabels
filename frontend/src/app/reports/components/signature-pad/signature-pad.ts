import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, inject } from '@angular/core';
import SignaturePad from 'signature_pad';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-signature',
  templateUrl: './signature-pad.html',
})
export class SignatureComponent implements AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() signatureChanged = new EventEmitter<string>();
  private signaturePad!: SignaturePad;
  private messages = inject(MessageService);

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
      this.messages.add({ severity: 'error', summary: 'Por favor, firme antes de guardar' });
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
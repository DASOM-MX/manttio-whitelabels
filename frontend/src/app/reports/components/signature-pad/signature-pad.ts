import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, inject, signal } from '@angular/core';
import SignaturePad from 'signature_pad';
import { MessageService } from 'primeng/api';
import type { SignedPayload } from '../../../data/dtos/report';

@Component({
  selector: 'app-signature',
  templateUrl: './signature-pad.html',
})
export class SignatureComponent implements AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() signatureChanged = new EventEmitter<SignedPayload | null>();
  private signaturePad!: SignaturePad;
  private messages = inject(MessageService);

  readonly capturingLocation = signal(false);

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

  async saveSignature(): Promise<void> {
    if (this.signaturePad.isEmpty()) {
      this.messages.add({ severity: 'error', summary: 'Por favor, firme antes de guardar' });
      return;
    }

    if (!('geolocation' in navigator)) {
      this.messages.add({
        severity: 'error',
        summary: 'Este dispositivo no soporta geolocalización',
        detail: 'No se puede firmar sin ubicación.',
      });
      return;
    }

    this.capturingLocation.set(true);
    try {
      const position = await this.getCurrentPosition();
      const dataUrl = this.signaturePad.toDataURL();
      this.signatureChanged.emit({
        dataUrl,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      });
    } catch (err) {
      const detail = this.geolocationErrorMessage(err);
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo obtener la ubicación',
        detail,
      });
    } finally {
      this.capturingLocation.set(false);
    }
  }

  clearSignature(): void {
    this.signaturePad.clear();
    this.signatureChanged.emit(null);
  }

  private getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }

  private geolocationErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as GeolocationPositionError).code;
      if (code === 1) return 'Permiso denegado. Habilite la ubicación para firmar.';
      if (code === 2) return 'Ubicación no disponible. Verifique su GPS o conexión.';
      if (code === 3) return 'Tiempo de espera agotado. Intente de nuevo.';
    }
    return 'Intente de nuevo en unos segundos.';
  }
}

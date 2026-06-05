import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import SignaturePad from 'signature_pad';
import { MessageService } from 'primeng/api';
import type { SignedPayload } from '../../../data/dtos/report';

@Component({
  selector: 'app-signature',
  templateUrl: './signature-pad.html',
})
export class SignatureComponent {
  @Output() signatureChanged = new EventEmitter<SignedPayload | null>();

  /** Signal-based view query: undefined until the canvas is in the DOM (it lives
   *  inside a lazy-mounted dialog), then resolves to the ElementRef. The effect
   *  below reacts to that transition to construct the SignaturePad. */
  private canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  /** Holds the library instance once the canvas is laid out. Stays null until the
   *  effect runs, so saveSignature/clearSignature can no-op safely if called early. */
  private pad = signal<SignaturePad | null>(null);

  private messages = inject(MessageService);

  readonly capturingLocation = signal(false);

  constructor() {
    // Wait for the canvas to mount, *then* wait one animation frame for the browser
    // to lay it out, *then* construct the SignaturePad. Without the rAF defer, the
    // canvas can still report offsetWidth=0 (e.g. mid-dialog-enter-animation), the
    // resize pegs the drawing buffer to 0×0, and mouse/touch input never registers.
    effect(() => {
      const ref = this.canvasRef();
      if (!ref) return;
      requestAnimationFrame(() => {
        const canvas = ref.nativeElement;
        const pad = new SignaturePad(canvas, { backgroundColor: 'rgb(255, 255, 255)' });
        this.pad.set(pad);
        this.resizeCanvas(canvas);
      });
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const ref = this.canvasRef();
    if (ref) this.resizeCanvas(ref.nativeElement);
  }

  private resizeCanvas(canvas: HTMLCanvasElement) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')!.scale(ratio, ratio);
    this.pad()?.clear();
  }

  async saveSignature(): Promise<void> {
    const pad = this.pad();
    if (!pad) return;
    if (pad.isEmpty()) {
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
      const dataUrl = pad.toDataURL();
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
    const pad = this.pad();
    if (!pad) return;
    pad.clear();
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

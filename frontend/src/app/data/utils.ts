import { HttpParams } from '@angular/common/http';

export type Query = Record<string, string | number | boolean | undefined | null>;

export const toParams = (q?: Query): HttpParams | undefined => {
  if (!q) return undefined;
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
};

/** Extract a human-readable message from a thrown value. Tries the Angular
 *  `HttpErrorResponse` shape (`err.error.message`) first, then `Error.message`,
 *  then falls back to the supplied default. */
export const errorMessage = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};

/** Convert a data URL (e.g. a signature canvas export) into a `File`. */
export const dataUrlToFile = (dataUrl: string, filename: string): File => {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
};

/** Fetch a URL (blob:, http:, …) and return its contents as a base64 data URL. */
export const urlToDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

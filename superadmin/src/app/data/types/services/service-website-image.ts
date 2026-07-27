/** The service form's website-photo state (18 §1). Mirrors the clients-editor
 *  logo shape: what's stored is the R2 `key`; `url` is the backend-materialized
 *  preview; `uploading` gates the file input while a `POST /upload/website-image`
 *  is in flight. Both `key` and `url` are absent for a service with no photo. */
export interface ServiceWebsiteImage {
  key?: string;
  url?: string;
  uploading: boolean;
}

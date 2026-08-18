/** Ceiling of one `POST /services/import` (18 §6.3) — mirrors the backend's
 *  `importServicesSchema` cap. The preview blocks past it, so an oversized
 *  file gets a Spanish callout instead of the server's raw envelope 400. */
export const SERVICE_IMPORT_MAX_ROWS = 500;

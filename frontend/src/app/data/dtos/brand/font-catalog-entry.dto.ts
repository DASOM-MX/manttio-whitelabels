// Mirror of the backend `FontCatalogEntry` (GET /fonts). The app only consumes
// code / label / files / fallbackStack; the editor-facing hints ride along so
// the mirror stays byte-compatible with the canonical shape.

export interface FontCatalogEntry {
  code: string;
  label: string;
  /** Picker section in the superadmin editor. */
  group?: string;
  roles?: 'body' | 'heading' | 'both';
  files: {
    /** Variable woff2 URL on the shared fonts CDN; absent until configured. */
    variable?: string;
  };
  fallbackStack?: string;
  tnumVerified?: boolean;
  /** Catalog code pairing hint for the editor. */
  recommendedHeading?: string;
}

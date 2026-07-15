/** R2 keys of the generated PWA icon set — stored in the brand row's `icons`
 *  jsonb and materialized to CDN URLs (`BrandIcons`) on read. Internal shape:
 *  keys never leave the backend (rule 6). Lives in its own file so the model
 *  can import it without cycling through `brand.types.ts` (which imports the
 *  model for `$inferSelect`). */
export type BrandIconsRecord = {
  any192Key: string;
  any512Key: string;
  maskable192Key: string;
  maskable512Key: string;
};

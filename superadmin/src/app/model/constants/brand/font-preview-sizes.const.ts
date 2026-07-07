/** Preview ladder for the brand-editor typography section — the five sizes
 *  each selected font is showcased at (03 §2.1). Whitespace above each line
 *  grows with the size so the ladder breathes progressively. */
export const FONT_PREVIEW_SIZES = [
  { class: 'text-xs', gap: '', label: '12px' },
  { class: 'text-sm', gap: 'mt-2', label: '14px' },
  { class: 'text-base', gap: 'mt-3', label: '16px' },
  { class: 'text-xl', gap: 'mt-5', label: '20px' },
  { class: 'text-3xl', gap: 'mt-7', label: '30px' },
] as const;

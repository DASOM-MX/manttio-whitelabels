// CMS sections (superadmin plan 04 §2). Each section is one content document:
// `home` is a single jsonb doc; `clients` is entry rows snapshotted on publish.
export const CMS_SECTIONS = ['home', 'clients'] as const;

export type CmsSection = (typeof CMS_SECTIONS)[number];

export const isCmsSection = (value: string): value is CmsSection =>
  (CMS_SECTIONS as readonly string[]).includes(value);

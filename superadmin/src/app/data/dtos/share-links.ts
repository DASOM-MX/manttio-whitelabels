import type { LucideIcon } from '@lucide/angular';

export type ShareChannelKey =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'whatsapp-profile'
  | 'whatsapp-chat'
  | 'webpage';

export interface ShareChannel {
  key: ShareChannelKey;
  label: string;
  icon: LucideIcon;
  /** UTM query appended to /contact-us — null = clean URL (webpage channel). */
  query: string | null;
}

export interface ShareLinkView extends ShareChannel {
  url: string;
}

import {
  LucideCamera,
  LucideGlobe,
  LucideMessageCircle,
  LucideMusic2,
  LucideThumbsUp,
} from '@lucide/angular';
import type { ShareChannel } from '../../../data/dtos/share-links';

/** Canonical share channels (utm-params plan 01 CP-3). Both WhatsApp variants
 *  share `utm_source=whatsapp` and split on medium: the Business-profile
 *  description link vs links pasted into chats. `webpage` is the clean URL.
 *  Lucide ships no brand glyphs at all (removed upstream) — ThumbsUp/Camera/
 *  Music2/MessageCircle are stand-ins for Facebook/Instagram/TikTok/WhatsApp,
 *  pending design sign-off. */
export const SHARE_CHANNELS: ShareChannel[] = [
  {
    key: 'facebook',
    label: 'Facebook',
    icon: LucideThumbsUp,
    query: 'utm_source=facebook&utm_medium=social',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    icon: LucideCamera,
    query: 'utm_source=instagram&utm_medium=social',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: LucideMusic2,
    query: 'utm_source=tiktok&utm_medium=social',
  },
  {
    key: 'whatsapp-profile',
    label: 'WhatsApp (descripción)',
    icon: LucideMessageCircle,
    query: 'utm_source=whatsapp&utm_medium=profile',
  },
  {
    key: 'whatsapp-chat',
    label: 'WhatsApp (chat)',
    icon: LucideMessageCircle,
    query: 'utm_source=whatsapp&utm_medium=chat',
  },
  {
    key: 'webpage',
    label: 'Página web',
    icon: LucideGlobe,
    query: null,
  },
];

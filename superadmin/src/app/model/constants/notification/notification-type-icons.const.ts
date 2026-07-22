import {
  LucideArchive,
  LucideFileCheck,
  LucideFilePlus,
  LucideGlobe,
  LucideMegaphone,
  LucideMessageSquare,
  LucidePackageCheck,
  LucidePackageX,
  LucideUndo2,
  LucideUserCog,
  LucideUserPlus,
  LucideUserX,
  type LucideIcon,
} from '@lucide/angular';
import type { NotificationType } from '../../../data/dtos/notification';

/** Type → outlined Lucide glyph for the bell panel rows (plan §3.3). */
export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  replenishment_ready: LucidePackageCheck,
  replenishment_failed: LucidePackageX,
  replenishment_rejected: LucideUndo2,
  announcement: LucideMegaphone,
  report_created: LucideFilePlus,
  report_finalized: LucideFileCheck,
  client_registered_from_website: LucideGlobe,
  client_registered_from_superadmin: LucideUserPlus,
  client_blacklisted: LucideUserX,
  client_updated: LucideUserCog,
  client_archived: LucideArchive,
  client_interaction_registered: LucideMessageSquare,
};

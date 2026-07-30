import { LucideFilePlus, LucidePencil, LucideTrash2, type LucideIcon } from '@lucide/angular';
import { ServiceEventType } from '../../enums/services/service-event-type.enum';

/** Type → outlined Lucide glyph for the timeline rows. */
export const SERVICE_EVENT_ICONS: Record<ServiceEventType, LucideIcon> = {
  [ServiceEventType.Created]: LucideFilePlus,
  [ServiceEventType.Updated]: LucidePencil,
  [ServiceEventType.Deleted]: LucideTrash2,
};

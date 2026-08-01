import {
  LucideBan,
  LucideBellRing,
  LucideEye,
  LucideFilePlus,
  LucideGitCommitHorizontal,
  LucideListPlus,
  LucideMessageSquareReply,
  LucideSend,
  LucideTrash2,
  LucideWrench,
  type LucideIcon,
} from '@lucide/angular';
import { QuotationEventType } from '../../enums/quotation/quotation-event-type.enum';

/** Type → outlined Lucide glyph for the timeline rows. */
export const QUOTATION_EVENT_ICONS: Record<QuotationEventType, LucideIcon> = {
  [QuotationEventType.Created]: LucideFilePlus,
  [QuotationEventType.LineAdded]: LucideListPlus,
  [QuotationEventType.Sent]: LucideSend,
  [QuotationEventType.Viewed]: LucideEye,
  [QuotationEventType.ReviewerResponded]: LucideMessageSquareReply,
  [QuotationEventType.StatusDerived]: LucideGitCommitHorizontal,
  [QuotationEventType.OrderCreated]: LucideWrench,
  [QuotationEventType.ReminderSent]: LucideBellRing,
  [QuotationEventType.Cancelled]: LucideBan,
  [QuotationEventType.Deleted]: LucideTrash2,
};

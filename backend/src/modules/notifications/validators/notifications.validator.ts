import { z } from 'zod';
import { NotificationStatus } from '../enums/notifications.enum';

// Paged, newest-first list (plan §2.2). `?status=unread` narrows to the badge's
// backlog; omitted = full history.
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.nativeEnum(NotificationStatus).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

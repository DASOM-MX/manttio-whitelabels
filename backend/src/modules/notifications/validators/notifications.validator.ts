import { z } from 'zod';
import { NotificationStatus } from '../enums/notifications.enum';
import { ROLES } from '../../users/enums/users.enum';

// Paged, newest-first list (plan §2.2). `?status=unread` narrows to the badge's
// backlog; omitted = full history. Page size 20 (owner, 2026-07-21 — the bell
// loads with the server default).
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(NotificationStatus).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

const roleSchema = z.enum(ROLES);

// Owner-authored explicit send (POST /notifications — plan §0, 2026-07-20).
// Addressing mirrors notify(): a direct recipient, or a role broadcast when
// none is given; at least one is required. The type is NOT accepted here —
// the controller stamps `announcement`.
export const sendNotificationSchema = z
  .object({
    recipientUserId: z.string().uuid().optional(),
    role: z.union([roleSchema, z.array(roleSchema).min(1)]).optional(),
    title: z.string().min(1),
    body: z.string().min(1),
    data: z.record(z.unknown()).optional(),
  })
  .refine((v) => v.recipientUserId || v.role, {
    message: 'recipientUserId or role is required',
  });

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

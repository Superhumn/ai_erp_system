// appRouter.notifications — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// ============================================
// NOTIFICATIONS
// ============================================
export const notificationsRouter = router({
    list: protectedProcedure
      .input(z.object({
        unreadOnly: z.boolean().optional(),
        type: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ ctx, input }) => db.getUserNotifications(ctx.user.id, input)),
    unreadCount: protectedProcedure.query(({ ctx }) => db.getUnreadNotificationCount(ctx.user.id)),
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.markNotificationAsRead(input.id, ctx.user.id)),
    markAllRead: protectedProcedure.mutation(({ ctx }) => db.markAllNotificationsAsRead(ctx.user.id)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteNotification(input.id, ctx.user.id)),
    getPreferences: protectedProcedure.query(({ ctx }) => db.getUserNotificationPreferences(ctx.user.id)),
    updatePreferences: protectedProcedure
      .input(z.object({
        notificationType: z.string(),
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
        push: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => db.updateNotificationPreference(
        ctx.user.id,
        input.notificationType,
        { inApp: input.inApp, email: input.email, push: input.push }
      )),
  });

/**
 * Messaging Gateway Router
 *
 * tRPC endpoints for managing messaging channels, viewing logs,
 * registering identities, and sending test messages.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { sendMessage } from "./messagingGateway";
import { processInboundMessage, interpretMessage } from "./nlMessageInterpreter";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const messagingRouter = router({
  // ============================================
  // CHANNEL MANAGEMENT
  // ============================================

  getChannels: protectedProcedure.query(async ({ ctx }) => {
    return db.getMessagingChannels({ companyId: (ctx.user as any).companyId ?? undefined });
  }),

  upsertChannel: adminProcedure
    .input(
      z.object({
        channel: z.enum(["sms", "whatsapp", "google_chat"]),
        isEnabled: z.boolean().default(true),
        config: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const id = await db.upsertMessagingChannel({
        companyId: (ctx.user as any).companyId ?? undefined,
        channel: input.channel,
        isEnabled: input.isEnabled,
        config: input.config,
        defaultUserId: ctx.user.id,
      });
      return { id };
    }),

  updateChannel: adminProcedure
    .input(
      z.object({
        id: z.number(),
        isEnabled: z.boolean().optional(),
        config: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateMessagingChannel(id, data);
      return { success: true };
    }),

  // ============================================
  // IDENTITY MANAGEMENT (link phone/chat IDs to users)
  // ============================================

  getIdentities: protectedProcedure
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      return db.getMessagingIdentities({
        companyId: (ctx.user as any).companyId ?? undefined,
        userId: input?.userId,
      });
    }),

  registerIdentity: protectedProcedure
    .input(
      z.object({
        channel: z.enum(["sms", "whatsapp", "google_chat"]),
        identifier: z.string().min(1),
        displayName: z.string().optional(),
        userId: z.number().optional(), // Admin can register for other users
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const targetUserId = input.userId && ctx.user.role === "admin" ? input.userId : ctx.user.id;
      const id = await db.upsertMessagingIdentity({
        companyId: (ctx.user as any).companyId ?? undefined,
        userId: targetUserId,
        channel: input.channel,
        identifier: input.identifier,
        displayName: input.displayName,
        isVerified: false,
        isActive: true,
      });
      return { id };
    }),

  deleteIdentity: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteMessagingIdentity(input.id);
      return { success: true };
    }),

  // ============================================
  // MESSAGE LOGS
  // ============================================

  getLogs: protectedProcedure
    .input(
      z.object({
        channel: z.enum(["sms", "whatsapp", "google_chat"]).optional(),
        direction: z.enum(["inbound", "outbound"]).optional(),
        limit: z.number().min(1).max(200).default(50),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      return db.getMessagingLogs({
        companyId: (ctx.user as any).companyId ?? undefined,
        channel: input?.channel,
        direction: input?.direction,
        limit: input?.limit ?? 50,
      });
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    return db.getMessagingLogStats((ctx.user as any).companyId ?? undefined);
  }),

  // ============================================
  // SEND MESSAGE (manual outbound)
  // ============================================

  sendMessage: protectedProcedure
    .input(
      z.object({
        channel: z.enum(["sms", "whatsapp", "google_chat"]),
        to: z.string().min(1),
        body: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await sendMessage({
        channel: input.channel,
        to: input.to,
        body: input.body,
      });

      // Log the outbound message
      await db.createMessagingLog({
        companyId: (ctx.user as any).companyId ?? null,
        userId: ctx.user.id,
        channel: input.channel,
        direction: "outbound",
        senderIdentifier: "system",
        recipientIdentifier: input.to,
        rawMessage: input.body,
        actionSuccess: result.success,
        externalMessageId: result.externalMessageId ?? null,
        errorMessage: result.error ?? null,
        processedAt: new Date(),
      });

      return result;
    }),

  // ============================================
  // TEST / PREVIEW NL INTERPRETATION
  // ============================================

  interpretMessage: protectedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const interpretation = await interpretMessage(input.message);
      return interpretation;
    }),

  // Simulate processing a message (for testing)
  testProcess: adminProcedure
    .input(
      z.object({
        channel: z.enum(["sms", "whatsapp", "google_chat"]),
        message: z.string().min(1),
        senderIdentifier: z.string().default("test-user"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await processInboundMessage(
        {
          channel: input.channel,
          senderIdentifier: input.senderIdentifier,
          rawMessage: input.message,
          senderName: ctx.user.name || "Test User",
        },
        ctx.user.id.toString(),
        (ctx.user as any).companyId ?? undefined,
      );
      return result;
    }),
});

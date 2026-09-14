// appRouter.emailCannedResponses — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// ============================================
// EMAIL CANNED RESPONSES
// ============================================
export const emailCannedResponsesRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      const { emailCannedResponses } = await import("../../drizzle/schema");
      return database.select().from(emailCannedResponses).where(eq(emailCannedResponses.userId, ctx.user.id));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        content: z.string().min(1),
        shortcut: z.string().optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailCannedResponses } = await import("../../drizzle/schema");
        const result = await database.insert(emailCannedResponses).values({
          userId: ctx.user.id,
          name: input.name,
          content: input.content,
          shortcut: input.shortcut ?? null,
          category: input.category ?? null,
        });
        return { id: (result as any)[0].insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        shortcut: z.string().optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailCannedResponses } = await import("../../drizzle/schema");
        const patch: Record<string, unknown> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.content !== undefined) patch.content = input.content;
        if (input.shortcut !== undefined) patch.shortcut = input.shortcut;
        if (input.category !== undefined) patch.category = input.category;
        await database.update(emailCannedResponses).set(patch).where(and(eq(emailCannedResponses.id, input.id), eq(emailCannedResponses.userId, ctx.user.id)));
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailCannedResponses } = await import("../../drizzle/schema");
        await database.delete(emailCannedResponses).where(and(eq(emailCannedResponses.id, input.id), eq(emailCannedResponses.userId, ctx.user.id)));
        return { ok: true };
      }),

    incrementUsage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) return { ok: true };
        const { emailCannedResponses } = await import("../../drizzle/schema");
        const [row] = await database.select().from(emailCannedResponses).where(and(eq(emailCannedResponses.id, input.id), eq(emailCannedResponses.userId, ctx.user.id)));
        if (row) {
          await database.update(emailCannedResponses).set({ usageCount: (row.usageCount ?? 0) + 1 }).where(and(eq(emailCannedResponses.id, input.id), eq(emailCannedResponses.userId, ctx.user.id)));
        }
        return { ok: true };
      }),
  });

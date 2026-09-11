// appRouter.exerciseRequests — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { createAuditLog } from "./_shared";

// ============================================
// EXERCISE REQUESTS
// ============================================
export const exerciseRequestsRouter = router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        stakeholderId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getExerciseRequests(input)),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        stakeholderId: z.number(),
        grantId: z.number(),
        sharesToExercise: z.string(),
        exercisePrice: z.string(),
        totalCost: z.string(),
        exerciseType: z.enum(["cash", "cashless", "net_exercise"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Validate shares available to exercise
        const grants = await db.getEquityGrantsByStakeholder(input.stakeholderId);
        const grant = grants.find((g: any) => g.id === input.grantId);
        if (!grant) throw new TRPCError({ code: "NOT_FOUND", message: "Grant not found" });

        const sharesVested = parseFloat(grant.sharesVested || "0");
        const sharesExercised = parseFloat(grant.sharesExercised || "0");
        const available = sharesVested - sharesExercised;
        const requested = parseFloat(input.sharesToExercise);

        if (requested <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Shares to exercise must be greater than 0" });
        if (requested > available) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${available.toFixed(4)} shares available to exercise` });

        const result = await db.createExerciseRequest(input as any);
        await createAuditLog(ctx.user.id, 'create', 'exercise_request', result.id, `${input.sharesToExercise} shares`);
        return result;
      }),

    approve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.approveExerciseRequest(input.id, ctx.user.id);
        await createAuditLog(ctx.user.id, 'update', 'exercise_request', input.id, 'Approved');
        return result;
      }),

    deny: protectedProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.updateExerciseRequest(input.id, {
          status: "denied",
          denialReason: input.reason,
        } as any);
        await createAuditLog(ctx.user.id, 'update', 'exercise_request', input.id, 'Denied');
        return result;
      }),

    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.updateExerciseRequest(input.id, {
          status: "cancelled",
        } as any);
        await createAuditLog(ctx.user.id, 'update', 'exercise_request', input.id, 'Cancelled');
        return result;
      }),
  });

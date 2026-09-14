// appRouter.emailSequences — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// ============================================
// EMAIL SEQUENCES
// ============================================
export const emailSequencesRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      const { emailSequences, emailSequenceSteps } = await import("../../drizzle/schema");
      const rows = await database.select().from(emailSequences).where(eq(emailSequences.userId, ctx.user.id));
      // Attach step count
      const withSteps = await Promise.all(rows.map(async (seq: any) => {
        const steps = await database.select().from(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, seq.id));
        return { ...seq, stepCount: steps.length, steps };
      }));
      return withSteps;
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailSequences, emailSequenceSteps } = await import("../../drizzle/schema");
        const [seq] = await database.select().from(emailSequences).where(and(eq(emailSequences.id, input.id), eq(emailSequences.userId, ctx.user.id)));
        if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "Sequence not found" });
        const steps = await database.select().from(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, input.id));
        return { ...seq, steps: steps.sort((a: any, b: any) => a.stepOrder - b.stepOrder) };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["draft", "active", "paused", "archived"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailSequences } = await import("../../drizzle/schema");
        const result = await database.insert(emailSequences).values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? "draft",
        });
        return { id: (result as any)[0].insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        status: z.enum(["draft", "active", "paused", "archived"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailSequences } = await import("../../drizzle/schema");
        const patch: Record<string, unknown> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.description !== undefined) patch.description = input.description;
        if (input.status !== undefined) patch.status = input.status;
        await database.update(emailSequences).set(patch).where(and(eq(emailSequences.id, input.id), eq(emailSequences.userId, ctx.user.id)));
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailSequences, emailSequenceSteps } = await import("../../drizzle/schema");
        // Verify ownership before deleting steps
        const [seq] = await database.select().from(emailSequences).where(and(eq(emailSequences.id, input.id), eq(emailSequences.userId, ctx.user.id)));
        if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "Sequence not found" });
        await database.delete(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, input.id));
        await database.delete(emailSequences).where(eq(emailSequences.id, input.id));
        return { ok: true };
      }),

    addStep: protectedProcedure
      .input(z.object({
        sequenceId: z.number(),
        subject: z.string().min(1),
        body: z.string().min(1),
        delayDays: z.number().min(0).default(1),
        stepOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailSequences, emailSequenceSteps } = await import("../../drizzle/schema");
        const [seq] = await database.select().from(emailSequences).where(and(eq(emailSequences.id, input.sequenceId), eq(emailSequences.userId, ctx.user.id)));
        if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "Sequence not found" });
        const existing = await database.select().from(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, input.sequenceId));
        const order = input.stepOrder ?? existing.length + 1;
        const result = await database.insert(emailSequenceSteps).values({
          sequenceId: input.sequenceId,
          stepOrder: order,
          subject: input.subject,
          body: input.body,
          delayDays: input.delayDays,
        });
        return { id: (result as any)[0].insertId };
      }),

    updateStep: protectedProcedure
      .input(z.object({
        stepId: z.number(),
        subject: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        delayDays: z.number().min(0).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailSequences, emailSequenceSteps } = await import("../../drizzle/schema");
        // Verify the step's parent sequence belongs to the user
        const [step] = await database.select().from(emailSequenceSteps).where(eq(emailSequenceSteps.id, input.stepId));
        if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "Step not found" });
        const [seq] = await database.select().from(emailSequences).where(and(eq(emailSequences.id, step.sequenceId), eq(emailSequences.userId, ctx.user.id)));
        if (!seq) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
        const patch: Record<string, unknown> = {};
        if (input.subject !== undefined) patch.subject = input.subject;
        if (input.body !== undefined) patch.body = input.body;
        if (input.delayDays !== undefined) patch.delayDays = input.delayDays;
        await database.update(emailSequenceSteps).set(patch).where(eq(emailSequenceSteps.id, input.stepId));
        return { ok: true };
      }),

    deleteStep: protectedProcedure
      .input(z.object({ stepId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { emailSequences, emailSequenceSteps } = await import("../../drizzle/schema");
        // Verify the step's parent sequence belongs to the user
        const [step] = await database.select().from(emailSequenceSteps).where(eq(emailSequenceSteps.id, input.stepId));
        if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "Step not found" });
        const [seq] = await database.select().from(emailSequences).where(and(eq(emailSequences.id, step.sequenceId), eq(emailSequences.userId, ctx.user.id)));
        if (!seq) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
        await database.delete(emailSequenceSteps).where(eq(emailSequenceSteps.id, input.stepId));
        return { ok: true };
      }),
  });

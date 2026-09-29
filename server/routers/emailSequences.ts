// appRouter.emailSequences — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { scopeAllows } from "../_core/scope";
import { internalProcedure, resolveRequestScope } from "./_shared";
import { mailableSkipReason } from "../campaignSender";
import { firstSendAt } from "../sequenceRunner";

/** The caller's own sequence, or NOT_FOUND. */
async function loadOwnSequence(sequenceId: number, userId: number) {
  const seq = await db.getEmailSequenceById(sequenceId);
  if (!seq || seq.userId !== userId) throw new TRPCError({ code: "NOT_FOUND", message: "Sequence not found" });
  return seq;
}

/** An enrollment on one of the caller's sequences and inside their entity scope, or NOT_FOUND. */
async function loadOwnEnrollment(enrollmentId: number, user: Parameters<typeof resolveRequestScope>[0] & { id: number }) {
  const enrollment = await db.getEmailSequenceEnrollmentById(enrollmentId);
  const seq = enrollment ? await db.getEmailSequenceById(enrollment.sequenceId) : undefined;
  if (!enrollment || !seq || seq.userId !== user.id || !scopeAllows(await resolveRequestScope(user), enrollment.companyId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Enrollment not found" });
  }
  return enrollment;
}

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
        const { emailSequenceEnrollments } = await import("../../drizzle/schema");
        await database.delete(emailSequenceEnrollments).where(eq(emailSequenceEnrollments.sequenceId, input.id));
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

    // --- ENROLLMENT ---
    // Contacts are put on a sequence here; server/sequenceRunner.ts sends the
    // steps. Only active sequences with at least one step accept contacts.
    enroll: internalProcedure
      .input(z.object({
        sequenceId: z.number(),
        contactIds: z.array(z.number().int().positive()).min(1).max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        const seq = await loadOwnSequence(input.sequenceId, ctx.user.id);
        if (seq.status !== "active") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activate the sequence before enrolling contacts" });
        }
        const steps = await db.getEmailSequenceSteps(input.sequenceId);
        const now = new Date();
        const nextSendAt = firstSendAt(steps, now);
        if (!nextSendAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add at least one step first" });

        const scope = await resolveRequestScope(ctx.user);
        const ids = Array.from(new Set(input.contactIds));
        const contacts = new Map((await db.getCrmContactsByIds(ids)).map((c) => [c.id, c]));
        const skipped: Array<{ contactId: number; reason: string }> = [];
        const rows: Array<{ companyId: number | null; sequenceId: number; contactId: number; status: "active"; currentStepOrder: number; nextSendAt: Date; enrolledBy: number }> = [];
        for (const id of ids) {
          const c = contacts.get(id);
          if (!c || !scopeAllows(scope, c.companyId)) { skipped.push({ contactId: id, reason: "Contact not found" }); continue; }
          const skip = mailableSkipReason(c);
          if (skip) { skipped.push({ contactId: id, reason: skip.reason }); continue; }
          rows.push({ companyId: c.companyId ?? null, sequenceId: input.sequenceId, contactId: id, status: "active", currentStepOrder: 0, nextSendAt, enrolledBy: ctx.user.id });
        }
        const enrolled = await db.createEmailSequenceEnrollments(rows);
        const enrolledSet = new Set(enrolled);
        for (const r of rows) if (!enrolledSet.has(r.contactId)) skipped.push({ contactId: r.contactId, reason: "Already enrolled" });
        return { enrolled: enrolled.length, enrolledContactIds: enrolled, skipped, nextSendAt };
      }),

    enrollments: internalProcedure
      .input(z.object({ sequenceId: z.number() }))
      .query(async ({ input, ctx }) => {
        await loadOwnSequence(input.sequenceId, ctx.user.id);
        const scope = await resolveRequestScope(ctx.user);
        const rows = await db.getEmailSequenceEnrollments(input.sequenceId);
        return rows.filter((r) => scopeAllows(scope, r.companyId));
      }),

    pause: internalProcedure
      .input(z.object({ enrollmentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const e = await loadOwnEnrollment(input.enrollmentId, ctx.user);
        if (e.status !== "active") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Enrollment is ${e.status}` });
        await db.updateEmailSequenceEnrollment(e.id, { status: "paused" });
        return { ok: true };
      }),

    resume: internalProcedure
      .input(z.object({ enrollmentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const e = await loadOwnEnrollment(input.enrollmentId, ctx.user);
        if (e.status !== "paused") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Enrollment is ${e.status}` });
        // A step that fell due while paused goes out on the next tick.
        await db.updateEmailSequenceEnrollment(e.id, { status: "active", nextSendAt: e.nextSendAt ?? new Date() });
        return { ok: true };
      }),

    // Stops the contact's sequence for good (the row is kept as history, so
    // re-enrolling the same contact is reported as "Already enrolled").
    unenroll: internalProcedure
      .input(z.object({ enrollmentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const e = await loadOwnEnrollment(input.enrollmentId, ctx.user);
        if (e.status === "completed" || e.status === "stopped") return { ok: true };
        await db.updateEmailSequenceEnrollment(e.id, { status: "stopped", stoppedReason: "Unenrolled", nextSendAt: null });
        return { ok: true };
      }),
  });

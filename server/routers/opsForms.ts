// appRouter.opsForms — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { sendEmail } from "../_core/email";
import { fireAutomationEvent } from "../opsAutomationEngine";
import * as db from "../db";
import { nanoid } from "nanoid";
import { internalProcedure } from "./_shared";

export const opsFormsRouter = router({
    list: internalProcedure.query(() => db.listIntakeForms()),
    get: internalProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getIntakeFormById(input.id)),
    create: internalProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        fields: z.any().optional(),
        targetModule: z.string().optional(),
        isPublished: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        submitMessage: z.string().optional(),
        notifyEmails: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const slug = nanoid(10);
        const result = await db.createIntakeForm({ ...input, fields: input.fields ?? [], slug, createdBy: ctx.user.id });
        return { id: result.id, slug };
      }),
    update: internalProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        fields: z.any().optional(),
        targetModule: z.string().optional(),
        isPublished: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        submitMessage: z.string().optional(),
        notifyEmails: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await db.updateIntakeForm(id, rest as any);
        return { success: true };
      }),
    delete: internalProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { await db.deleteIntakeForm(input.id); return { success: true }; }),
    submissions: internalProcedure.input(z.object({ formId: z.number() })).query(({ input }) => db.listIntakeFormSubmissions(input.formId)),
    updateSubmissionStatus: internalProcedure
      .input(z.object({ id: z.number(), status: z.enum(["new", "reviewed", "archived"]) }))
      .mutation(async ({ input }) => { await db.updateIntakeFormSubmissionStatus(input.id, input.status); return { success: true }; }),

    // ---- Public (unauthenticated) endpoints for the shareable form link ----
    getPublic: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const form = await db.getIntakeFormBySlug(input.slug);
        if (!form || !form.isPublished) return null;
        return {
          id: form.id, slug: form.slug, name: form.name, description: form.description,
          fields: form.fields, submitMessage: form.submitMessage, isPublic: form.isPublic,
        };
      }),
    submit: publicProcedure
      .input(z.object({
        slug: z.string(),
        data: z.record(z.string(), z.any()),
        submittedByName: z.string().optional(),
        submittedByEmail: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const form = await db.getIntakeFormBySlug(input.slug);
        if (!form || !form.isPublished) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
        // Anonymous submissions are only allowed when the form is explicitly public.
        if (!ctx.user && !form.isPublic) throw new TRPCError({ code: "FORBIDDEN", message: "This form requires sign-in" });
        const result = await db.createIntakeFormSubmission({
          formId: form.id,
          data: input.data,
          submittedByUserId: ctx.user?.id ?? null,
          submittedByName: input.submittedByName ?? null,
          submittedByEmail: input.submittedByEmail ?? null,
        });
        // Best-effort: email notifications + fire "form_submitted" automations.
        try {
          if (form.notifyEmails) {
            const summary = Object.entries(input.data).map(([k, v]) => `${k}: ${String(v)}`).join("\n");
            for (const to of form.notifyEmails.split(",").map((s) => s.trim()).filter(Boolean)) {
              await sendEmail({ to, subject: `New submission: ${form.name}`, text: summary });
            }
          }
        } catch { /* ignore email errors */ }
        try {
          await fireAutomationEvent({
            module: form.targetModule || "custom",
            triggerType: "form_submitted",
            record: { ...input.data, formId: form.id, __formName: form.name },
          });
        } catch { /* ignore automation errors */ }
        return { id: result.id, submitMessage: form.submitMessage ?? null };
      }),
  });

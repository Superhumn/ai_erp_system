// appRouter.recruiting — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { importCandidateFromLinkedIn, normalizeLinkedInUrl } from "../linkedinCandidateService";
import * as db from "../db";

// ============================================
// RECRUITING
// ============================================
export const recruitingRouter = router({
    // Paste a LinkedIn profile URL and pull structured candidate info to
    // pre-fill the Add Candidate form. Best-effort: LinkedIn frequently walls
    // anonymous fetches, in which case we recover the name and flag the rest.
    importFromLinkedIn: protectedProcedure
      .input(z.object({ url: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const normalized = normalizeLinkedInUrl(input.url);
        if (!normalized) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please enter a valid LinkedIn profile URL, e.g. https://www.linkedin.com/in/username.",
          });
        }
        try {
          return await importCandidateFromLinkedIn(normalized);
        } catch (err) {
          // Log the real error server-side; return a generic message so we
          // don't leak internal/LLM-provider details to the client.
          console.error("recruiting.importFromLinkedIn failed:", err);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not import from LinkedIn right now. Please try again or enter the details manually.",
          });
        }
      }),

    // Server-backed candidate pipeline (persisted so the Ops Toolkit
    // views/reports can operate over recruiting like any other module).
    candidates: router({
      list: protectedProcedure.query(() => db.listRecruitingCandidates()),
      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          email: z.string().optional(),
          phone: z.string().optional(),
          position: z.string().optional(),
          stage: z.enum(["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"]).optional(),
          score: z.number().optional(),
          resume: z.string().optional(),
          notes: z.string().optional(),
          source: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createRecruitingCandidate({ ...input, createdBy: ctx.user.id });
          return { id: result.id };
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          position: z.string().optional(),
          stage: z.enum(["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"]).optional(),
          score: z.number().nullable().optional(),
          resume: z.string().optional(),
          notes: z.string().optional(),
          source: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...rest } = input;
          await db.updateRecruitingCandidate(id, rest as any);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => { await db.deleteRecruitingCandidate(input.id); return { success: true }; }),
    }),
  });

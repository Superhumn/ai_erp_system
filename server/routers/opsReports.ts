// appRouter.opsReports — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { internalProcedure } from "./_shared";

export const opsReportsRouter = router({
    list: internalProcedure.input(z.object({ module: z.string().optional() }).optional()).query(({ input }) => db.listSavedReports(input?.module)),
    create: internalProcedure
      .input(z.object({ module: z.string(), name: z.string().min(1), pivotConfig: z.any() }))
      .mutation(async ({ input, ctx }) => { const result = await db.createSavedReport({ ...input, createdBy: ctx.user.id }); return { id: result.id }; }),
    update: internalProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), pivotConfig: z.any().optional() }))
      .mutation(async ({ input }) => { const { id, ...rest } = input; await db.updateSavedReport(id, rest as any); return { success: true }; }),
    delete: internalProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { await db.deleteSavedReport(input.id); return { success: true }; }),
  });

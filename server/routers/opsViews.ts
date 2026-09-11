// appRouter.opsViews — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { internalProcedure } from "./_shared";

// ============================================
// OPS TOOLKIT (Stackby-style capabilities layered on the ERP)
//   opsViews       — saved grid/kanban/calendar/timeline views per module
//   opsForms       — intake form builder + submissions (+ public endpoints)
//   opsAutomations — lightweight trigger -> condition -> action rules
//   opsReports     — saved pivot/report configurations
// Internal-staff tools (internalProcedure) except the two public form
// endpoints used by the shareable /f/:slug link.
// ============================================
export const opsViewsRouter = router({
    list: internalProcedure
      .input(z.object({ module: z.string().optional() }).optional())
      .query(({ input }) => db.listSavedViews(input?.module)),
    create: internalProcedure
      .input(z.object({
        module: z.string(),
        name: z.string().min(1),
        viewType: z.enum(["grid", "kanban", "calendar", "timeline"]),
        config: z.any().optional(),
        isShared: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createSavedView({ ...input, config: input.config ?? {}, createdBy: ctx.user.id });
        return { id: result.id };
      }),
    update: internalProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        viewType: z.enum(["grid", "kanban", "calendar", "timeline"]).optional(),
        config: z.any().optional(),
        isShared: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        await db.updateSavedView(id, rest as any);
        return { success: true };
      }),
    delete: internalProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await db.deleteSavedView(input.id); return { success: true }; }),
  });

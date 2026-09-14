// appRouter.inventoryManagement — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { definedFields } from "../_core/definedFields";
import { opsProcedure } from "./_shared";

// ============================================
// INVENTORY MANAGEMENT (enriched view)
// ============================================
export const inventoryManagementRouter = router({
    list: opsProcedure.query(() => db.getInventoryManagementList()),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        forecastedQuantity: z.string().optional(),
        poStatus: z.string().optional(),
        freightStatus: z.string().optional(),
        freightTrackingNumber: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const patch = definedFields(data);
        if (!patch) return { success: true };
        return db.updateInventoryManagement(id, patch);
      }),
  });

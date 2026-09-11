// appRouter.inventoryManagement — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
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
        // Filter out undefined values
        const updateData: Record<string, any> = {};
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) updateData[k] = v;
        }
        return db.updateInventoryManagement(id, updateData);
      }),
  });

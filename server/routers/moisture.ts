// appRouter.moisture — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export const moistureRouter = router({
    calculate: protectedProcedure
      .input(z.object({ wetWeight: z.number(), dryWeight: z.number() }))
      .mutation(({ input }) => {
        const moisturePct = input.wetWeight > 0 ? (input.wetWeight - input.dryWeight) / input.wetWeight : 0;
        return { moisturePct, solidsPct: 1 - moisturePct };
      }),
    convert: protectedProcedure
      .input(z.object({
        sourceWeight: z.number(),
        sourceMoisture: z.number(),
        targetMoisture: z.number(),
      }))
      .mutation(({ input }) => {
        const solids = input.sourceWeight * (1 - input.sourceMoisture);
        const targetWeight = solids / (1 - input.targetMoisture);
        const waterDelta = (targetWeight * input.targetMoisture) - (input.sourceWeight * input.sourceMoisture);
        return { targetWeight, solids, waterDelta };
      }),
  });

// appRouter.cashForecast — rolling 13-week cash forecast (finance roles, entity-scoped).
import { z } from "zod";
import { router } from "../_core/trpc";
import { financeProcedure } from "./middleware";
import { resolveRequestScope, assertNonEmptyScope } from "./_shared";
import { getCashForecast } from "../cashForecastService";

const adjustmentSchema = z.object({
  label: z.string().max(200),
  amount: z.number().positive().max(1e12),
  direction: z.enum(["in", "out"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const cashForecastRouter = router({
  get: financeProcedure
    .input(
      z
        .object({
          weeks: z.number().int().min(4).max(26).optional(),
          startingCashOverride: z.number().finite().nullable().optional(),
          adjustments: z.array(adjustmentSchema).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const scope = assertNonEmptyScope(await resolveRequestScope(ctx.user));
      return getCashForecast({
        scope,
        weeks: input?.weeks,
        startingCashOverride: input?.startingCashOverride ?? null,
        adjustments: input?.adjustments ?? [],
      });
    }),
});

// appRouter.quickAdd — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { parseQuickAdd } from "../nlQuickAddService";
import { DEFAULT_PLANNER_TIMEZONE, type QuickAddIntent } from "@shared/planner";
import { commitQuickAdd } from "./_shared";

// ============================================
// PLANNER — universal NL quick-add, auto-scheduling, unified Today agenda
// ============================================
export const quickAddRouter = router({
    // Parse a free-text line into a structured intent (no side effects).
    parse: protectedProcedure
      .input(z.object({ text: z.string().min(1), timezone: z.string().optional() }))
      .mutation(({ input }) => parseQuickAdd(input.text, new Date().toISOString(), input.timezone || DEFAULT_PLANNER_TIMEZONE)),
    // Create the record for a (possibly user-edited) intent.
    commit: protectedProcedure
      .input(z.object({
        intent: z.object({
          kind: z.enum(["task", "event", "reminder", "note"]),
          title: z.string().min(1),
          description: z.string().nullish(),
          datetime: z.string().nullish(),
          endDatetime: z.string().nullish(),
          durationMinutes: z.number().nullish(),
          allDay: z.boolean().optional(),
          priority: z.enum(["low", "medium", "high", "critical"]).nullish(),
          location: z.string().nullish(),
          attendees: z.array(z.string()).optional(),
          recurrence: z.string().nullish(),
        }),
        timezone: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => commitQuickAdd(ctx.user.id, input.intent as QuickAddIntent, input.timezone || DEFAULT_PLANNER_TIMEZONE)),
  });

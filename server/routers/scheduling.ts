// appRouter.scheduling — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { suggestSlots } from "../autoScheduleService";
import { DEFAULT_PLANNER_TIMEZONE } from "@shared/planner";
import * as db from "../db";
import { getValidGoogleToken } from "./_shared";

export const schedulingRouter = router({
    // Suggest open time-blocks of a given length within a window.
    suggest: protectedProcedure
      .input(z.object({
        durationMinutes: z.number().min(5).max(1440),
        windowStartIso: z.string().optional(),
        windowEndIso: z.string().optional(),
        timezone: z.string().optional(),
        maxResults: z.number().min(1).max(12).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tz = input.timezone || DEFAULT_PLANNER_TIMEZONE;
        const nowMs = Date.now();
        const windowStartMs = input.windowStartIso ? Date.parse(input.windowStartIso) : nowMs;
        const windowEndMs = input.windowEndIso ? Date.parse(input.windowEndIso) : nowMs + 7 * 24 * 3600 * 1000;
        const token = await getValidGoogleToken(ctx.user.id);
        const slots = await suggestSlots({
          accessToken: token.error ? null : token.accessToken,
          windowStartMs, windowEndMs, durationMin: input.durationMinutes,
          tz, maxResults: input.maxResults ?? 6, nowMs,
        });
        return { googleConnected: !token.error, slots };
      }),
    // Book a chosen slot as a calendar time-block (falls back to a task).
    book: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        startIso: z.string(),
        endIso: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const token = await getValidGoogleToken(ctx.user.id);
        if (!token.error) {
          const { createCalendarEvent } = await import("../calendarService");
          await createCalendarEvent(token.accessToken, {
            summary: input.title,
            description: input.description,
            start: { dateTime: input.startIso },
            end: { dateTime: input.endIso },
          });
          return { booked: "calendar" as const, detail: "Time blocked on Google Calendar" };
        }
        const projectId = await db.getOrCreateNotesInboxProject(ctx.user.id);
        await db.createProjectTask({
          projectId, name: input.title, dueDate: new Date(input.startIso),
          status: "todo", priority: "medium", sourceType: "manual", createdBy: ctx.user.id,
        });
        return { booked: "task" as const, detail: "Google Calendar not connected — saved as a task" };
      }),
  });

// appRouter.calendar — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getValidGoogleToken } from "./_shared";

// ============================================
// GOOGLE CALENDAR INTEGRATION
// ============================================
export const calendarRouter = router({
    events: protectedProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const token = await getValidGoogleToken(ctx.user.id);
        if (token.error) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google not connected" });
        const { getCalendarEvents } = await import("../calendarService");
        return getCalendarEvents(token.accessToken, input?.startDate, input?.endDate);
      }),

    create: protectedProcedure
      .input(z.object({
        summary: z.string().min(1),
        description: z.string().optional(),
        startDateTime: z.string(),
        endDateTime: z.string(),
        attendees: z.array(z.string()).optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const token = await getValidGoogleToken(ctx.user.id);
        if (token.error) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google not connected" });
        const { createCalendarEvent } = await import("../calendarService");
        return createCalendarEvent(token.accessToken, {
          summary: input.summary,
          description: input.description,
          start: { dateTime: input.startDateTime },
          end: { dateTime: input.endDateTime },
          attendees: input.attendees?.map(email => ({ email })),
          location: input.location,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ eventId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const token = await getValidGoogleToken(ctx.user.id);
        if (token.error) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google not connected" });
        const { deleteCalendarEvent } = await import("../calendarService");
        return deleteCalendarEvent(token.accessToken, input.eventId);
      }),
  });

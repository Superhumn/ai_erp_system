// appRouter.planner — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getValidGoogleToken } from "./_shared";

export const plannerRouter = router({
    // Calendar events for a date range (empty + googleConnected:false when not connected).
    agenda: protectedProcedure
      .input(z.object({ startIso: z.string(), endIso: z.string() }))
      .query(async ({ ctx, input }) => {
        const token = await getValidGoogleToken(ctx.user.id);
        const empty = { googleConnected: false, events: [] as Array<{ id: string; title: string; startIso: string | null; endIso: string | null; allDay: boolean; location: string | null }> };
        if (token.error) return empty;
        try {
          const { getCalendarEvents } = await import("../calendarService");
          const json: any = await getCalendarEvents(token.accessToken, input.startIso, input.endIso, 100);
          const events = (json?.items ?? []).map((ev: any, i: number) => ({
            id: String(ev?.id ?? i),
            title: ev?.summary || "(no title)",
            startIso: ev?.start?.dateTime ?? ev?.start?.date ?? null,
            endIso: ev?.end?.dateTime ?? ev?.end?.date ?? null,
            allDay: !ev?.start?.dateTime,
            location: ev?.location ?? null,
          }));
          return { googleConnected: true, events };
        } catch {
          return { googleConnected: true, events: [] };
        }
      }),
  });

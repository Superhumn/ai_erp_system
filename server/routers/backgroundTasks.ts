// appRouter.backgroundTasks — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// Generic background-task tracking — long-running, user-initiated operations
// (e.g. Data Room ↔ Google Drive sync) that continue running after the user
// navigates away and are surfaced app-wide via the global task tray.
export const backgroundTasksRouter = router({
    // Everything the current user should currently see: in-flight tasks plus
    // anything finished recently that hasn't been dismissed. Polled by the client.
    list: protectedProcedure.query(({ ctx }) =>
      db.listVisibleBackgroundTasks(ctx.user.id),
    ),

    // Cooperative cancel — flags the task; the worker stops at its next checkpoint.
    cancel: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.requestBackgroundTaskCancel(input.id, ctx.user.id);
        return { ok: true };
      }),

    // Hide a finished task from the tray.
    dismiss: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.dismissBackgroundTask(input.id, ctx.user.id);
        return { ok: true };
      }),

    // Clear all finished tasks from the tray at once.
    dismissAllFinished: protectedProcedure.mutation(async ({ ctx }) => {
      await db.dismissFinishedBackgroundTasks(ctx.user.id);
      return { ok: true };
    }),
  });

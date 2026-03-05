import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  createSession,
  executeTask,
  getSession,
  listSessions,
  closeSession,
  pauseSession,
  getSessionScreenshot,
  getAvailablePlatforms,
  addCustomPlatform,
} from "./offlinePlatformAgent";

export const offlinePlatformRouter = router({
  // List available platform profiles
  platforms: protectedProcedure.query(() => {
    return getAvailablePlatforms();
  }),

  // Add a custom platform
  addPlatform: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        description: z.string(),
        category: z.enum(["crm", "ecommerce", "accounting", "social", "email", "hr", "custom"]),
      })
    )
    .mutation(({ input }) => {
      return addCustomPlatform(input);
    }),

  // Create a new browser session for a platform
  createSession: protectedProcedure
    .input(
      z.object({
        platformId: z.string(),
        customUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return createSession(input.platformId, input.customUrl);
    }),

  // Execute a task in a session
  executeTask: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        task: z.string().min(1),
        platformId: z.string(),
        credentials: z
          .object({
            username: z.string(),
            password: z.string(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      return executeTask(input);
    }),

  // Get a session's current state
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      return getSession(input.sessionId);
    }),

  // List all active sessions
  listSessions: protectedProcedure.query(() => {
    return listSessions();
  }),

  // Get a live screenshot of a session
  screenshot: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const screenshot = await getSessionScreenshot(input.sessionId);
      return { screenshot };
    }),

  // Pause a running session
  pauseSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      await pauseSession(input.sessionId);
      return { success: true };
    }),

  // Close and clean up a session
  closeSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      await closeSession(input.sessionId);
      return { success: true };
    }),
});

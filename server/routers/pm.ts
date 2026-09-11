// appRouter.pm — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, opsProcedure, createAuditLog } from "./_shared";

// ============================================
// PROJECT MANAGEMENT MODULE
// Market × Function matrix for international expansion tracking.
// See docs/pm-module.md.
// ============================================
export const pmRouter = router({
    // ---- Matrix & aggregate views ----
    matrix: protectedProcedure
      .input(z.object({
        tier: z.number().optional(),
        status: z.enum(["not_started", "in_progress", "blocked", "complete", "cancelled"]).optional(),
      }).optional())
      .query(({ input }) => db.getPmMatrix(input ?? {})),

    byMarket: protectedProcedure
      .input(
        z
          .object({ id: z.number().optional(), code: z.string().min(1).optional() })
          .refine(({ id, code }) => (id === undefined) !== (code === undefined), {
            message: "Provide exactly one of id or code",
          }),
      )
      .query(async ({ input }) => {
        const market = input.id
          ? await db.getPmMarketById(input.id)
          : input.code
            ? await db.getPmMarketByCode(input.code)
            : undefined;
        if (!market) throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
        const [programs, rawProjects] = await Promise.all([
          db.getPmPrograms(market.id),
          db.getPmProjects({ marketId: market.id }),
        ]);
        const projects = await db.attachPmTaskCounts(rawProjects);
        return { market, programs, projects };
      }),

    byFunction: protectedProcedure
      .input(
        z
          .object({ id: z.number().optional(), code: z.string().min(1).optional() })
          .refine(({ id, code }) => (id === undefined) !== (code === undefined), {
            message: "Provide exactly one of id or code",
          }),
      )
      .query(async ({ input }) => {
        let fn: { id: number; code: string; name: string } | undefined;
        if (input.id) {
          const all = await db.getPmFunctions();
          fn = all.find(f => f.id === input.id);
        } else if (input.code) {
          fn = await db.getPmFunctionByCode(input.code);
        }
        if (!fn) throw new TRPCError({ code: "NOT_FOUND", message: "Function not found" });
        const rawProjects = await db.getPmProjects({ functionId: fn.id });
        const projects = await db.attachPmTaskCounts(rawProjects);
        return { function: fn, projects };
      }),

    cockpit: protectedProcedure.query(async () => {
      const raw = await db.getPmBlockedProjects();
      return db.attachPmTaskCounts(raw);
    }),

    cashForecast: protectedProcedure.query(() => db.getPmCashForecast()),

    owners: protectedProcedure.query(() => db.getPmOwnerCapacity()),

    // ---- Markets CRUD ----
    markets: router({
      list: protectedProcedure.query(() => db.getPmMarkets()),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getPmMarketById(input.id)),
      create: adminProcedure
        .input(z.object({
          name: z.string().min(1),
          code: z.string().min(1).max(8),
          tier: z.number().int().min(1).max(3),
          status: z.enum(["active", "planning", "watchlist", "paused"]).optional(),
          entityType: z.enum(["jv", "owned", "copacker", "distributor"]).optional(),
          partnerName: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createPmMarket(input);
          await createAuditLog(ctx.user.id, "create", "pmMarket", result.id, input.name);
          return result;
        }),
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          tier: z.number().int().min(1).max(3).optional(),
          status: z.enum(["active", "planning", "watchlist", "paused"]).optional(),
          entityType: z.enum(["jv", "owned", "copacker", "distributor"]).optional(),
          partnerName: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updatePmMarket(id, data);
          await createAuditLog(ctx.user.id, "update", "pmMarket", id);
          return { success: true };
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deletePmMarket(input.id);
          await createAuditLog(ctx.user.id, "delete", "pmMarket", input.id);
          return { success: true };
        }),
    }),

    // ---- Functions CRUD ----
    functions: router({
      list: protectedProcedure.query(() => db.getPmFunctions()),
      create: adminProcedure
        .input(z.object({
          name: z.string().min(1),
          code: z.string().min(1).max(16),
          sortOrder: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createPmFunction(input);
          await createAuditLog(ctx.user.id, "create", "pmFunction", result.id, input.name);
          return result;
        }),
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          sortOrder: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updatePmFunction(id, data);
          await createAuditLog(ctx.user.id, "update", "pmFunction", id);
          return { success: true };
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deletePmFunction(input.id);
          await createAuditLog(ctx.user.id, "delete", "pmFunction", input.id);
          return { success: true };
        }),
    }),

    // ---- Programs CRUD ----
    programs: router({
      list: protectedProcedure
        .input(z.object({ marketId: z.number().optional() }).optional())
        .query(({ input }) => db.getPmPrograms(input?.marketId)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getPmProgramById(input.id)),
      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          marketId: z.number(),
          description: z.string().optional(),
          startDate: z.coerce.date().optional(),
          targetEndDate: z.coerce.date().optional(),
          status: z.enum(["not_started", "in_progress", "blocked", "complete", "cancelled"]).optional(),
          ownerUserId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createPmProgram(input);
          await createAuditLog(ctx.user.id, "create", "pmProgram", result.id, input.name);
          return result;
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          startDate: z.coerce.date().optional(),
          targetEndDate: z.coerce.date().optional(),
          actualEndDate: z.coerce.date().optional(),
          status: z.enum(["not_started", "in_progress", "blocked", "complete", "cancelled"]).optional(),
          ownerUserId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updatePmProgram(id, data);
          await createAuditLog(ctx.user.id, "update", "pmProgram", id);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deletePmProgram(input.id);
          return { success: true };
        }),
    }),

    // ---- Projects CRUD ----
    projects: router({
      list: protectedProcedure
        .input(z.object({
          marketId: z.number().optional(),
          functionId: z.number().optional(),
          tier: z.number().optional(),
          status: z.enum(["not_started", "in_progress", "blocked", "complete", "cancelled"]).optional(),
          ownerUserId: z.number().optional(),
          programId: z.number().optional(),
        }).optional())
        .query(async ({ input }) => {
          const raw = await db.getPmProjects(input ?? {});
          return db.attachPmTaskCounts(raw);
        }),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const project = await db.getPmProjectById(input.id);
          if (!project) throw new TRPCError({ code: "NOT_FOUND" });
          const [tasks, milestones, dependencies] = await Promise.all([
            db.getPmTasks(input.id),
            db.getPmMilestones(input.id),
            db.getPmDependenciesForProject(input.id),
          ]);
          return { project, tasks, milestones, dependencies };
        }),
      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          marketId: z.number(),
          functionId: z.number(),
          programId: z.number().optional(),
          description: z.string().optional(),
          startDate: z.coerce.date().optional(),
          targetEndDate: z.coerce.date().optional(),
          status: z.enum(["not_started", "in_progress", "blocked", "complete", "cancelled"]).optional(),
          priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
          ownerUserId: z.number().optional(),
          cashEventAmount: z.string().optional(),
          cashEventType: z.enum(["revenue", "capex", "opex", "funding"]).optional(),
          cashEventDate: z.coerce.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createPmProject(input);
          await createAuditLog(ctx.user.id, "create", "pmProject", result.id, input.name);
          return result;
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          startDate: z.coerce.date().optional(),
          targetEndDate: z.coerce.date().optional(),
          actualEndDate: z.coerce.date().optional(),
          status: z.enum(["not_started", "in_progress", "blocked", "complete", "cancelled"]).optional(),
          priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
          ownerUserId: z.number().optional(),
          cashEventAmount: z.string().optional(),
          cashEventType: z.enum(["revenue", "capex", "opex", "funding"]).optional(),
          cashEventDate: z.coerce.date().optional(),
          blockerReason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const before = await db.getPmProjectById(id);

          // Side-effects on status transitions.
          const next: Record<string, unknown> = { ...data };
          if (data.status === "blocked" && before?.status !== "blocked") {
            next.blockedSince = new Date();
          } else if (data.status && data.status !== "blocked") {
            next.blockedSince = null;
            next.blockerReason = data.blockerReason ?? null;
          }
          if (data.status === "complete" && !data.actualEndDate) {
            next.actualEndDate = new Date();
          }

          await db.updatePmProject(id, next as Partial<typeof data>);
          await createAuditLog(ctx.user.id, "update", "pmProject", id, undefined, before ?? undefined, data);

          // Trigger workflows on status transitions.
          if (data.status === "complete" && before?.status !== "complete") {
            try {
              const { onPmProjectCompleted } = await import("../pmWorkflows");
              await onPmProjectCompleted(id);
            } catch (error) {
              console.error("[pm.projects.update] project completion workflow failed", { projectId: id, error });
            }
          }
          if (data.status === "blocked" && before?.status !== "blocked") {
            try {
              const { onPmProjectBlocked } = await import("../pmWorkflows");
              await onPmProjectBlocked(id);
            } catch (error) {
              console.error("[pm.projects.update] dependency cascade workflow failed", { projectId: id, error });
            }
          }

          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deletePmProject(input.id);
          await createAuditLog(ctx.user.id, "delete", "pmProject", input.id);
          return { success: true };
        }),
    }),

    // ---- Tasks CRUD ----
    tasks: router({
      listByProject: protectedProcedure
        .input(z.object({ projectId: z.number() }))
        .query(({ input }) => db.getPmTasks(input.projectId)),
      create: protectedProcedure
        .input(z.object({
          projectId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
          assigneeUserId: z.number().optional(),
          status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
          dueDate: z.coerce.date().optional(),
          orderIndex: z.number().optional(),
        }))
        .mutation(({ input }) => db.createPmTask(input)),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          assigneeUserId: z.number().optional(),
          status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
          dueDate: z.coerce.date().optional(),
          orderIndex: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          const next: Record<string, unknown> = { ...data };
          if (data.status === "done") next.completedAt = new Date();
          await db.updatePmTask(id, next as Partial<typeof data>);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deletePmTask(input.id);
          return { success: true };
        }),
    }),

    // ---- Dependencies CRUD ----
    dependencies: router({
      listForProject: protectedProcedure
        .input(z.object({ projectId: z.number() }))
        .query(({ input }) => db.getPmDependenciesForProject(input.projectId)),
      create: protectedProcedure
        .input(z.object({
          predecessorProjectId: z.number(),
          successorProjectId: z.number(),
          dependencyType: z.enum(["blocks", "related", "informs"]).optional(),
          notes: z.string().optional(),
        }))
        .mutation(({ input }) => db.createPmDependency(input)),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deletePmDependency(input.id);
          return { success: true };
        }),
    }),

    // ---- Milestones CRUD ----
    milestones: router({
      listByProject: protectedProcedure
        .input(z.object({ projectId: z.number() }))
        .query(({ input }) => db.getPmMilestones(input.projectId)),
      create: protectedProcedure
        .input(z.object({
          projectId: z.number(),
          name: z.string().min(1),
          targetDate: z.coerce.date(),
          description: z.string().optional(),
        }))
        .mutation(({ input }) => db.createPmMilestone(input)),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          targetDate: z.coerce.date().optional(),
          actualDate: z.coerce.date().optional(),
          description: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updatePmMilestone(id, data);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deletePmMilestone(input.id);
          return { success: true };
        }),
    }),

    // ---- Workflow triggers (manual runs for testing or cron-from-outside) ----
    workflows: router({
      blockerAlert: opsProcedure.mutation(async () => {
        const { runBlockerAlertWorkflow } = await import("../pmWorkflows");
        return runBlockerAlertWorkflow();
      }),
      milestoneDue: opsProcedure.mutation(async () => {
        const { runMilestoneDueWorkflow } = await import("../pmWorkflows");
        return runMilestoneDueWorkflow();
      }),
      cashForecastSync: opsProcedure
        .input(z.object({ projectId: z.number() }))
        .mutation(async ({ input }) => {
          const { runCashForecastSyncWorkflow } = await import("../pmWorkflows");
          return runCashForecastSyncWorkflow(input.projectId);
        }),
      weeklyDigest: opsProcedure.mutation(async () => {
        const { runWeeklyDigestWorkflow } = await import("../pmWorkflows");
        return runWeeklyDigestWorkflow();
      }),
    }),
  });

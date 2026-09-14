// appRouter.projects — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { reassignProjectTaskToHuman } from "../taskAgentBridge";
import { createAuditLog, generateNumber } from "./_shared";

// ============================================
// PROJECTS
// ============================================
export const projectsRouter = router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        ownerId: z.number().optional(),
        showArchived: z.boolean().optional(),
      }).optional())
      .query(({ input }) => db.getProjects(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getProjectWithDetails(input.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        description: z.string().optional(),
        type: z.enum(['internal', 'client', 'product', 'research', 'other']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        ownerId: z.number().optional(),
        departmentId: z.number().optional(),
        startDate: z.date().optional(),
        targetEndDate: z.date().optional(),
        budget: z.string().optional(),
        currency: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const projectNumber = generateNumber('PRJ');
        const result = await db.createProject({ ...input, projectNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'project', result.id, input.name);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        ownerId: z.number().optional(),
        targetEndDate: z.date().optional(),
        actualEndDate: z.date().optional(),
        budget: z.string().optional(),
        actualCost: z.string().optional(),
        progress: z.number().optional(),
        notes: z.string().optional(),
        archivedAt: z.date().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProject(id, data);
        await createAuditLog(ctx.user.id, 'update', 'project', id);
        return { success: true };
      }),
    addMilestone: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProjectMilestone(input);
        await createAuditLog(ctx.user.id, 'create', 'projectMilestone', result.id, input.name);
        return result;
      }),
    updateMilestone: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.date().optional(),
        completedDate: z.date().optional(),
        status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProjectMilestone(id, data);
        await createAuditLog(ctx.user.id, 'update', 'projectMilestone', id);
        return { success: true };
      }),
    addTask: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        milestoneId: z.number().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        assigneeId: z.number().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        dueDate: z.date().optional(),
        estimatedHours: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProjectTask({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'projectTask', result.id, input.name);
        return result;
      }),
    updateTask: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        assigneeId: z.number().optional(),
        projectId: z.number().optional(),
        status: z.enum(['todo', 'in_progress', 'review', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        dueDate: z.date().optional(),
        completedDate: z.date().optional(),
        actualHours: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProjectTask(id, data);
        await createAuditLog(ctx.user.id, 'update', 'projectTask', id);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProject(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'project', input.id);
        return { success: true };
      }),
    deleteMany: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProjects(input.ids);
        for (const id of input.ids) {
          await createAuditLog(ctx.user.id, 'delete', 'project', id);
        }
        return { success: true, count: input.ids.length };
      }),
    deleteTask: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProjectTask(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'projectTask', input.id);
        return { success: true };
      }),
    deleteTasks: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProjectTasks(input.ids);
        for (const id of input.ids) {
          await createAuditLog(ctx.user.id, 'delete', 'projectTask', id);
        }
        return { success: true, count: input.ids.length };
      }),
    assignTasks: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        assigneeId: z.number().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const callerCompanyId = (ctx.user as any).companyId as number | undefined;
        // Scope the update to tasks belonging to the caller's company.
        let allowedIds = input.ids;
        if (callerCompanyId) {
          const database = await db.getDb();
          if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          const { projectTasks: pt, projects: proj } = await import("../../drizzle/schema");
          const rows = await database
            .select({ id: pt.id })
            .from(pt)
            .innerJoin(proj, eq(pt.projectId, proj.id))
            .where(and(inArray(pt.id, input.ids), eq(proj.companyId, callerCompanyId)));
          allowedIds = rows.map((r) => r.id);
          if (allowedIds.length !== input.ids.length) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'One or more tasks do not belong to your company' });
          }
        }
        await Promise.all(
          allowedIds.map((id) => reassignProjectTaskToHuman(id, input.assigneeId, ctx.user.id))
        );
        await Promise.all(
          allowedIds.map((id) => createAuditLog(ctx.user.id, 'update', 'projectTask', id))
        );
        return { success: true, count: allowedIds.length };
      }),
    tasks: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => input.projectId === 0 ? db.getAllProjectTasks() : db.getProjectTasks(input.projectId)),
    listAllTasks: protectedProcedure
      .query(() => db.getAllProjectTasks()),
  });

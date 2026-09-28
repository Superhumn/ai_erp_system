// appRouter.projects — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  assignProjectTaskToAgent,
  buildProjectTaskErrand,
  getAgentStatuses,
  getProjectTaskWithProject,
  OPEN_AGENT_STATUSES,
  reassignProjectTaskToHuman,
  reconcileAgentLinkedTasks,
  withAgentStatus,
} from "../taskAgentBridge";
import type { User } from "../../drizzle/schema";
import { createAuditLog, generateNumber, internalProcedure } from "./_shared";

// Bring AI-owned tasks up to date with their agent task (completion write-back,
// owner notification) before a read. A read never fails because of it.
async function reconcileQuietly(projectId?: number) {
  try {
    await reconcileAgentLinkedTasks(projectId != null ? { projectId } : {});
  } catch (err) {
    console.warn("[projects] AI agent reconcile failed:", err);
  }
}

// Load a project task for an AI-assignment write, scoped to the caller's company.
async function loadTaskForAgentWrite(taskId: number, user: User) {
  const found = await getProjectTaskWithProject(taskId);
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
  const projectCompanyId = found.project?.companyId ?? null;
  if (user.companyId != null && projectCompanyId != null && projectCompanyId !== user.companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Task does not belong to your company' });
  }
  return found;
}

async function reloadTaskWithAgentStatus(taskId: number) {
  const found = await getProjectTaskWithProject(taskId);
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
  const [task] = await withAgentStatus([found.task]);
  return task;
}

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
      .query(async ({ input }) => {
        await reconcileQuietly(input.id);
        const project = await db.getProjectWithDetails(input.id);
        if (!project) return project;
        return { ...project, tasks: await withAgentStatus(project.tasks) };
      }),
    // Projects are internal work; external accounts (investor, vendor,
    // copacker, contractor) can read what they are shown but never create,
    // change, assign or delete anything — every write below is internalProcedure.
    create: internalProcedure
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
    update: internalProcedure
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
    addMilestone: internalProcedure
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
    updateMilestone: internalProcedure
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
    addTask: internalProcedure
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
    updateTask: internalProcedure
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
    delete: internalProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProject(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'project', input.id);
        return { success: true };
      }),
    deleteMany: internalProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProjects(input.ids);
        for (const id of input.ids) {
          await createAuditLog(ctx.user.id, 'delete', 'project', id);
        }
        return { success: true, count: input.ids.length };
      }),
    deleteTask: internalProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProjectTask(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'projectTask', input.id);
        return { success: true };
      }),
    deleteTasks: internalProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProjectTasks(input.ids);
        for (const id of input.ids) {
          await createAuditLog(ctx.user.id, 'delete', 'projectTask', id);
        }
        return { success: true, count: input.ids.length };
      }),
    assignTasks: internalProcedure
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
    // Hand a task to the AI agent: creates a concierge_errand aiAgentTasks row
    // that runs under the caller's identity. Only admins may skip the approval
    // queue; everyone else lands in pending_approval (aiAgentService's
    // executeCreateTask gate, tightened to the role that can approve).
    assignTaskToAgent: internalProcedure
      .input(z.object({
        taskId: z.number().int().positive(),
        instructions: z.string().max(4000).optional(),
        requiresApproval: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const { task, project } = await loadTaskForAgentWrite(input.taskId, ctx.user);
        if (task.status === 'completed' || task.status === 'cancelled') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Task is ${task.status}; reopen it before assigning it to the AI agent` });
        }
        if (task.assigneeType === 'ai_agent' && task.assigneeAgentTaskId != null) {
          const current = (await getAgentStatuses([task.assigneeAgentTaskId])).get(task.assigneeAgentTaskId);
          if (current && OPEN_AGENT_STATUSES.includes(current)) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Task is already assigned to the AI agent' });
          }
        }
        const requiresApproval = input.requiresApproval || ctx.user.role !== 'admin';
        const instructions = input.instructions?.trim() || undefined;
        const companyId = project?.companyId ?? ctx.user.companyId ?? null;
        const { agentTaskId, agentStatus } = await assignProjectTaskToAgent({
          projectTaskId: task.id,
          agentTaskType: 'concierge_errand',
          taskData: buildProjectTaskErrand({ task, project, instructions, user: ctx.user, companyId }),
          reasoning: instructions ?? `Assigned to the AI agent by ${ctx.user.name || `user ${ctx.user.id}`}`,
          priority: task.priority === 'critical' ? 'urgent' : task.priority,
          requiresApproval,
          actorUserId: ctx.user.id,
          companyId,
        });
        await createAuditLog(ctx.user.id, 'update', 'projectTask', task.id, task.name, undefined, { assigneeType: 'ai_agent', agentTaskId, agentStatus });
        return { agentTaskId, agentStatus, task: await reloadTaskWithAgentStatus(task.id) };
      }),
    // Take a task back from the AI agent. Cancels the open agent task; the
    // task goes to `userId` if given (null = unassigned), else its previous
    // human assignee.
    unassignFromAgent: internalProcedure
      .input(z.object({
        taskId: z.number().int().positive(),
        userId: z.number().int().positive().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { task } = await loadTaskForAgentWrite(input.taskId, ctx.user);
        if (task.assigneeType !== 'ai_agent') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task is not assigned to the AI agent' });
        }
        const humanId = input.userId !== undefined ? input.userId : task.assigneeId;
        await reassignProjectTaskToHuman(task.id, humanId, ctx.user.id);
        await createAuditLog(ctx.user.id, 'update', 'projectTask', task.id, task.name, undefined, { assigneeType: 'human', assigneeId: humanId });
        return { task: await reloadTaskWithAgentStatus(task.id) };
      }),
    tasks: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        if (input.projectId === 0) {
          await reconcileQuietly();
          return withAgentStatus(await db.getAllProjectTasks());
        }
        await reconcileQuietly(input.projectId);
        return withAgentStatus(await db.getProjectTasks(input.projectId));
      }),
    listAllTasks: protectedProcedure
      .query(async () => {
        await reconcileQuietly();
        return withAgentStatus(await db.getAllProjectTasks());
      }),
  });

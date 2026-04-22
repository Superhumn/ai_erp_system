import { z } from "zod";
import * as db from "../db";
import { router, protectedProcedure, createAuditLog, generateNumber } from "./middleware";

export const projectsRouter = router({
  // ============================================
  // PROJECTS
  // ============================================
  projects: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        ownerId: z.number().optional(),
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
        accountId: z.number().optional(),
        opportunityId: z.number().optional(),
        sourceType: z.enum(['manual', 'email', 'meeting', 'ai_generated', 'crm_deal']).optional(),
        sourceRefType: z.string().optional(),
        sourceRefId: z.number().optional(),
        sourceExternalId: z.string().max(255).optional(),
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
        status: z.enum(['todo', 'in_progress', 'review', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        dueDate: z.date().optional(),
        completedDate: z.date().optional(),
        actualHours: z.string().optional(),
        accountId: z.number().optional(),
        opportunityId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProjectTask(id, data);
        await createAuditLog(ctx.user.id, 'update', 'projectTask', id);
        return { success: true };
      }),
    tasks: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => input.projectId === 0 ? db.getAllProjectTasks() : db.getProjectTasks(input.projectId)),
    listAllTasks: protectedProcedure
      .query(() => db.getAllProjectTasks()),
  }),
  // ============================================
  // SAUDI INVESTMENT GRANT CHECKLIST
  // ============================================
  investmentGrants: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getInvestmentGrantChecklists(input as any)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getInvestmentGrantChecklistWithItems(input.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        description: z.string().optional(),
        totalCapex: z.string().optional(),
        grantPercentage: z.string().optional(),
        estimatedGrant: z.string().optional(),
        currency: z.string().optional(),
        startDate: z.date().optional(),
        targetCompletionDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createInvestmentGrantChecklist({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'investmentGrantChecklist', result.id, input.name);

        // Auto-populate default checklist items
        const defaultItems = [
          { category: "entity_entry_setup" as const, taskName: "MISA foreign investment license", sortOrder: 1, startMonth: 1, durationMonths: 2 },
          { category: "entity_entry_setup" as const, taskName: "Saudi entity incorporation + CR", sortOrder: 2, startMonth: 2, durationMonths: 2 },
          { category: "entity_entry_setup" as const, taskName: "Bank account + ZATCA registration", sortOrder: 3, startMonth: 3, durationMonths: 1 },
          { category: "project_definition" as const, taskName: "Factory scope & product mix defined", sortOrder: 4, startMonth: 2, durationMonths: 2 },
          { category: "project_definition" as const, taskName: "Process flow & capacity design", sortOrder: 5, startMonth: 3, durationMonths: 2 },
          { category: "capex_financials" as const, taskName: "Detailed capex budget (eligible vs non-eligible)", sortOrder: 6, startMonth: 4, durationMonths: 2 },
          { category: "capex_financials" as const, taskName: "5-year financial model", sortOrder: 7, startMonth: 4, durationMonths: 2 },
          { category: "land_infrastructure" as const, taskName: "Industrial land selection (MODON)", sortOrder: 8, startMonth: 3, durationMonths: 3 },
          { category: "land_infrastructure" as const, taskName: "Utilities & cold-chain planning", sortOrder: 9, startMonth: 5, durationMonths: 2 },
          { category: "jobs_localization" as const, taskName: "Headcount & Saudization plan", sortOrder: 10, startMonth: 4, durationMonths: 2 },
          { category: "jobs_localization" as const, taskName: "Training & skills program", sortOrder: 11, startMonth: 5, durationMonths: 3 },
          { category: "incentive_application" as const, taskName: "Grant eligibility confirmation", sortOrder: 12, startMonth: 6, durationMonths: 1 },
          { category: "incentive_application" as const, taskName: "35% grant application submission", sortOrder: 13, startMonth: 7, durationMonths: 1 },
          { category: "incentive_application" as const, taskName: "Grant review & approval", sortOrder: 14, startMonth: 8, durationMonths: 3 },
          { category: "construction_equipment" as const, taskName: "Factory construction", sortOrder: 15, startMonth: 10, durationMonths: 12 },
          { category: "construction_equipment" as const, taskName: "Equipment procurement & install", sortOrder: 16, startMonth: 14, durationMonths: 6 },
          { category: "grant_disbursement" as const, taskName: "Milestone 1 drawdown", sortOrder: 17, startMonth: 16, durationMonths: 1 },
          { category: "grant_disbursement" as const, taskName: "Milestone 2 drawdown", sortOrder: 18, startMonth: 20, durationMonths: 1 },
          { category: "grant_disbursement" as const, taskName: "Final drawdown (production start)", sortOrder: 19, startMonth: 22, durationMonths: 2 },
        ];

        for (const item of defaultItems) {
          await db.createInvestmentGrantItem({ ...item, checklistId: result.id });
        }

        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["not_started", "in_progress", "completed", "on_hold"]).optional(),
        totalCapex: z.string().optional(),
        grantPercentage: z.string().optional(),
        estimatedGrant: z.string().optional(),
        currency: z.string().optional(),
        startDate: z.date().optional(),
        targetCompletionDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateInvestmentGrantChecklist(id, data);
        await createAuditLog(ctx.user.id, 'update', 'investmentGrantChecklist', id);
        return { success: true };
      }),
    addItem: protectedProcedure
      .input(z.object({
        checklistId: z.number(),
        category: z.enum([
          "entity_entry_setup", "project_definition", "capex_financials",
          "land_infrastructure", "jobs_localization", "incentive_application",
          "construction_equipment", "grant_disbursement",
        ]),
        taskName: z.string().min(1),
        description: z.string().optional(),
        assigneeId: z.number().optional(),
        startMonth: z.number().optional(),
        durationMonths: z.number().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createInvestmentGrantItem(input);
        await createAuditLog(ctx.user.id, 'create', 'investmentGrantItem', result.id, input.taskName);
        return result;
      }),
    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        taskName: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional(),
        assigneeId: z.number().optional(),
        startMonth: z.number().optional(),
        durationMonths: z.number().optional(),
        completedDate: z.date().optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateInvestmentGrantItem(id, data);
        await createAuditLog(ctx.user.id, 'update', 'investmentGrantItem', id);
        return { success: true };
      }),
    items: protectedProcedure
      .input(z.object({ checklistId: z.number() }))
      .query(({ input }) => db.getInvestmentGrantItems(input.checklistId)),
  }),
});

/**
 * Flow test — projects (classic projects router + the PM market×function matrix
 * + handing project tasks to the AI agent).
 *
 * Runs the real projects / pm / notifications / aiAgent routers, the real
 * task-agent bridge and the real agent scheduler over one in-memory store. The
 * bridge and scheduler talk to Drizzle directly, so the project / agent /
 * notification tables live in the Drizzle-shaped engine from ./_fakeDrizzle and
 * the db.ts helper mocks read and write the very same rows.
 */
import { describe, it, expect, vi } from "vitest";
import { ctxFor } from "./_harness";

type Row = { id: number } & Record<string, any>;

const { store, fakeDb } = await vi.hoisted(async () => {
  const { table } = await import("./_harness");
  const { createFakeDrizzle } = await import("./_fakeDrizzle");
  const schema = await import("../../drizzle/schema");
  type Row = { id: number } & Record<string, any>;
  const fake = createFakeDrizzle();
  const R = (tbl: object) => fake.store.rows(tbl);
  return {
    fakeDb: fake.fakeDb,
    store: {
      projects: R(schema.projects), milestones: R(schema.projectMilestones), tasks: R(schema.projectTasks), auditLogs: R(schema.auditLogs), notifications: R(schema.notifications),
      agentTasks: R(schema.aiAgentTasks), agentLogs: R(schema.aiAgentLogs),
      pmMarkets: table<Row>(), pmFunctions: table<Row>(), pmProjects: table<Row>(), pmTasks: table<Row>(), pmMilestones: table<Row>(), pmDependencies: table<Row>(),
    },
  };
});

vi.mock("../db", () => {
  const byDesc = (rows: Row[]) => rows.slice().sort((a, b) => b.id - a.id);
  const taskCounts = (projectIds: number[]) => new Map(projectIds.map((id) => {
    const rows = store.pmTasks.filter((t) => t.projectId === id);
    return [id, { done: rows.filter((t) => t.status === "done").length, total: rows.length }] as const;
  }));
  return {
    getDb: vi.fn(async () => fakeDb),
    createAuditLog: vi.fn(async (d: Row) => { store.auditLogs.insert(d); }),
    createNotification: vi.fn(async (d: Row) => store.notifications.insert({ ...d, isRead: false }).id),
    getUserNotifications: vi.fn(async (userId: number) => byDesc(store.notifications.filter((n) => n.userId === userId))),
    getUnreadNotificationCount: vi.fn(async (userId: number) => store.notifications.filter((n) => n.userId === userId && !n.isRead).length),

    // ---- projects (db.ts PROJECTS) ----
    createProject: vi.fn(async (d: Row) => ({ id: store.projects.insert({ status: "planning", progress: 0, archivedAt: null, ...d }).id })),
    getProjects: vi.fn(async (f?: { companyId?: number; status?: string; ownerId?: number; showArchived?: boolean }) =>
      byDesc(store.projects.filter((p) => (!f?.companyId || p.companyId === f.companyId) && (!f?.status || p.status === f.status) && (!f?.ownerId || p.ownerId === f.ownerId) && (f?.showArchived || p.archivedAt == null)))),
    getProjectWithDetails: vi.fn(async (id: number) => {
      const project = store.projects.get(id);
      if (!project) return undefined;
      return { ...project, milestones: store.milestones.filter((m) => m.projectId === id), tasks: byDesc(store.tasks.filter((t) => t.projectId === id)) };
    }),
    updateProject: vi.fn(async (id: number, d: Row) => { store.projects.update(id, d); }),
    createProjectMilestone: vi.fn(async (d: Row) => ({ id: store.milestones.insert({ status: "pending", ...d }).id })),
    updateProjectMilestone: vi.fn(async (id: number, d: Row) => { store.milestones.update(id, d); }),
    createProjectTask: vi.fn(async (d: Row) => ({ id: store.tasks.insert({ status: "todo", assigneeType: "human", assigneeAgentTaskId: null, aiReasoning: null, ...d }).id })),
    updateProjectTask: vi.fn(async (id: number, d: Row) => { store.tasks.update(id, d); }),
    getProjectTasks: vi.fn(async (projectId: number) => byDesc(store.tasks.filter((t) => t.projectId === projectId))),
    getAllProjectTasks: vi.fn(async () => byDesc(store.tasks.all())),

    // ---- AI agent (db.ts AI AGENT SYSTEM) ----
    getAiAgentTaskById: vi.fn(async (id: number) => store.agentTasks.get(id) || null),
    updateAiAgentTask: vi.fn(async (id: number, d: Row) => { store.agentTasks.update(id, d); }),
    createAiAgentLog: vi.fn(async (d: Row) => ({ id: store.agentLogs.insert(d).id, ...d })),

    // ---- PM matrix (db.ts PROJECT MANAGEMENT MODULE) ----
    getPmMarkets: vi.fn(async () => store.pmMarkets.all()),
    getPmMarketById: vi.fn(async (id: number) => store.pmMarkets.get(id)),
    getPmMarketByCode: vi.fn(async (code: string) => store.pmMarkets.find((m) => m.code === code)),
    createPmMarket: vi.fn(async (d: Row) => ({ id: store.pmMarkets.insert({ status: "planning", ...d }).id, ...d })),
    getPmFunctions: vi.fn(async () => store.pmFunctions.all()),
    createPmFunction: vi.fn(async (d: Row) => ({ id: store.pmFunctions.insert(d).id, ...d })),
    getPmPrograms: vi.fn(async () => []),
    getPmProjects: vi.fn(async (f: { marketId?: number; functionId?: number; status?: string } = {}) =>
      byDesc(store.pmProjects.filter((p) => (!f.marketId || p.marketId === f.marketId) && (!f.functionId || p.functionId === f.functionId) && (!f.status || p.status === f.status)))),
    // Snapshot, as MySQL would return it: pm.projects.update compares the row it
    // read BEFORE writing, so a live reference would hide the status transition.
    getPmProjectById: vi.fn(async (id: number) => { const r = store.pmProjects.get(id); return r ? { ...r } : undefined; }),
    createPmProject: vi.fn(async (d: Row) => ({ id: store.pmProjects.insert({ status: "not_started", priority: "p2", blockedSince: null, ...d }).id, ...d })),
    updatePmProject: vi.fn(async (id: number, d: Row) => { store.pmProjects.update(id, d); }),
    attachPmTaskCounts: vi.fn(async (projects: Row[]) => { const c = taskCounts(projects.map((p) => p.id)); return projects.map((p) => ({ ...p, taskCounts: c.get(p.id) ?? { done: 0, total: 0 } })); }),
    getPmTasks: vi.fn(async (projectId: number) => store.pmTasks.filter((t) => t.projectId === projectId)),
    createPmTask: vi.fn(async (d: Row) => ({ id: store.pmTasks.insert({ status: "todo", orderIndex: 0, completedAt: null, ...d }).id, ...d })),
    updatePmTask: vi.fn(async (id: number, d: Row) => { store.pmTasks.update(id, d); }),
    getPmMilestones: vi.fn(async (projectId?: number) => store.pmMilestones.filter((m) => !projectId || m.projectId === projectId)),
    getPmDependenciesForProject: vi.fn(async (projectId: number) => store.pmDependencies.filter((d) => d.predecessorProjectId === projectId || d.successorProjectId === projectId)),
    getPmBlockedProjects: vi.fn(async () => store.pmProjects.filter((p) => p.status === "blocked")),
  };
});
vi.mock("../pmWorkflows", () => ({
  onPmProjectCompleted: vi.fn(async () => undefined),
  onPmProjectBlocked: vi.fn(async () => undefined),
}));
// The errand executor replays the plan through the LLM agent loop; stub the
// agent's run so the flow sees a real completion / failure result.
vi.mock("../conciergeErrandService", () => ({ executeConciergeErrand: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

import * as db from "../db";
import { onPmProjectCompleted, onPmProjectBlocked } from "../pmWorkflows";
import { executeConciergeErrand } from "../conciergeErrandService";
import { executeApprovedTasks } from "../aiAgentScheduler";
import { appRouter } from "../routers";

const admin = appRouter.createCaller(ctxFor("admin", { id: 1, companyId: 1 }));
const ops = appRouter.createCaller(ctxFor("ops", { id: 2, companyId: 1 }));
const investor = appRouter.createCaller(ctxFor("investor", { id: 77, companyId: 1 }));
const vendor = appRouter.createCaller(ctxFor("vendor", { id: 78, companyId: 1 }));
const HUMAN_ASSIGNEE = 2;

describe("projects flow", () => {
  let projectId: number;
  let taskA: number;
  let taskB: number;

  it("1. admin creates a project with a milestone; tasks are added and assigned to a human; statuses move to done and the project reflects completion", async () => {
    const created = await admin.projects.create({
      name: "Launch EU webshop", type: "product", priority: "high", companyId: 1, ownerId: 1,
      startDate: new Date("2026-10-01"), targetEndDate: new Date("2026-12-15"), budget: "25000.00", currency: "EUR",
    });
    projectId = created.id;
    const project = store.projects.get(projectId)!;
    expect(project).toMatchObject({ name: "Launch EU webshop", type: "product", priority: "high", companyId: 1, ownerId: 1, budget: "25000.00", currency: "EUR", createdBy: 1, status: "planning", progress: 0 });
    expect(project.projectNumber).toMatch(/^PRJ-\d{4}-\d{4}$/);
    expect(store.auditLogs.all().at(-1)).toMatchObject({ userId: 1, action: "create", entityType: "project", entityId: projectId, entityName: "Launch EU webshop" });
    expect((await admin.projects.list()).map((p) => p.id)).toEqual([projectId]);
    expect(await admin.projects.list({ status: "active" })).toEqual([]);

    const milestone = await admin.projects.addMilestone({ projectId, name: "Storefront live", dueDate: new Date("2026-11-30") });
    expect(store.milestones.get(milestone.id)).toMatchObject({ projectId, name: "Storefront live", status: "pending" });

    taskA = (await admin.projects.addTask({ projectId, milestoneId: milestone.id, name: "Set up payment provider", assigneeId: HUMAN_ASSIGNEE, priority: "high", dueDate: new Date("2026-10-20"), estimatedHours: "8" })).id;
    taskB = (await admin.projects.addTask({ projectId, name: "Translate product copy", priority: "medium" })).id;
    expect(store.tasks.get(taskA)).toMatchObject({ projectId, milestoneId: milestone.id, name: "Set up payment provider", assigneeId: HUMAN_ASSIGNEE, priority: "high", estimatedHours: "8", status: "todo", createdBy: 1 });
    expect(store.tasks.get(taskB)).toMatchObject({ projectId, name: "Translate product copy", status: "todo" });
    expect(store.tasks.get(taskB)!.assigneeId).toBeUndefined();

    // The second task belongs to a person, who hands it to the AI agent. ops is
    // not an admin, so asking to skip approval is overridden: pending_approval.
    await admin.projects.updateTask({ id: taskB, assigneeId: 3 });
    expect(store.tasks.get(taskB)!.assigneeId).toBe(3);
    const assigned = await ops.projects.assignTaskToAgent({ taskId: taskB, instructions: "Use the brand glossary for DE.", requiresApproval: false });
    expect(assigned.agentStatus).toBe("pending_approval");
    const agentTask = store.agentTasks.get(assigned.agentTaskId)!;
    expect(agentTask).toMatchObject({ taskType: "concierge_errand", status: "pending_approval", requiresApproval: true, companyId: 1, relatedEntityType: "projectTask", relatedEntityId: taskB, priority: "medium" });
    expect(JSON.parse(agentTask.taskData)).toMatchObject({
      title: "Translate product copy", submittedByUserId: 2, userRole: "ops", companyId: 1, projectTaskId: taskB, projectId,
      goal: expect.stringContaining("Use the brand glossary for DE."),
    });
    expect(assigned.task).toMatchObject({ id: taskB, assigneeType: "ai_agent", assigneeAgentTaskId: assigned.agentTaskId, assigneeId: 3, status: "review", agentStatus: "pending_approval" });
    expect((await admin.projects.tasks({ projectId })).find((t) => t.id === taskB)!.agentStatus).toBe("pending_approval");
    // Nothing runs before approval.
    expect(await executeApprovedTasks()).toMatchObject({ executed: 0, failed: 0 });
    expect(executeConciergeErrand).not.toHaveBeenCalled();

    // Admin approves in the approval queue; the project task follows on the next read.
    await admin.aiAgent.tasks.approve({ id: assigned.agentTaskId });
    let listedB = (await admin.projects.tasks({ projectId })).find((t) => t.id === taskB)!;
    expect(listedB).toMatchObject({ status: "in_progress", agentStatus: "approved", assigneeType: "ai_agent" });

    // The scheduler runs the approved errand; the agent finishes it.
    vi.mocked(executeConciergeErrand).mockResolvedValueOnce({ success: true, data: { summary: "Translated all 42 product descriptions into German.", actionsRun: 3 } });
    expect(await executeApprovedTasks()).toMatchObject({ executed: 1, failed: 0 });
    expect(vi.mocked(executeConciergeErrand).mock.calls[0][0]).toMatchObject({ id: assigned.agentTaskId, companyId: 1 });
    expect(store.agentTasks.get(assigned.agentTaskId)!.status).toBe("completed");
    // The scheduler writes the result back immediately: the project task is
    // completed and the owner notified without waiting for a page read.
    expect(store.tasks.get(taskB)!.status).toBe("completed");
    expect(db.createNotification).toHaveBeenCalledTimes(1);

    // Reading the tasks shows the result and does not notify a second time.
    listedB = (await admin.projects.tasks({ projectId })).find((t) => t.id === taskB)!;
    expect(listedB).toMatchObject({ status: "completed", agentStatus: "completed", assigneeType: "ai_agent", aiReasoning: "Translated all 42 product descriptions into German." });
    expect(listedB.completedDate).toBeInstanceOf(Date);
    expect(db.createNotification).toHaveBeenCalledTimes(1);
    const ownerInbox = await admin.notifications.list();
    expect(ownerInbox.filter((n) => n.entityType === "projectTask")).toEqual([
      expect.objectContaining({ userId: 1, type: "success", entityId: taskB, title: "AI agent completed: Translate product copy", message: "Launch EU webshop: Translated all 42 product descriptions into German.", link: "/projects" }),
    ]);
    await admin.projects.listAllTasks();
    expect(db.createNotification).toHaveBeenCalledTimes(1);
    expect(await appRouter.createCaller(ctxFor("user", { id: HUMAN_ASSIGNEE })).notifications.list()).toEqual([]);

    // Work the other task by hand.
    await admin.projects.updateTask({ id: taskA, status: "in_progress" });
    expect(store.tasks.get(taskA)!.status).toBe("in_progress");
    await admin.projects.updateTask({ id: taskA, status: "completed", completedDate: new Date("2026-10-18"), actualHours: "6.5" });
    expect(store.tasks.get(taskA)).toMatchObject({ status: "completed", completedDate: new Date("2026-10-18"), actualHours: "6.5" });
    expect(store.auditLogs.filter((l) => l.entityType === "projectTask" && l.action === "update")).toHaveLength(4);

    const listed = await admin.projects.tasks({ projectId });
    expect(listed.map((t) => [t.id, t.status])).toEqual([[taskB, "completed"], [taskA, "completed"]]);

    await admin.projects.updateMilestone({ id: milestone.id, status: "completed", completedDate: new Date("2026-11-28") });
    // Progress is a stored field the router accepts, not derived from tasks: set it explicitly.
    expect(await admin.projects.update({ id: projectId, status: "completed", progress: 100, actualEndDate: new Date("2026-11-28"), actualCost: "21000.00" })).toEqual({ success: true });

    const detail = (await admin.projects.get({ id: projectId }))!;
    expect(detail).toMatchObject({ id: projectId, status: "completed", progress: 100, actualEndDate: new Date("2026-11-28"), actualCost: "21000.00" });
    expect(detail.milestones).toEqual([expect.objectContaining({ id: milestone.id, status: "completed" })]);
    expect(detail.tasks.every((t: Row) => t.status === "completed")).toBe(true);
    expect(detail.tasks).toHaveLength(2);
    expect((await admin.projects.list({ status: "completed" })).map((p) => p.id)).toEqual([projectId]);
  });

  it("2. role gating: external accounts (investor, vendor) are FORBIDDEN from projects.create; internal ops may create", async () => {
    await expect(investor.projects.create({ name: "Investor project" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Not available for external accounts" });
    await expect(vendor.projects.create({ name: "Vendor project" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.projects.all()).toHaveLength(1);
    expect(db.createProject).toHaveBeenCalledTimes(1);

    const opsProject = await ops.projects.create({ name: "Ops project" });
    expect(store.projects.get(opsProject.id)).toMatchObject({ name: "Ops project", createdBy: 2 });
    // Reads stay open to every signed-in role.
    expect((await investor.projects.list()).map((p) => p.name)).toEqual(["Ops project", "Launch EU webshop"]);
  });

  it("3. PM matrix: admin defines a market and a function; a project with tasks is worked to done and completing it fires the completion workflow", async () => {
    await expect(ops.pm.markets.create({ name: "Germany", code: "DE", tier: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const market = await admin.pm.markets.create({ name: "Germany", code: "DE", tier: 1, entityType: "distributor", partnerName: "Berlin Foods" });
    const fn = await admin.pm.functions.create({ name: "Regulatory", code: "REG", sortOrder: 1 });
    expect(store.pmMarkets.get(market.id)).toMatchObject({ name: "Germany", code: "DE", tier: 1, entityType: "distributor", status: "planning" });
    expect(await ops.pm.markets.list()).toHaveLength(1);

    const project = await ops.pm.projects.create({ name: "DE food labelling", marketId: market.id, functionId: fn.id, priority: "p1", ownerUserId: 2, targetEndDate: new Date("2026-12-01") });
    expect(store.pmProjects.get(project.id)).toMatchObject({ name: "DE food labelling", marketId: market.id, functionId: fn.id, priority: "p1", ownerUserId: 2, status: "not_started" });

    const t1 = await ops.pm.tasks.create({ projectId: project.id, name: "Review LMIV requirements", assigneeUserId: 2, orderIndex: 1 });
    const t2 = await ops.pm.tasks.create({ projectId: project.id, name: "Update labels", assigneeUserId: 3, orderIndex: 2 });
    let listed = await ops.pm.projects.list({ marketId: market.id });
    expect(listed).toHaveLength(1);
    expect(listed[0].taskCounts).toEqual({ done: 0, total: 2 });

    await ops.pm.projects.update({ id: project.id, status: "in_progress" });
    expect(store.pmProjects.get(project.id)).toMatchObject({ status: "in_progress", blockedSince: null, blockerReason: null });

    expect(await ops.pm.tasks.update({ id: t1.id, status: "done" })).toEqual({ success: true });
    expect(store.pmTasks.get(t1.id)!.completedAt).toBeInstanceOf(Date);
    expect(store.pmTasks.get(t2.id)!.completedAt).toBeNull();
    listed = await ops.pm.projects.list({ marketId: market.id });
    expect(listed[0].taskCounts).toEqual({ done: 1, total: 2 });
    await ops.pm.tasks.update({ id: t2.id, status: "done" });

    const byMarket = await ops.pm.byMarket({ code: "DE" });
    expect(byMarket.market.name).toBe("Germany");
    expect(byMarket.projects[0]).toMatchObject({ id: project.id, taskCounts: { done: 2, total: 2 } });

    expect(onPmProjectCompleted).not.toHaveBeenCalled();
    expect(await ops.pm.projects.update({ id: project.id, status: "complete" })).toEqual({ success: true });
    const done = store.pmProjects.get(project.id)!;
    expect(done.status).toBe("complete");
    expect(done.actualEndDate).toBeInstanceOf(Date);
    expect(onPmProjectCompleted).toHaveBeenCalledWith(project.id);
    expect(onPmProjectBlocked).not.toHaveBeenCalled();

    const detail = await ops.pm.projects.get({ id: project.id });
    expect(detail.project.status).toBe("complete");
    expect(detail.tasks.map((t) => t.status)).toEqual(["done", "done"]);
    expect(store.auditLogs.all().at(-1)).toMatchObject({ userId: 2, action: "update", entityType: "pmProject", entityId: project.id });
  });

  it("4. external accounts cannot change, assign or delete project work either — every projects/pm write is FORBIDDEN, reads stay open", async () => {
    vi.clearAllMocks();
    const forbidden = { code: "FORBIDDEN", message: "Not available for external accounts" };
    for (const ext of [investor, vendor]) {
      // classic projects router
      await expect(ext.projects.update({ id: projectId, name: "hijacked" })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.addMilestone({ projectId, name: "Extra" })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.updateMilestone({ id: 1, status: "pending" })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.addTask({ projectId, name: "Extra" })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.updateTask({ id: taskA, status: "cancelled" })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.assignTasks({ ids: [taskA], assigneeId: 77 })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.assignTaskToAgent({ taskId: taskA })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.unassignFromAgent({ taskId: taskB })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.deleteTask({ id: taskA })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.deleteTasks({ ids: [taskA, taskB] })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.delete({ id: projectId })).rejects.toMatchObject(forbidden);
      await expect(ext.projects.deleteMany({ ids: [projectId] })).rejects.toMatchObject(forbidden);
      // PM matrix
      await expect(ext.pm.programs.create({ name: "P", marketId: 1 })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.projects.create({ name: "X", marketId: 1 })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.projects.update({ id: 1, status: "cancelled" })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.projects.delete({ id: 1 })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.tasks.create({ projectId: 1, name: "X" })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.tasks.update({ id: 1, status: "todo" })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.tasks.delete({ id: 1 })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.milestones.create({ projectId: 1, name: "M", targetDate: new Date("2026-12-01") })).rejects.toMatchObject(forbidden);
      await expect(ext.pm.dependencies.create({ predecessorProjectId: 1, successorProjectId: 1 })).rejects.toMatchObject(forbidden);
    }
    // Nothing was written.
    for (const fn of [db.updateProject, db.createProjectMilestone, db.updateProjectMilestone, db.createProjectTask, db.updateProjectTask, db.createPmProject, db.updatePmProject, db.createPmTask, db.updatePmTask, db.createAuditLog]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(store.projects.get(projectId)).toMatchObject({ name: "Launch EU webshop", status: "completed" });
    expect(store.tasks.get(taskA)!.status).toBe("completed");
    expect(store.pmProjects.all()).toHaveLength(1);
    expect(store.pmProjects.get(1)!.status).toBe("complete");
    expect(store.agentTasks.all()).toHaveLength(1);

    // Reads stay open to external accounts; internal roles keep write access.
    expect((await investor.projects.get({ id: projectId }))!.name).toBe("Launch EU webshop");
    expect(await vendor.pm.markets.list()).toHaveLength(1);
    expect(await ops.projects.updateTask({ id: taskB, priority: "low" })).toEqual({ success: true });
    expect(store.tasks.get(taskB)!.priority).toBe("low");
  });

  it("5. an admin may skip approval; when the agent fails the task goes back to its assignee with the agent's notes; a retry can be taken back", async () => {
    vi.clearAllMocks();
    const taskC = (await admin.projects.addTask({ projectId, name: "Book launch photographer", assigneeId: 3, priority: "critical" })).id;
    const run = await admin.projects.assignTaskToAgent({ taskId: taskC, requiresApproval: false });
    expect(run.agentStatus).toBe("approved");
    expect(store.agentTasks.get(run.agentTaskId)).toMatchObject({ status: "approved", requiresApproval: false, priority: "urgent" });
    expect(run.task).toMatchObject({ status: "in_progress", agentStatus: "approved" });
    // Completed and in-flight tasks are refused.
    await expect(admin.projects.assignTaskToAgent({ taskId: taskA })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.projects.assignTaskToAgent({ taskId: taskC })).rejects.toMatchObject({ code: "CONFLICT" });

    vi.mocked(executeConciergeErrand).mockResolvedValueOnce({ success: false, error: "No photographer vendors on file" });
    expect(await executeApprovedTasks()).toMatchObject({ executed: 0, failed: 1 });
    const back = (await ops.projects.tasks({ projectId })).find((t) => t.id === taskC)!;
    expect(back).toMatchObject({
      assigneeType: "human", assigneeId: 3, status: "todo", agentStatus: "failed", assigneeAgentTaskId: run.agentTaskId,
      aiReasoning: "AI agent could not finish: No photographer vendors on file",
    });
    // Owner and assignee both hear about it.
    expect(vi.mocked(db.createNotification).mock.calls.map(([n]) => [n.userId, n.type, n.entityId])).toEqual([[1, "warning", taskC], [3, "warning", taskC]]);

    // Retry through approval, then take it back before anyone approves.
    const retry = await ops.projects.assignTaskToAgent({ taskId: taskC, instructions: "Try the events agency list" });
    expect(retry.agentStatus).toBe("pending_approval");
    const taken = await ops.projects.unassignFromAgent({ taskId: taskC });
    expect(taken.task).toMatchObject({ assigneeType: "human", assigneeId: 3, assigneeAgentTaskId: null, status: "todo", agentStatus: null });
    expect(store.agentTasks.get(retry.agentTaskId)!.status).toBe("cancelled");
    await expect(ops.projects.unassignFromAgent({ taskId: taskC })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.auditLogs.filter((l) => l.entityType === "projectTask" && l.entityId === taskC && l.action === "update")).toHaveLength(3);
  });
});

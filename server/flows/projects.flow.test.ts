/**
 * Flow test — projects (classic projects router + the PM market×function matrix).
 *
 * Runs the real projects / pm / notifications routers over an in-memory store.
 */
import { describe, it, expect, vi } from "vitest";
import { ctxFor } from "./_harness";

type Row = { id: number } & Record<string, any>;

const store = await vi.hoisted(async () => {
  const { table } = await import("./_harness");
  type Row = { id: number } & Record<string, any>;
  return {
    projects: table<Row>(), milestones: table<Row>(), tasks: table<Row>(), auditLogs: table<Row>(), notifications: table<Row>(),
    pmMarkets: table<Row>(), pmFunctions: table<Row>(), pmProjects: table<Row>(), pmTasks: table<Row>(), pmMilestones: table<Row>(), pmDependencies: table<Row>(),
  };
});

vi.mock("../db", () => {
  const byDesc = (rows: Row[]) => rows.slice().sort((a, b) => b.id - a.id);
  const taskCounts = (projectIds: number[]) => new Map(projectIds.map((id) => {
    const rows = store.pmTasks.filter((t) => t.projectId === id);
    return [id, { done: rows.filter((t) => t.status === "done").length, total: rows.length }] as const;
  }));
  return {
    getDb: vi.fn(async () => ({})),
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
    createProjectTask: vi.fn(async (d: Row) => ({ id: store.tasks.insert({ status: "todo", assigneeType: "human", ...d }).id })),
    updateProjectTask: vi.fn(async (id: number, d: Row) => { store.tasks.update(id, d); }),
    getProjectTasks: vi.fn(async (projectId: number) => byDesc(store.tasks.filter((t) => t.projectId === projectId))),
    getAllProjectTasks: vi.fn(async () => byDesc(store.tasks.all())),

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

import * as db from "../db";
import { onPmProjectCompleted, onPmProjectBlocked } from "../pmWorkflows";
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

    // There is no router procedure that hands a task to the AI agent
    // (taskAgentBridge.assignProjectTaskToAgent has no caller), so the second
    // task is assigned to a person as well. Assignment writes no notification
    // row either — both are reported as NOT AVAILABLE.
    await admin.projects.updateTask({ id: taskB, assigneeId: 3 });
    expect(store.tasks.get(taskB)!.assigneeId).toBe(3);
    expect(db.createNotification).not.toHaveBeenCalled();
    expect(await appRouter.createCaller(ctxFor("user", { id: HUMAN_ASSIGNEE })).notifications.list()).toEqual([]);

    // Work the tasks.
    await admin.projects.updateTask({ id: taskA, status: "in_progress" });
    expect(store.tasks.get(taskA)!.status).toBe("in_progress");
    await admin.projects.updateTask({ id: taskA, status: "completed", completedDate: new Date("2026-10-18"), actualHours: "6.5" });
    await admin.projects.updateTask({ id: taskB, status: "completed", completedDate: new Date("2026-10-25") });
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
});

/**
 * projects router — AI agent assignment (assignTaskToAgent / unassignFromAgent)
 * and the agentStatus the task reads carry. The real task-agent bridge runs
 * over the in-memory Drizzle engine; only ../db is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctxFor, type Role } from "../flows/_harness";

type Row = { id: number } & Record<string, any>;

const { store, fakeDb } = await vi.hoisted(async () => {
  const { createFakeDrizzle } = await import("../flows/_fakeDrizzle");
  const schema = await import("../../drizzle/schema");
  const fake = createFakeDrizzle();
  const R = (tbl: object) => fake.store.rows(tbl);
  return {
    fakeDb: fake.fakeDb,
    store: {
      projects: R(schema.projects), tasks: R(schema.projectTasks), agentTasks: R(schema.aiAgentTasks),
      agentLogs: R(schema.aiAgentLogs), auditLogs: R(schema.auditLogs), notifications: R(schema.notifications),
    },
  };
});

vi.mock("../db", () => ({
  getDb: vi.fn(async () => fakeDb),
  createAuditLog: vi.fn(async (d: Row) => { store.auditLogs.insert(d); }),
  createNotification: vi.fn(async (d: Row) => store.notifications.insert({ ...d, isRead: false }).id),
  updateAiAgentTask: vi.fn(async (id: number, d: Row) => { store.agentTasks.update(id, d); }),
  createAiAgentLog: vi.fn(async (d: Row) => ({ id: store.agentLogs.insert(d).id })),
  getProjectTasks: vi.fn(async (projectId: number) => store.tasks.filter((t) => t.projectId === projectId)),
  getAllProjectTasks: vi.fn(async () => store.tasks.all()),
  getProjectWithDetails: vi.fn(async (id: number) => {
    const p = store.projects.get(id);
    return p ? { ...p, milestones: [], tasks: store.tasks.filter((t) => t.projectId === id) } : undefined;
  }),
}));

import * as db from "../db";
import { projectsRouter } from "./projects";

const caller = (role: Role, id = 10, companyId: number | null = 1) => projectsRouter.createCaller(ctxFor(role, { id, companyId, name: `${role} user` }));

let projectId: number;
function seedTask(patch: Row | Record<string, unknown> = {}) {
  return store.tasks.insert({
    projectId, name: "Draft supplier FAQ", description: "For the onboarding pack", status: "todo", priority: "high",
    assigneeType: "human", assigneeId: 5, assigneeAgentTaskId: null, aiReasoning: null, createdBy: 1, ...patch,
  }).id;
}

beforeEach(() => {
  for (const t of Object.values(store)) t.clear();
  vi.clearAllMocks();
  projectId = store.projects.insert({ name: "Supplier onboarding", companyId: 1, ownerId: 7, createdBy: 1 }).id;
});

describe("projects.assignTaskToAgent", () => {
  it("creates a concierge errand for the task, links it back and returns the updated task", async () => {
    const taskId = seedTask();
    const res = await caller("ops").assignTaskToAgent({ taskId, instructions: "  Keep it under a page.  " });

    expect(res.agentStatus).toBe("pending_approval");
    const agent = store.agentTasks.get(res.agentTaskId)!;
    expect(agent).toMatchObject({
      taskType: "concierge_errand", status: "pending_approval", requiresApproval: true, priority: "high",
      companyId: 1, relatedEntityType: "projectTask", relatedEntityId: taskId, aiReasoning: "Keep it under a page.",
    });
    const data = JSON.parse(agent.taskData);
    expect(data).toMatchObject({ title: "Draft supplier FAQ", submittedByUserId: 10, userRole: "ops", companyId: 1, projectTaskId: taskId, projectId, riskLevel: "medium", steps: [] });
    expect(data.goal).toContain('Complete the project task "Draft supplier FAQ" in project "Supplier onboarding".');
    expect(data.goal).toContain("Task description: For the onboarding pack");
    expect(data.goal).toContain("Instructions from ops user: Keep it under a page.");
    expect(res.task).toMatchObject({ id: taskId, assigneeType: "ai_agent", assigneeAgentTaskId: res.agentTaskId, assigneeId: 5, status: "review", agentStatus: "pending_approval" });
    expect(store.auditLogs.all()).toEqual([expect.objectContaining({ userId: 10, action: "update", entityType: "projectTask", entityId: taskId })]);
    expect(store.agentLogs.all()).toEqual([expect.objectContaining({ taskId: res.agentTaskId, action: "task_created" })]);
  });

  it("forces approval for every non-admin role even when requiresApproval=false is sent", async () => {
    for (const role of ["ops", "exec", "finance", "sales", "user"] as const) {
      const taskId = seedTask();
      const res = await caller(role).assignTaskToAgent({ taskId, requiresApproval: false });
      expect(res.agentStatus).toBe("pending_approval");
      expect(store.agentTasks.get(res.agentTaskId)).toMatchObject({ status: "pending_approval", requiresApproval: true });
      expect(store.tasks.get(taskId)!.status).toBe("review");
    }
  });

  it("lets an admin skip approval (explicitly); the default still goes to the queue", async () => {
    const a = seedTask();
    const b = seedTask({ priority: "critical" });
    expect((await caller("admin").assignTaskToAgent({ taskId: a })).agentStatus).toBe("pending_approval");
    const direct = await caller("admin").assignTaskToAgent({ taskId: b, requiresApproval: false });
    expect(direct.agentStatus).toBe("approved");
    expect(store.agentTasks.get(direct.agentTaskId)).toMatchObject({ status: "approved", requiresApproval: false, priority: "urgent" });
    expect(direct.task).toMatchObject({ status: "in_progress", agentStatus: "approved" });
  });

  it("refuses completed and cancelled tasks, unknown tasks, and tasks the agent already holds", async () => {
    const done = seedTask({ status: "completed" });
    const cancelled = seedTask({ status: "cancelled" });
    await expect(caller("admin").assignTaskToAgent({ taskId: done })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("completed") });
    await expect(caller("admin").assignTaskToAgent({ taskId: cancelled })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("admin").assignTaskToAgent({ taskId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const open = seedTask();
    await caller("admin").assignTaskToAgent({ taskId: open });
    await expect(caller("admin").assignTaskToAgent({ taskId: open })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.agentTasks.all()).toHaveLength(1);
  });

  it("validates input", async () => {
    const taskId = seedTask();
    await expect(caller("admin").assignTaskToAgent({ taskId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("admin").assignTaskToAgent({ taskId, instructions: "x".repeat(4001) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.agentTasks.all()).toHaveLength(0);
  });

  it("is FORBIDDEN for external roles and for tasks of another company", async () => {
    const taskId = seedTask();
    for (const role of ["investor", "vendor", "copacker", "contractor"] as const) {
      await expect(caller(role).assignTaskToAgent({ taskId })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Not available for external accounts" });
      await expect(caller(role).unassignFromAgent({ taskId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(caller("admin", 10, 2).assignTaskToAgent({ taskId })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Task does not belong to your company" });
    expect(store.agentTasks.all()).toHaveLength(0);
    expect(db.createAuditLog).not.toHaveBeenCalled();
    expect(store.tasks.get(taskId)).toMatchObject({ assigneeType: "human", status: "todo" });
  });
});

describe("projects.unassignFromAgent", () => {
  it("cancels the open agent task and hands the task back to its previous assignee as todo", async () => {
    const taskId = seedTask();
    const { agentTaskId } = await caller("ops").assignTaskToAgent({ taskId });
    const res = await caller("ops").unassignFromAgent({ taskId });
    expect(res.task).toMatchObject({ assigneeType: "human", assigneeId: 5, assigneeAgentTaskId: null, status: "todo", agentStatus: null });
    expect(store.agentTasks.get(agentTaskId)!.status).toBe("cancelled");
  });

  it("can hand the task to someone else or leave it unassigned", async () => {
    const a = seedTask();
    const b = seedTask();
    await caller("ops").assignTaskToAgent({ taskId: a });
    await caller("ops").assignTaskToAgent({ taskId: b });
    expect((await caller("ops").unassignFromAgent({ taskId: a, userId: 9 })).task.assigneeId).toBe(9);
    expect((await caller("ops").unassignFromAgent({ taskId: b, userId: null })).task.assigneeId).toBeNull();
  });

  it("refuses a task the agent does not hold", async () => {
    const taskId = seedTask();
    await expect(caller("ops").unassignFromAgent({ taskId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("task reads", () => {
  it("attach agentStatus and write agent completion back before listing", async () => {
    const taskId = seedTask();
    const plain = seedTask();
    const { agentTaskId } = await caller("admin").assignTaskToAgent({ taskId, requiresApproval: false });
    store.agentTasks.update(agentTaskId, { status: "completed", executionResult: JSON.stringify({ summary: "FAQ drafted in the shared drive." }) });

    const rows = await caller("investor").tasks({ projectId });
    expect(rows.find((t) => t.id === taskId)).toMatchObject({ status: "completed", agentStatus: "completed", aiReasoning: "FAQ drafted in the shared drive." });
    expect(rows.find((t) => t.id === plain)!.agentStatus).toBeNull();
    expect(store.notifications.all()).toEqual([expect.objectContaining({ userId: 7, type: "success", entityType: "projectTask", entityId: taskId })]);

    expect((await caller("ops").listAllTasks()).find((t) => t.id === taskId)!.agentStatus).toBe("completed");
    expect((await caller("ops").get({ id: projectId }))!.tasks.find((t) => t.id === taskId)!.agentStatus).toBe("completed");
    expect(store.notifications.all()).toHaveLength(1);
  });

  it("never fail when the agent tables cannot be read", async () => {
    seedTask({ assigneeType: "ai_agent", assigneeAgentTaskId: 42 });
    vi.mocked(db.getDb).mockResolvedValue(null as never);
    try {
      const rows = await caller("ops").tasks({ projectId });
      expect(rows).toEqual([expect.objectContaining({ agentStatus: null })]);
    } finally {
      vi.mocked(db.getDb).mockImplementation(async () => fakeDb);
    }
  });
});

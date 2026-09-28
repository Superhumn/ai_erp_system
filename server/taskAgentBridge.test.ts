/**
 * taskAgentBridge — assignment, take-back and the agent → project task
 * write-back (completion, failure, notifications). Runs over the in-memory
 * Drizzle engine; only ./db is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: number } & Record<string, any>;

const { store, fakeDb } = await vi.hoisted(async () => {
  const { createFakeDrizzle } = await import("./flows/_fakeDrizzle");
  const schema = await import("../drizzle/schema");
  const fake = createFakeDrizzle();
  const R = (tbl: object) => fake.store.rows(tbl);
  return {
    fakeDb: fake.fakeDb,
    store: { projects: R(schema.projects), tasks: R(schema.projectTasks), agentTasks: R(schema.aiAgentTasks), agentLogs: R(schema.aiAgentLogs), notifications: R(schema.notifications) },
  };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeDb),
  createNotification: vi.fn(async (d: Row) => store.notifications.insert({ ...d, isRead: false }).id),
  updateAiAgentTask: vi.fn(async (id: number, d: Row) => { store.agentTasks.update(id, d); }),
  createAiAgentLog: vi.fn(async (d: Row) => ({ id: store.agentLogs.insert(d).id })),
}));

import * as db from "./db";
import {
  agentCompletionSummary,
  agentFailureNotes,
  assignProjectTaskToAgent,
  buildProjectTaskErrand,
  reassignProjectTaskToHuman,
  reconcileAgentLinkedTasks,
  syncAgentStatusToProjectTask,
} from "./taskAgentBridge";

let projectId: number;
const seedTask = (patch: Record<string, unknown> = {}) =>
  store.tasks.insert({ projectId, name: "Renew insurance", status: "todo", priority: "medium", assigneeType: "human", assigneeId: 5, assigneeAgentTaskId: null, aiReasoning: null, createdBy: 1, ...patch }).id;
const assign = (projectTaskId: number, requiresApproval = true) =>
  assignProjectTaskToAgent({ projectTaskId, agentTaskType: "concierge_errand", taskData: { goal: "x" }, requiresApproval, companyId: 1, reasoning: "Please handle" });

beforeEach(() => {
  for (const t of Object.values(store)) t.clear();
  vi.clearAllMocks();
  projectId = store.projects.insert({ name: "Admin", companyId: 1, ownerId: 7, createdBy: 1 }).id;
});

describe("assignProjectTaskToAgent", () => {
  it("creates a tenanted agent task and links the project task (review while pending, in_progress when pre-approved)", async () => {
    const a = seedTask();
    const b = seedTask();
    const ra = await assign(a);
    const rb = await assign(b, false);
    expect(ra.agentStatus).toBe("pending_approval");
    expect(store.agentTasks.get(ra.agentTaskId)).toMatchObject({ companyId: 1, status: "pending_approval", relatedEntityType: "projectTask", relatedEntityId: a, requiresApproval: true });
    expect(store.tasks.get(a)).toMatchObject({ assigneeType: "ai_agent", assigneeAgentTaskId: ra.agentTaskId, status: "review", aiReasoning: "Please handle" });
    expect(store.agentTasks.get(rb.agentTaskId)).toMatchObject({ status: "approved", requiresApproval: false });
    expect(store.tasks.get(b)!.status).toBe("in_progress");
  });

  it("cancels a still-open agent task it supersedes so it can never run", async () => {
    const t = seedTask();
    const first = await assign(t);
    // e.g. the first attempt failed back to the human, then was re-queued by an older client
    store.tasks.update(t, { assigneeType: "human" });
    const second = await assign(t);
    expect(store.agentTasks.get(first.agentTaskId)!.status).toBe("cancelled");
    expect(store.agentTasks.get(second.agentTaskId)!.status).toBe("pending_approval");
    expect(store.tasks.get(t)!.assigneeAgentTaskId).toBe(second.agentTaskId);
  });

  it("throws for a missing project task without creating an agent task", async () => {
    await expect(assign(999)).rejects.toThrow("Project task 999 not found");
    expect(store.agentTasks.all()).toHaveLength(0);
  });
});

describe("reassignProjectTaskToHuman", () => {
  it("puts unfinished agent work back to todo (it used to stay in review / in_progress)", async () => {
    const pending = seedTask();
    const running = seedTask();
    await assign(pending);
    const r = await assign(running, false);
    await reassignProjectTaskToHuman(pending, 5, 1);
    await reassignProjectTaskToHuman(running, 9, 1);
    expect(store.tasks.get(pending)).toMatchObject({ assigneeType: "human", assigneeId: 5, assigneeAgentTaskId: null, status: "todo" });
    expect(store.tasks.get(running)).toMatchObject({ assigneeId: 9, status: "todo" });
    expect(store.agentTasks.get(r.agentTaskId)!.status).toBe("cancelled");
  });

  it("keeps a human task's status when it only changes hands", async () => {
    const t = seedTask({ status: "in_progress" });
    await reassignProjectTaskToHuman(t, 9);
    expect(store.tasks.get(t)).toMatchObject({ assigneeId: 9, status: "in_progress" });
  });
});

describe("syncAgentStatusToProjectTask", () => {
  it("mirrors approval / execution as in_progress", async () => {
    const t = seedTask();
    const { agentTaskId } = await assign(t);
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("none");
    store.agentTasks.update(agentTaskId, { status: "approved" });
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("in_progress");
    expect(store.tasks.get(t)!.status).toBe("in_progress");
  });

  it("completes the project task with the agent's summary and notifies the owner exactly once", async () => {
    const t = seedTask();
    const { agentTaskId } = await assign(t, false);
    store.agentTasks.update(agentTaskId, { status: "completed", executionResult: JSON.stringify({ summary: "Renewed with Hiscox, policy #123." }) });
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("completed");
    expect(store.tasks.get(t)).toMatchObject({ status: "completed", assigneeType: "ai_agent", aiReasoning: "Renewed with Hiscox, policy #123." });
    expect(store.tasks.get(t)!.completedDate).toBeInstanceOf(Date);
    expect(store.notifications.all()).toEqual([
      expect.objectContaining({ userId: 7, type: "success", title: "AI agent completed: Renew insurance", message: "Admin: Renewed with Hiscox, policy #123.", entityType: "projectTask", entityId: t, link: "/projects" }),
    ]);
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("none");
    expect(await reconcileAgentLinkedTasks()).toBe(0);
    expect(store.notifications.all()).toHaveLength(1);
  });

  it("falls back to the project creator when the project has no owner", async () => {
    store.projects.update(projectId, { ownerId: null, createdBy: 3 });
    const t = seedTask();
    const { agentTaskId } = await assign(t, false);
    store.agentTasks.update(agentTaskId, { status: "completed", executionResult: "{}" });
    await syncAgentStatusToProjectTask(agentTaskId);
    expect(store.notifications.all()).toEqual([expect.objectContaining({ userId: 3, message: "Admin: The AI agent finished this task." })]);
  });

  it("hands a failed task back to its assignee with the agent's notes and notifies owner + assignee", async () => {
    const t = seedTask();
    const { agentTaskId } = await assign(t, false);
    store.agentTasks.update(agentTaskId, { status: "failed", errorMessage: "Broker portal login failed" });
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("returned");
    expect(store.tasks.get(t)).toMatchObject({ assigneeType: "human", assigneeId: 5, status: "todo", assigneeAgentTaskId: agentTaskId, aiReasoning: "AI agent could not finish: Broker portal login failed" });
    expect(store.notifications.all().map((n) => [n.userId, n.type, n.severity])).toEqual([[7, "warning", "warning"], [5, "warning", "warning"]]);
    expect(store.notifications.all()[0].message).toBe("Admin: AI agent could not finish: Broker portal login failed The task is back with its assignee.");
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("none");
    expect(store.notifications.all()).toHaveLength(2);
  });

  it("treats a rejected approval like a failure (it used to leave the task stuck on the agent)", async () => {
    const t = seedTask();
    const { agentTaskId } = await assign(t);
    store.agentTasks.update(agentTaskId, { status: "rejected", rejectionReason: "Needs broker quote first" });
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("returned");
    expect(store.tasks.get(t)).toMatchObject({ assigneeType: "human", status: "todo", aiReasoning: "AI agent assignment rejected: Needs broker quote first" });
  });

  it("returns a cancelled agent task to the human instead of cancelling the project task", async () => {
    const t = seedTask();
    const { agentTaskId } = await assign(t);
    store.agentTasks.update(agentTaskId, { status: "cancelled" });
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("returned");
    expect(store.tasks.get(t)).toMatchObject({ assigneeType: "human", status: "todo" });
  });

  it("does not touch a task that was reassigned or closed by hand", async () => {
    const reassigned = seedTask();
    const closed = seedTask();
    const r1 = await assign(reassigned);
    const r2 = await assign(closed);
    await reassignProjectTaskToHuman(reassigned, 5);
    store.tasks.update(closed, { status: "completed" });
    store.agentTasks.update(r1.agentTaskId, { status: "completed" });
    store.agentTasks.update(r2.agentTaskId, { status: "failed", errorMessage: "late" });
    expect(await syncAgentStatusToProjectTask(r1.agentTaskId)).toBe("none");
    expect(await syncAgentStatusToProjectTask(r2.agentTaskId)).toBe("none");
    expect(store.tasks.get(closed)).toMatchObject({ status: "completed", assigneeType: "ai_agent" });
    expect(store.notifications.all()).toHaveLength(0);
  });

  it("does not notify when the conditional write matched no row (a concurrent caller got there first)", async () => {
    const t = seedTask();
    const { agentTaskId } = await assign(t, false);
    store.agentTasks.update(agentTaskId, { status: "completed" });
    const racing = { ...fakeDb, update: () => ({ set: () => ({ where: async () => [{ affectedRows: 0 }] }) }) };
    vi.mocked(db.getDb).mockResolvedValueOnce(racing as never);
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("none");
    expect(db.createNotification).not.toHaveBeenCalled();
  });

  it("never fails the write-back when notifying fails", async () => {
    const t = seedTask();
    const { agentTaskId } = await assign(t, false);
    store.agentTasks.update(agentTaskId, { status: "completed" });
    vi.mocked(db.createNotification).mockRejectedValueOnce(new Error("smtp down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await syncAgentStatusToProjectTask(agentTaskId)).toBe("completed");
    expect(store.tasks.get(t)!.status).toBe("completed");
    warn.mockRestore();
  });

  it("ignores agent tasks not linked to a project task", async () => {
    const id = store.agentTasks.insert({ taskType: "generate_po", status: "completed", taskData: "{}", relatedEntityType: "raw_material", relatedEntityId: 1 }).id;
    expect(await syncAgentStatusToProjectTask(id)).toBe("none");
    expect(await syncAgentStatusToProjectTask(12345)).toBe("none");
  });
});

describe("reconcileAgentLinkedTasks", () => {
  it("syncs every AI-held task (optionally one project) and reports how many changed", async () => {
    const other = store.projects.insert({ name: "Other", companyId: 1, ownerId: 8 }).id;
    const a = seedTask();
    const b = seedTask({ projectId: other });
    const ra = await assign(a, false);
    const rb = await assign(b, false);
    store.agentTasks.update(ra.agentTaskId, { status: "completed" });
    store.agentTasks.update(rb.agentTaskId, { status: "completed" });
    expect(await reconcileAgentLinkedTasks({ projectId })).toBe(1);
    expect(store.tasks.get(b)!.status).toBe("in_progress");
    expect(await reconcileAgentLinkedTasks()).toBe(1);
    expect(store.tasks.get(b)!.status).toBe("completed");
    expect(await reconcileAgentLinkedTasks()).toBe(0);
  });
});

describe("pure helpers", () => {
  it("agentCompletionSummary reads { summary } from executionResult", () => {
    expect(agentCompletionSummary({ executionResult: JSON.stringify({ summary: "  done it  " }) })).toBe("done it");
    expect(agentCompletionSummary({ executionResult: JSON.stringify({ poNumber: "PO-1" }) })).toBeNull();
    expect(agentCompletionSummary({ executionResult: "not json" })).toBeNull();
    expect(agentCompletionSummary({ executionResult: null })).toBeNull();
  });

  it("agentFailureNotes describes failed / rejected / cancelled", () => {
    expect(agentFailureNotes({ status: "failed", errorMessage: "boom", rejectionReason: null })).toBe("AI agent could not finish: boom");
    expect(agentFailureNotes({ status: "failed", errorMessage: null, rejectionReason: null })).toBe("AI agent could not finish");
    expect(agentFailureNotes({ status: "rejected", errorMessage: null, rejectionReason: "no" })).toBe("AI agent assignment rejected: no");
    expect(agentFailureNotes({ status: "cancelled", errorMessage: null, rejectionReason: null })).toBe("AI agent assignment was cancelled");
  });

  it("buildProjectTaskErrand produces ConciergeErrandData under the assigner's identity", () => {
    const data = buildProjectTaskErrand({
      task: { id: 4, projectId: 2, name: "Call bank", description: null },
      project: null,
      user: { id: 9, name: null, role: "ops" },
      companyId: null,
    });
    expect(data).toEqual({
      title: "Call bank", goal: 'Complete the project task "Call bank".', steps: [], riskLevel: "medium",
      submittedByUserId: 9, userName: undefined, userRole: "ops", companyId: undefined, projectTaskId: 4, projectId: 2,
    });
  });
});

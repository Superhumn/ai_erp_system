import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getProjects: vi.fn(),
  getProjectById: vi.fn(),
  getProjectWithDetails: vi.fn(),
  createProject: vi.fn(),
  createProjectTask: vi.fn(),
  updateProjectTask: vi.fn(),
  getAllProjectTasks: vi.fn(),
  getAllUsers: vi.fn(),
  createAuditLog: vi.fn(),
}));
vi.mock("../taskAgentBridge", () => ({
  assignProjectTaskToAgent: vi.fn(),
  buildProjectTaskErrand: vi.fn(() => ({ title: "errand" })),
  getProjectTaskWithProject: vi.fn(),
}));

import * as db from "../db";
import * as bridge from "../taskAgentBridge";
import { executeProject, projectTool } from "./projects";
import type { AIAgentContext } from "../aiAgentService";

const m = vi.mocked(db);
const b = vi.mocked(bridge);
const ctx = (userRole: string, companyId: number | undefined = 1): AIAgentContext => ({ userId: 10, userName: "Jade", userRole, companyId });
const run = (params: Record<string, unknown>, c: AIAgentContext) => executeProject("manage_project", params, c);

const project = (patch: Record<string, unknown> = {}) => ({
  id: 1, companyId: 1, projectNumber: "PRJ-1", name: "Supplier onboarding", description: null, type: "internal", status: "active",
  priority: "high", ownerId: 7, progress: 40, startDate: null, targetEndDate: null, archivedAt: null, ...patch,
});
const task = (patch: Record<string, unknown> = {}) => ({
  id: 100, projectId: 1, name: "Draft FAQ", description: null, status: "todo", priority: "medium", assigneeId: 10, assigneeType: "human",
  assigneeAgentTaskId: null, dueDate: null, projectName: "Supplier onboarding", ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.getProjects.mockResolvedValue([project(), project({ id: 2, name: "Q4 launch", status: "planning" })] as never);
  m.getProjectById.mockImplementation(async (id: number) => (id === 1 ? project() : id === 2 ? project({ id: 2, name: "Q4 launch" }) : undefined) as never);
  m.createAuditLog.mockResolvedValue(undefined as never);
  m.getAllUsers.mockResolvedValue([
    { id: 10, name: "Jade", email: "jade@x.co", companyId: 1, isActive: true },
    { id: 11, name: "Sam Ops", email: "sam@x.co", companyId: 1, isActive: true },
    { id: 12, name: "Sam Other", email: "sam@other.co", companyId: 2, isActive: true },
  ] as never);
});

it("declares manage_project", () => {
  const props = projectTool.function.parameters?.properties as Record<string, { enum?: string[] }>;
  expect(props.action.enum).toEqual(["list_projects", "project_status", "create_project", "create_task", "update_task_status", "my_tasks"]);
});

describe("list_projects", () => {
  it("passes the company filter and status through", async () => {
    const res = await run({ action: "list_projects", status: "active" }, ctx("user")) as { total: number; byStatus: Record<string, number> };
    expect(m.getProjects).toHaveBeenCalledWith({ companyId: 1, status: "active" });
    expect(res.total).toBe(2);
    expect(res.byStatus).toEqual({ active: 1, planning: 1 });
  });

  it("refuses investors", async () => {
    await expect(run({ action: "list_projects" }, ctx("investor"))).rejects.toThrow(/Not authorized/);
  });
});

describe("project_status", () => {
  it("resolves by name and rolls up tasks", async () => {
    m.getProjectWithDetails.mockResolvedValue({
      ...project(), milestones: [{ id: 1, name: "Kickoff", status: "completed", dueDate: null }],
      tasks: [task(), task({ id: 101, status: "completed" }), task({ id: 102, assigneeType: "ai_agent", dueDate: new Date("2020-01-01") })],
    } as never);
    const res = await run({ action: "project_status", projectName: "supplier" }, ctx("user")) as { project: { id: number }; tasks: { total: number; overdue: number; assignedToAi: number; byStatus: Record<string, number> } };
    expect(res.project.id).toBe(1);
    expect(res.tasks).toMatchObject({ total: 3, overdue: 1, assignedToAi: 1, byStatus: { todo: 2, completed: 1 } });
  });

  it("hides a project from another company", async () => {
    m.getProjectById.mockResolvedValue(project({ companyId: 2 }) as never);
    await expect(run({ action: "project_status", projectId: 1 }, ctx("user"))).rejects.toThrow(/Project not found/);
  });
});

describe("create_project", () => {
  it("creates with companyId, owner and creator stamped", async () => {
    m.createProject.mockResolvedValue({ id: 9 } as never);
    const res = await run({ action: "create_project", name: "New line", type: "product", priority: "high", dueDate: "2026-12-01" }, ctx("ops")) as { projectId: number; projectNumber: string };
    expect(res.projectId).toBe(9);
    expect(res.projectNumber).toMatch(/^PRJ-\d{4}-\d{4}$/);
    expect(m.createProject.mock.calls[0][0]).toMatchObject({ companyId: 1, name: "New line", type: "product", priority: "high", ownerId: 10, createdBy: 10 });
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "project", entityId: 9, companyId: 1 }));
  });

  it("refuses sales and regular users", async () => {
    await expect(run({ action: "create_project", name: "x" }, ctx("sales"))).rejects.toThrow(/requires one of these roles/);
    await expect(run({ action: "create_project", name: "x" }, ctx("user"))).rejects.toThrow(/Not authorized/);
    expect(m.createProject).not.toHaveBeenCalled();
  });
});

describe("create_task", () => {
  it("assigns to a teammate by email inside the company", async () => {
    m.createProjectTask.mockResolvedValue({ id: 200 } as never);
    const res = await run({ action: "create_task", projectId: 1, name: "Call vendor", assignee: "sam@x.co", priority: "high", dueDate: "2026-10-01" }, ctx("user")) as { taskId: number; assigneeId: number };
    expect(res).toMatchObject({ taskId: 200, assigneeId: 11, assigneeName: "Sam Ops" });
    expect(m.createProjectTask.mock.calls[0][0]).toMatchObject({ projectId: 1, name: "Call vendor", assigneeId: 11, priority: "high", sourceType: "ai_generated", createdBy: 10 });
    expect(b.assignProjectTaskToAgent).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous name and ignores users from other companies", async () => {
    await expect(run({ action: "create_task", projectId: 1, name: "x", assignee: "sam" }, ctx("user"))).resolves.toMatchObject({ assigneeId: 11 });
    m.getAllUsers.mockResolvedValue([
      { id: 11, name: "Sam Ops", email: "sam@x.co", companyId: 1, isActive: true },
      { id: 13, name: "Sam Two", email: "sam2@x.co", companyId: 1, isActive: true },
    ] as never);
    await expect(run({ action: "create_task", projectId: 1, name: "x", assignee: "sam" }, ctx("user"))).rejects.toThrow(/Several teammates match/);
  });

  it("hands an 'ai agent' task to the bridge with approval required", async () => {
    m.createProjectTask.mockResolvedValue({ id: 201 } as never);
    b.getProjectTaskWithProject.mockResolvedValue({ task: task({ id: 201 }), project: project() } as never);
    b.assignProjectTaskToAgent.mockResolvedValue({ agentTaskId: 55, agentStatus: "pending_approval" } as never);
    const res = await run({ action: "create_task", projectName: "Q4 launch", name: "Research packaging vendors", assignee: "AI agent", instructions: "Focus on EU" }, ctx("admin")) as { agentTaskId: number; agentStatus: string };
    expect(res).toMatchObject({ assignee: "ai_agent", agentTaskId: 55, agentStatus: "pending_approval" });
    expect(b.assignProjectTaskToAgent).toHaveBeenCalledWith(expect.objectContaining({ projectTaskId: 201, agentTaskType: "concierge_errand", requiresApproval: true, actorUserId: 10, companyId: 1 }));
    expect(b.buildProjectTaskErrand).toHaveBeenCalledWith(expect.objectContaining({ instructions: "Focus on EU", user: { id: 10, name: "Jade", role: "admin" }, companyId: 1 }));
  });

  it("refuses copackers", async () => {
    await expect(run({ action: "create_task", projectId: 1, name: "x" }, ctx("copacker"))).rejects.toThrow(/Not authorized/);
  });
});

describe("update_task_status", () => {
  it("updates status and stamps completedDate", async () => {
    b.getProjectTaskWithProject.mockResolvedValue({ task: task(), project: project() } as never);
    const res = await run({ action: "update_task_status", taskId: 100, status: "completed" }, ctx("user")) as { status: string };
    expect(res.status).toBe("completed");
    expect(m.updateProjectTask).toHaveBeenCalledWith(100, expect.objectContaining({ status: "completed", completedDate: expect.any(Date) }));
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "projectTask", entityId: 100, companyId: 1 }));
  });

  it("does not touch a task owned by the AI agent", async () => {
    b.getProjectTaskWithProject.mockResolvedValue({ task: task({ assigneeType: "ai_agent", assigneeAgentTaskId: 5 }), project: project() } as never);
    await expect(run({ action: "update_task_status", taskId: 100, status: "in_progress" }, ctx("user"))).rejects.toThrow(/owned by the AI agent/);
    expect(m.updateProjectTask).not.toHaveBeenCalled();
  });

  it("hides tasks of other companies", async () => {
    b.getProjectTaskWithProject.mockResolvedValue({ task: task(), project: project({ companyId: 2 }) } as never);
    await expect(run({ action: "update_task_status", taskId: 100, status: "todo" }, ctx("user"))).rejects.toThrow(/Task not found/);
  });
});

describe("my_tasks", () => {
  it("returns the caller's open tasks in visible projects", async () => {
    m.getAllProjectTasks.mockResolvedValue([
      task(), task({ id: 101, assigneeId: 11 }), task({ id: 102, status: "completed" }), task({ id: 103, projectId: 99, projectName: "Elsewhere" }),
      task({ id: 104, dueDate: new Date("2020-01-01") }),
    ] as never);
    const res = await run({ action: "my_tasks" }, ctx("user")) as { total: number; overdue: number; tasks: Array<{ id: number }> };
    expect(m.getProjects).toHaveBeenCalledWith({ companyId: 1, showArchived: true });
    expect(res.tasks.map((t) => t.id)).toEqual([100, 104]);
    expect(res.overdue).toBe(1);
  });
});

/**
 * manage_project — AI Assistant chat tool for Projects & tasks.
 *
 * Reads and own-task updates: any internal role. create_project: admin / ops /
 * exec. create_task / update_task_status: any internal role (mirrors the
 * projects router's internalProcedure). A task assigned to "ai agent" goes
 * through the same taskAgentBridge path projects.assignTaskToAgent uses and
 * always lands in the approval queue.
 */
import * as db from "../db";
import {
  assignProjectTaskToAgent,
  buildProjectTaskErrand,
  getProjectTaskWithProject,
} from "../taskAgentBridge";
import type { Project } from "../../drizzle/schema";
import {
  type ChatToolModule,
  type ChatToolParams,
  type AIAgentContext,
  OPS_ROLES,
  ChatToolError,
  defineTool,
  requireInternal,
  requireRole,
  companyIdOf,
  inCompany,
  filterByCompany,
  notFound,
  requireNumber,
  requireString,
  optionalNumber,
  optionalString,
  optionalDate,
  countBy,
  includesText,
  makeNumber,
  unknownAction,
} from "./types";

export const PROJECT_ACTIONS = [
  "list_projects",
  "project_status",
  "create_project",
  "create_task",
  "update_task_status",
  "my_tasks",
] as const;

const PROJECT_TYPES = ["internal", "client", "product", "research", "other"] as const;
const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const TASK_STATUSES = ["todo", "in_progress", "review", "completed", "cancelled"] as const;
type Priority = (typeof PRIORITIES)[number];
type TaskStatus = (typeof TASK_STATUSES)[number];

const AI_ASSIGNEE_ALIASES = new Set(["ai", "ai agent", "agent", "the ai", "ai assistant", "assistant", "bot"]);

export const projectTool = defineTool(
  "manage_project",
  "Projects module: list projects, get a project's status (task/milestone rollup), create a project, create a task (assign to a teammate by name/email or to the AI agent, which queues it for approval), update a task's status, or list the caller's own open tasks.",
  PROJECT_ACTIONS,
  {
    projectId: { type: "number", description: "Project ID (project_status, create_task)" },
    projectName: { type: "string", description: "Project name when the ID is unknown (project_status, create_task)" },
    name: { type: "string", description: "Project or task name (create_project, create_task)" },
    description: { type: "string", description: "Description (create_project, create_task)" },
    type: { type: "string", enum: [...PROJECT_TYPES], description: "Project type (create_project)" },
    status: { type: "string", description: "Project status filter (list_projects) / task status (update_task_status, my_tasks)" },
    priority: { type: "string", enum: [...PRIORITIES], description: "Priority (create_project, create_task)" },
    dueDate: { type: "string", description: "ISO due date (create_task) or target end date (create_project)" },
    assignee: { type: "string", description: "Teammate name or email, or 'ai agent' to hand the task to the AI (create_task)" },
    instructions: { type: "string", description: "Extra instructions for the AI agent when assignee is 'ai agent' (create_task)" },
    taskId: { type: "number", description: "Task ID (update_task_status)" },
  },
);

function compactProject(p: Project) {
  return {
    id: p.id,
    projectNumber: p.projectNumber,
    name: p.name,
    status: p.status,
    priority: p.priority,
    type: p.type,
    ownerId: p.ownerId,
    progress: p.progress,
    startDate: p.startDate,
    targetEndDate: p.targetEndDate,
  };
}

async function resolveProject(params: ChatToolParams, ctx: AIAgentContext): Promise<Project> {
  const projectId = optionalNumber(params.projectId);
  if (projectId != null) {
    const p = await db.getProjectById(projectId);
    if (!p || !inCompany(ctx, p.companyId)) return notFound("Project");
    return p;
  }
  const projectName = optionalString(params.projectName);
  if (!projectName) throw new ChatToolError("projectId or projectName is required");
  const rows = filterByCompany(ctx, await db.getProjects({ companyId: companyIdOf(ctx) }));
  const exact = rows.find((p) => p.name.toLowerCase() === projectName.toLowerCase());
  const fuzzy = exact ? [exact] : rows.filter((p) => includesText([p.name, p.projectNumber], projectName));
  if (fuzzy.length === 0) return notFound(`Project "${projectName}"`);
  if (fuzzy.length > 1) {
    throw new ChatToolError(`Several projects match "${projectName}": ${fuzzy.slice(0, 5).map((p) => `${p.name} (#${p.id})`).join(", ")}. Pass projectId.`);
  }
  return fuzzy[0];
}

async function listProjects(params: ChatToolParams, ctx: AIAgentContext) {
  const status = optionalString(params.status);
  if (status && !(PROJECT_STATUSES as readonly string[]).includes(status)) throw new ChatToolError(`Unknown project status: ${status}`);
  const rows = await db.getProjects({ companyId: companyIdOf(ctx), status });
  return { projects: rows.slice(0, 50).map(compactProject), total: rows.length, byStatus: countBy(rows, (p) => p.status) };
}

async function projectStatus(params: ChatToolParams, ctx: AIAgentContext) {
  const project = await resolveProject(params, ctx);
  const details = await db.getProjectWithDetails(project.id);
  if (!details) return notFound("Project");
  const now = Date.now();
  const tasks = details.tasks;
  const open = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  return {
    project: compactProject(project),
    description: project.description,
    tasks: {
      total: tasks.length,
      byStatus: countBy(tasks, (t) => t.status),
      overdue: open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length,
      assignedToAi: tasks.filter((t) => t.assigneeType === "ai_agent").length,
      open: open.slice(0, 20).map((t) => ({ id: t.id, name: t.name, status: t.status, priority: t.priority, assigneeId: t.assigneeId, assigneeType: t.assigneeType, dueDate: t.dueDate })),
    },
    milestones: details.milestones.map((m) => ({ id: m.id, name: m.name, status: m.status, dueDate: m.dueDate })),
  };
}

async function createProject(params: ChatToolParams, ctx: AIAgentContext) {
  requireRole(ctx, OPS_ROLES, "create project");
  const name = requireString(params.name, "name");
  const type = optionalString(params.type) as (typeof PROJECT_TYPES)[number] | undefined;
  if (type && !PROJECT_TYPES.includes(type)) throw new ChatToolError(`Unknown project type: ${type}`);
  const priority = optionalString(params.priority) as Priority | undefined;
  if (priority && !PRIORITIES.includes(priority)) throw new ChatToolError(`Unknown priority: ${priority}`);
  const companyId = companyIdOf(ctx);
  const projectNumber = makeNumber("PRJ");
  const result = await db.createProject({
    companyId,
    projectNumber,
    name,
    description: optionalString(params.description),
    type,
    priority,
    ownerId: ctx.userId,
    targetEndDate: optionalDate(params.dueDate, "dueDate"),
    createdBy: ctx.userId,
  });
  await db.createAuditLog({ companyId, userId: ctx.userId, action: "create", entityType: "project", entityId: result.id, entityName: name, newValues: { via: "ai_chat" } });
  return { created: true, projectId: result.id, projectNumber, name };
}

async function resolveAssignee(assignee: string, ctx: AIAgentContext): Promise<{ ai: true } | { ai: false; userId: number; name: string | null }> {
  const q = assignee.trim().toLowerCase();
  if (AI_ASSIGNEE_ALIASES.has(q)) return { ai: true };
  if (q === "me" || q === "myself") return { ai: false, userId: ctx.userId, name: ctx.userName };
  const users = (await db.getAllUsers()).filter((u) => u.isActive !== false && inCompany(ctx, u.companyId));
  const byEmail = users.find((u) => u.email?.toLowerCase() === q);
  if (byEmail) return { ai: false, userId: byEmail.id, name: byEmail.name };
  const byName = users.filter((u) => u.name?.toLowerCase() === q);
  const candidates = byName.length ? byName : users.filter((u) => includesText([u.name, u.email], q));
  if (candidates.length === 0) throw new ChatToolError(`No teammate matches "${assignee}"`);
  if (candidates.length > 1) {
    throw new ChatToolError(`Several teammates match "${assignee}": ${candidates.slice(0, 5).map((u) => `${u.name ?? "?"} <${u.email ?? "?"}>`).join(", ")}. Use their email.`);
  }
  return { ai: false, userId: candidates[0].id, name: candidates[0].name };
}

async function createTask(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "create task");
  const name = requireString(params.name, "name");
  const project = await resolveProject(params, ctx);
  const priority = optionalString(params.priority) as Priority | undefined;
  if (priority && !PRIORITIES.includes(priority)) throw new ChatToolError(`Unknown priority: ${priority}`);
  const assigneeRaw = optionalString(params.assignee);
  const assignee = assigneeRaw ? await resolveAssignee(assigneeRaw, ctx) : null;
  const human = assignee && assignee.ai === false ? assignee : null;
  const description = optionalString(params.description);
  const companyId = project.companyId ?? companyIdOf(ctx) ?? null;

  const result = await db.createProjectTask({
    projectId: project.id,
    name,
    description,
    priority,
    dueDate: optionalDate(params.dueDate, "dueDate"),
    assigneeId: human ? human.userId : undefined,
    sourceType: "ai_generated",
    aiReasoning: `Created from the AI Assistant chat by ${ctx.userName}`,
    createdBy: ctx.userId,
  });
  await db.createAuditLog({ companyId: companyId ?? undefined, userId: ctx.userId, action: "create", entityType: "projectTask", entityId: result.id, entityName: name, newValues: { projectId: project.id, via: "ai_chat" } });

  if (assignee?.ai) {
    // Same path as projects.assignTaskToAgent. Chat-created errands always
    // require approval, whatever the caller's role.
    const found = await getProjectTaskWithProject(result.id);
    if (!found) return notFound("Task");
    const instructions = optionalString(params.instructions);
    const { agentTaskId, agentStatus } = await assignProjectTaskToAgent({
      projectTaskId: found.task.id,
      agentTaskType: "concierge_errand",
      taskData: buildProjectTaskErrand({ task: found.task, project: found.project, instructions, user: { id: ctx.userId, name: ctx.userName, role: ctx.userRole }, companyId }),
      reasoning: instructions ?? `Assigned to the AI agent by ${ctx.userName}`,
      priority: priority === "critical" ? "urgent" : priority,
      requiresApproval: true,
      actorUserId: ctx.userId,
      companyId,
    });
    return { created: true, taskId: result.id, projectId: project.id, projectName: project.name, name, assignee: "ai_agent", agentTaskId, agentStatus, message: "Task created and handed to the AI agent; it is waiting in the approval queue." };
  }

  return { created: true, taskId: result.id, projectId: project.id, projectName: project.name, name, assigneeId: human ? human.userId : null, assigneeName: human ? human.name : null };
}

async function updateTaskStatus(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "update task");
  const taskId = requireNumber(params.taskId, "taskId");
  const status = requireString(params.status, "status") as TaskStatus;
  if (!TASK_STATUSES.includes(status)) throw new ChatToolError(`Unknown task status: ${status}`);
  const found = await getProjectTaskWithProject(taskId);
  if (!found || !inCompany(ctx, found.project?.companyId ?? companyIdOf(ctx) ?? null)) return notFound("Task");
  if (found.task.assigneeType === "ai_agent" && found.task.assigneeAgentTaskId != null && status !== "cancelled") {
    throw new ChatToolError("This task is owned by the AI agent; its status follows the agent task. Use the Projects page to take it back first.");
  }
  await db.updateProjectTask(taskId, { status, completedDate: status === "completed" ? new Date() : undefined });
  await db.createAuditLog({ companyId: found.project?.companyId ?? companyIdOf(ctx), userId: ctx.userId, action: "update", entityType: "projectTask", entityId: taskId, entityName: found.task.name, oldValues: { status: found.task.status }, newValues: { status, via: "ai_chat" } });
  return { updated: true, taskId, name: found.task.name, status };
}

async function myTasks(params: ChatToolParams, ctx: AIAgentContext) {
  const status = optionalString(params.status) as TaskStatus | undefined;
  if (status && !TASK_STATUSES.includes(status)) throw new ChatToolError(`Unknown task status: ${status}`);
  const [tasks, projects] = await Promise.all([
    db.getAllProjectTasks(),
    db.getProjects({ companyId: companyIdOf(ctx), showArchived: true }),
  ]);
  const visibleProjects = new Set(projects.map((p) => p.id));
  const now = Date.now();
  const mine = tasks.filter((t) =>
    t.assigneeId === ctx.userId
    && t.assigneeType !== "ai_agent"
    && (ctx.companyId == null || visibleProjects.has(t.projectId))
    && (status ? t.status === status : t.status !== "completed" && t.status !== "cancelled"),
  );
  return {
    total: mine.length,
    overdue: mine.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length,
    tasks: mine.slice(0, 50).map((t) => ({ id: t.id, name: t.name, status: t.status, priority: t.priority, dueDate: t.dueDate, projectId: t.projectId, projectName: t.projectName })),
  };
}

export async function executeProject(name: string, params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  if (name !== "manage_project") throw new ChatToolError(`Unknown tool: ${name}`);
  requireInternal(ctx, "use project tools");
  switch (params.action) {
    case "list_projects": return listProjects(params, ctx);
    case "project_status": return projectStatus(params, ctx);
    case "create_project": return createProject(params, ctx);
    case "create_task": return createTask(params, ctx);
    case "update_task_status": return updateTaskStatus(params, ctx);
    case "my_tasks": return myTasks(params, ctx);
    default: return unknownAction("manage_project", params.action);
  }
}

export const projectModule: ChatToolModule = {
  name: "projects",
  tools: [projectTool],
  execute: executeProject,
};

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import {
  projectTasks,
  projects,
  aiAgentTasks,
  type AiAgentTask,
  type InsertAiAgentTask,
  type ProjectTask,
} from "../drizzle/schema";
// The pooled connection from db.ts, like every other live caller. The bare
// db/connection.ts handle is unpooled (dead sockets after an idle proxy close)
// and throws instead of returning null when DATABASE_URL is unset.
import { getDb, updateAiAgentTask, createAiAgentLog, createNotification } from "./db";

type AgentTaskType = InsertAiAgentTask["taskType"];
type AgentPriority = InsertAiAgentTask["priority"];
export type AgentTaskStatus = AiAgentTask["status"];
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Agent statuses that still mean "the agent owns this work". */
export const OPEN_AGENT_STATUSES: readonly AgentTaskStatus[] = ["pending_approval", "approved", "in_progress"];
const isOpenAgentStatus = (s: AgentTaskStatus) => OPEN_AGENT_STATUSES.includes(s);

export type AssignToAgentInput = {
  projectTaskId: number;
  agentTaskType: AgentTaskType;
  taskData: Record<string, unknown>;
  reasoning?: string;
  confidence?: number;
  priority?: AgentPriority;
  requiresApproval?: boolean;
  actorUserId?: number;
  /** Tenancy for the aiAgentTasks row (the errand executor trusts only this column). */
  companyId?: number | null;
};

/**
 * Assign a project task to an AI agent. Creates an aiAgentTasks row in
 * pending_approval (or approved if requiresApproval=false) and links it back
 * to the project task. The Projects UI keeps showing a single task; the
 * approval queue shows the same work item from the agent side.
 *
 * A still-open agent task from an earlier assignment is cancelled first, so a
 * superseded errand can never be approved and run later.
 */
export async function assignProjectTaskToAgent(input: AssignToAgentInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const requiresApproval = input.requiresApproval !== false;
  const agentStatus: AgentTaskStatus = requiresApproval ? "pending_approval" : "approved";
  const projectStatus = requiresApproval ? "review" : "in_progress";
  const confidence = input.confidence != null ? input.confidence.toFixed(2) : undefined;

  const [current] = await db
    .select({ assigneeAgentTaskId: projectTasks.assigneeAgentTaskId })
    .from(projectTasks)
    .where(eq(projectTasks.id, input.projectTaskId))
    .limit(1);
  if (!current) throw new Error(`Project task ${input.projectTaskId} not found`);
  if (current.assigneeAgentTaskId) {
    await cancelAgentTaskIfOpen(db, current.assigneeAgentTaskId, `Superseded by a new AI assignment of project task #${input.projectTaskId}`);
  }

  const { agentTaskId } = await db.transaction(async (tx) => {
    const agentResult = await tx.insert(aiAgentTasks).values({
      companyId: input.companyId ?? null,
      taskType: input.agentTaskType,
      priority: input.priority ?? "medium",
      status: agentStatus,
      taskData: JSON.stringify(input.taskData),
      aiReasoning: input.reasoning ?? "Assigned from project task",
      aiConfidence: confidence,
      relatedEntityType: "projectTask",
      relatedEntityId: input.projectTaskId,
      requiresApproval,
    });

    const newAgentTaskId = agentResult[0].insertId;

    await tx.update(projectTasks).set({
      assigneeType: "ai_agent",
      assigneeAgentTaskId: newAgentTaskId,
      aiReasoning: input.reasoning,
      aiConfidence: confidence,
      status: projectStatus,
      completedDate: null,
    }).where(eq(projectTasks.id, input.projectTaskId));

    return { agentTaskId: newAgentTaskId };
  });

  await createAiAgentLog({
    taskId: agentTaskId,
    action: "task_created",
    status: "info",
    message: `Project task #${input.projectTaskId} assigned to AI agent`,
    details: JSON.stringify({ projectTaskId: input.projectTaskId, actorUserId: input.actorUserId, requiresApproval }),
  });

  return { agentTaskId, agentStatus };
}

async function cancelAgentTaskIfOpen(db: Db, agentTaskId: number, message: string): Promise<boolean> {
  const [agentTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, agentTaskId)).limit(1);
  if (!agentTask || !isOpenAgentStatus(agentTask.status)) return false;
  await updateAiAgentTask(agentTask.id, { status: "cancelled" });
  await createAiAgentLog({ taskId: agentTask.id, action: "task_cancelled", status: "info", message });
  return true;
}

/**
 * Move execution back to a human. Cancels the linked aiAgentTasks row if it
 * is still pending or in-flight, then clears the AI linkage on the project
 * task. Work the agent had not finished goes back to "todo" — leaving it in
 * "review"/"in_progress" would show a human as mid-way through work they never
 * started.
 */
export async function reassignProjectTaskToHuman(projectTaskId: number, humanUserId: number | null, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, projectTaskId)).limit(1);
  if (!task) throw new Error(`Project task ${projectTaskId} not found`);

  if (task.assigneeAgentTaskId) {
    await cancelAgentTaskIfOpen(db, task.assigneeAgentTaskId, `Reassigned to human${actorUserId ? ` by user ${actorUserId}` : ""}`);
  }

  const takenBackFromAgent = task.assigneeType === "ai_agent";
  const status = takenBackFromAgent && (task.status === "review" || task.status === "in_progress") ? "todo" : task.status;

  await db.update(projectTasks).set({
    assigneeType: "human",
    assigneeId: humanUserId ?? null,
    assigneeAgentTaskId: null,
    status,
  }).where(eq(projectTasks.id, projectTaskId));
}

/** What a write-back did to the project task. */
export type AgentWriteBack = "none" | "review" | "in_progress" | "completed" | "returned";

/**
 * Mirror an aiAgentTasks status change back onto its linked project task.
 *
 * - pending_approval → "review"; approved / in_progress → "in_progress".
 * - completed → the project task is completed, the agent's summary is kept in
 *   aiReasoning, and the project owner is notified.
 * - failed / rejected / cancelled → the task goes back to its human assignee
 *   as "todo" with the agent's notes in aiReasoning; owner and assignee are
 *   notified. assigneeAgentTaskId is kept so the UI can show what happened.
 *
 * Idempotent: it only acts while the project task is still owned by this agent
 * task and not completed/cancelled, and the terminal writes are conditional on
 * exactly that, so concurrent callers cannot notify twice.
 */
export async function syncAgentStatusToProjectTask(agentTaskId: number): Promise<AgentWriteBack> {
  const db = await getDb();
  if (!db) return "none";

  const [agentTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, agentTaskId)).limit(1);
  if (!agentTask || agentTask.relatedEntityType !== "projectTask" || !agentTask.relatedEntityId) return "none";

  const [projectTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, agentTask.relatedEntityId)).limit(1);
  if (!projectTask) return "none";
  return applyAgentStatus(db, projectTask, agentTask);
}

/**
 * Bring every AI-owned project task (optionally of one project) in line with
 * its agent task. The agent scheduler and the approval queue do not call the
 * bridge, so the projects read procedures run this before listing tasks.
 * Returns how many project tasks changed.
 */
export async function reconcileAgentLinkedTasks(opts: { projectId?: number } = {}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const conds = [eq(projectTasks.assigneeType, "ai_agent"), isNotNull(projectTasks.assigneeAgentTaskId)];
  if (opts.projectId != null) conds.push(eq(projectTasks.projectId, opts.projectId));
  const linked = await db.select().from(projectTasks).where(and(...conds));
  const agentIds = linked.map((t) => t.assigneeAgentTaskId).filter((id): id is number => id != null);
  if (agentIds.length === 0) return 0;

  const agentRows = await db.select().from(aiAgentTasks).where(inArray(aiAgentTasks.id, agentIds));
  const byId = new Map(agentRows.map((a) => [a.id, a]));
  let changed = 0;
  for (const task of linked) {
    const agentTask = task.assigneeAgentTaskId != null ? byId.get(task.assigneeAgentTaskId) : undefined;
    if (!agentTask) continue;
    if ((await applyAgentStatus(db, task, agentTask)) !== "none") changed++;
  }
  return changed;
}

async function applyAgentStatus(db: Db, projectTask: ProjectTask, agentTask: AiAgentTask): Promise<AgentWriteBack> {
  if (projectTask.assigneeType !== "ai_agent" || projectTask.assigneeAgentTaskId !== agentTask.id) return "none";
  // A person closed the task by hand while the agent held it; don't reopen it.
  if (projectTask.status === "completed" || projectTask.status === "cancelled") return "none";

  const stillOwned = and(
    eq(projectTasks.id, projectTask.id),
    eq(projectTasks.assigneeType, "ai_agent"),
    eq(projectTasks.assigneeAgentTaskId, agentTask.id),
    ne(projectTasks.status, "completed"),
    ne(projectTasks.status, "cancelled"),
  );

  switch (agentTask.status) {
    case "pending_approval":
    case "approved":
    case "in_progress": {
      const next = agentTask.status === "pending_approval" ? "review" : "in_progress";
      if (projectTask.status === next) return "none";
      await db.update(projectTasks).set({ status: next }).where(stillOwned);
      return next;
    }
    case "completed": {
      const summary = agentCompletionSummary(agentTask);
      const res = await db.update(projectTasks).set({
        status: "completed",
        completedDate: new Date(),
        aiReasoning: summary ?? projectTask.aiReasoning,
      }).where(stillOwned);
      if (!wroteRow(res)) return "none";
      await notifyProjectPeople(db, projectTask, agentTask, "completed", summary);
      return "completed";
    }
    case "failed":
    case "rejected":
    case "cancelled": {
      const notes = agentFailureNotes(agentTask);
      const res = await db.update(projectTasks).set({
        assigneeType: "human",
        status: "todo",
        aiReasoning: notes,
      }).where(stillOwned);
      if (!wroteRow(res)) return "none";
      await notifyProjectPeople(db, projectTask, agentTask, "returned", notes);
      return "returned";
    }
  }
  return "none";
}

function wroteRow(res: unknown): boolean {
  const header = Array.isArray(res) ? res[0] : undefined;
  if (header && typeof header === "object" && "affectedRows" in header && typeof header.affectedRows === "number") {
    return header.affectedRows > 0;
  }
  return true;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The agent's own summary from executionResult ({ summary } for errands), if any. */
export function agentCompletionSummary(agentTask: Pick<AiAgentTask, "executionResult">): string | null {
  if (!agentTask.executionResult) return null;
  try {
    const parsed: unknown = JSON.parse(agentTask.executionResult);
    if (parsed && typeof parsed === "object" && "summary" in parsed && typeof parsed.summary === "string" && parsed.summary.trim()) {
      return clip(parsed.summary.trim(), 4000);
    }
  } catch {
    // not JSON — no summary
  }
  return null;
}

/** Human-readable notes for a failed / rejected / cancelled agent task. */
export function agentFailureNotes(agentTask: Pick<AiAgentTask, "status" | "errorMessage" | "rejectionReason">): string {
  switch (agentTask.status) {
    case "rejected":
      return `AI agent assignment rejected${agentTask.rejectionReason ? `: ${clip(agentTask.rejectionReason, 2000)}` : ""}`;
    case "cancelled":
      return "AI agent assignment was cancelled";
    default:
      return `AI agent could not finish${agentTask.errorMessage ? `: ${clip(agentTask.errorMessage, 2000)}` : ""}`;
  }
}

async function notifyProjectPeople(
  db: Db,
  projectTask: ProjectTask,
  agentTask: AiAgentTask,
  outcome: "completed" | "returned",
  notes: string | null,
): Promise<void> {
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectTask.projectId)).limit(1);
    const owner = project?.ownerId ?? project?.createdBy ?? projectTask.createdBy ?? null;
    const recipients = new Set<number>();
    if (owner != null) recipients.add(owner);
    if (outcome === "returned" && projectTask.assigneeId != null) recipients.add(projectTask.assigneeId);
    const where = project ? `${project.name}: ` : "";
    for (const userId of Array.from(recipients)) {
      await createNotification({
        userId,
        type: outcome === "completed" ? "success" : "warning",
        severity: outcome === "completed" ? "info" : "warning",
        title: clip(outcome === "completed" ? `AI agent completed: ${projectTask.name}` : `AI agent handed back: ${projectTask.name}`, 255),
        message: clip(
          outcome === "completed"
            ? `${where}${notes ?? "The AI agent finished this task."}`
            : `${where}${notes ?? "The AI agent could not finish this task."} The task is back with ${projectTask.assigneeId != null ? "its assignee" : "the project team"}.`,
          2000,
        ),
        entityType: "projectTask",
        entityId: projectTask.id,
        link: "/projects",
        metadata: { projectId: projectTask.projectId, agentTaskId: agentTask.id, agentStatus: agentTask.status },
      });
    }
  } catch (err) {
    console.warn(`[taskAgentBridge] Could not notify for project task ${projectTask.id}:`, err);
  }
}

/** Current agent status for each linked agent task id. */
export async function getAgentStatuses(agentTaskIds: number[]): Promise<Map<number, AgentTaskStatus>> {
  const ids = Array.from(new Set(agentTaskIds));
  const out = new Map<number, AgentTaskStatus>();
  if (ids.length === 0) return out;
  const db = await getDb();
  if (!db) return out;
  const rows = await db.select({ id: aiAgentTasks.id, status: aiAgentTasks.status }).from(aiAgentTasks).where(inArray(aiAgentTasks.id, ids));
  for (const r of rows) out.set(r.id, r.status);
  return out;
}

/**
 * Attach `agentStatus` (the linked aiAgentTasks status, or null) to project
 * task rows for the Projects UI badge. Never fails a read.
 */
export async function withAgentStatus<T extends { assigneeAgentTaskId: number | null }>(
  tasks: T[],
): Promise<Array<T & { agentStatus: AgentTaskStatus | null }>> {
  let statuses = new Map<number, AgentTaskStatus>();
  try {
    statuses = await getAgentStatuses(tasks.map((t) => t.assigneeAgentTaskId).filter((id): id is number => id != null));
  } catch (err) {
    console.warn("[taskAgentBridge] Could not load agent statuses:", err);
  }
  return tasks.map((t) => ({
    ...t,
    agentStatus: t.assigneeAgentTaskId != null ? statuses.get(t.assigneeAgentTaskId) ?? null : null,
  }));
}

/** A project task with its project (null if the project row is gone). */
export async function getProjectTaskWithProject(projectTaskId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, projectTaskId)).limit(1);
  if (!task) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, task.projectId)).limit(1);
  return { task, project: project ?? null };
}

export type ProjectTaskErrandInput = {
  task: Pick<ProjectTask, "id" | "projectId" | "name" | "description">;
  project: { name: string } | null;
  instructions?: string;
  user: { id: number; name: string | null; role: string };
  companyId: number | null;
};

/**
 * taskData for a concierge_errand that carries out a project task. Shape
 * matches ConciergeErrandData (conciergeErrandService), which executes it
 * under the assigning user's identity once approved.
 */
export function buildProjectTaskErrand(input: ProjectTaskErrandInput) {
  const { task, project, instructions, user } = input;
  const lines = [`Complete the project task "${task.name}"${project ? ` in project "${project.name}"` : ""}.`];
  if (task.description?.trim()) lines.push(`Task description: ${task.description.trim()}`);
  if (instructions?.trim()) lines.push(`Instructions from ${user.name?.trim() || "the assigner"}: ${instructions.trim()}`);
  return {
    title: task.name,
    goal: lines.join("\n"),
    steps: [] as string[],
    riskLevel: "medium" as const,
    submittedByUserId: user.id,
    userName: user.name ?? undefined,
    userRole: user.role,
    companyId: input.companyId ?? undefined,
    projectTaskId: task.id,
    projectId: task.projectId,
  };
}

/**
 * Create a project task from an external source (email thread, meeting
 * transcript, CRM deal). This is the Lightfield-equivalent entry point for
 * auto-generated tasks from business context.
 */
export type CreateFromSourceInput = {
  projectId: number;
  name: string;
  description?: string;
  accountId?: number;
  opportunityId?: number;
  sourceType: "email" | "meeting" | "ai_generated" | "crm_deal";
  sourceRefType?: string;
  sourceRefId?: number;
  sourceExternalId?: string;
  priority?: "low" | "medium" | "high" | "critical";
  dueDate?: Date;
  assigneeId?: number;
  aiReasoning?: string;
  aiConfidence?: number;
  createdBy?: number;
};

export async function createProjectTaskFromSource(input: CreateFromSourceInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(projectTasks).values({
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    assigneeId: input.assigneeId,
    assigneeType: "human",
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    sourceType: input.sourceType,
    sourceRefType: input.sourceRefType,
    sourceRefId: input.sourceRefId,
    sourceExternalId: input.sourceExternalId,
    priority: input.priority ?? "medium",
    dueDate: input.dueDate,
    aiReasoning: input.aiReasoning,
    aiConfidence: input.aiConfidence != null ? input.aiConfidence.toFixed(2) : undefined,
    createdBy: input.createdBy,
  });

  return { id: result[0].insertId };
}

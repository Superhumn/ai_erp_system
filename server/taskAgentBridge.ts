import { eq } from "drizzle-orm";
import { projectTasks, aiAgentTasks, type InsertAiAgentTask } from "../drizzle/schema";
import { getDb } from "./db/connection";
import { createAiAgentTask, updateAiAgentTask, createAiAgentLog } from "./db";

type AgentTaskType = InsertAiAgentTask["taskType"];
type AgentPriority = InsertAiAgentTask["priority"];

export type AssignToAgentInput = {
  projectTaskId: number;
  agentTaskType: AgentTaskType;
  taskData: Record<string, unknown>;
  reasoning?: string;
  confidence?: number;
  priority?: AgentPriority;
  requiresApproval?: boolean;
  actorUserId?: number;
};

/**
 * Assign a project task to an AI agent. Creates an aiAgentTasks row in
 * pending_approval (or approved if requiresApproval=false) and links it back
 * to the project task. The Projects UI keeps showing a single task; the
 * approval queue shows the same work item from the agent side.
 */
export async function assignProjectTaskToAgent(input: AssignToAgentInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const agentTask = await createAiAgentTask({
    taskType: input.agentTaskType,
    priority: input.priority ?? "medium",
    status: input.requiresApproval === false ? "approved" : "pending_approval",
    taskData: JSON.stringify(input.taskData),
    aiReasoning: input.reasoning ?? "Assigned from project task",
    aiConfidence: input.confidence != null ? input.confidence.toFixed(2) : "100.00",
    relatedEntityType: "projectTask",
    relatedEntityId: input.projectTaskId,
    requiresApproval: input.requiresApproval !== false,
  } as InsertAiAgentTask);

  await db.update(projectTasks).set({
    assigneeType: "ai_agent",
    assigneeAgentTaskId: agentTask.id,
    aiReasoning: input.reasoning,
    aiConfidence: input.confidence != null ? input.confidence.toFixed(2) : undefined,
    status: "in_progress",
  }).where(eq(projectTasks.id, input.projectTaskId));

  await createAiAgentLog({
    taskId: agentTask.id,
    action: "task_created",
    status: "info",
    message: `Project task #${input.projectTaskId} assigned to AI agent`,
    details: JSON.stringify({ projectTaskId: input.projectTaskId, actorUserId: input.actorUserId }),
  });

  return { agentTaskId: agentTask.id };
}

/**
 * Move execution back to a human. Cancels the linked aiAgentTasks row if it
 * is still pending or in-flight, then clears the AI linkage on the project
 * task.
 */
export async function reassignProjectTaskToHuman(projectTaskId: number, humanUserId: number | null, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, projectTaskId)).limit(1);
  if (!task) throw new Error(`Project task ${projectTaskId} not found`);

  if (task.assigneeAgentTaskId) {
    const [agentTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, task.assigneeAgentTaskId)).limit(1);
    if (agentTask && !["completed", "failed", "cancelled", "rejected"].includes(agentTask.status)) {
      await updateAiAgentTask(agentTask.id, { status: "cancelled" });
      await createAiAgentLog({
        taskId: agentTask.id,
        action: "task_cancelled",
        status: "info",
        message: `Reassigned to human${actorUserId ? ` by user ${actorUserId}` : ""}`,
      });
    }
  }

  await db.update(projectTasks).set({
    assigneeType: "human",
    assigneeId: humanUserId ?? null,
    assigneeAgentTaskId: null,
    status: task.status === "in_progress" ? "in_progress" : "todo",
  }).where(eq(projectTasks.id, projectTaskId));
}

/**
 * Mirror an aiAgentTasks status change back onto its linked project task.
 * Called from the ai router when a task is approved, executed, completed,
 * failed, or rejected.
 */
export async function syncAgentStatusToProjectTask(agentTaskId: number) {
  const db = await getDb();
  if (!db) return;

  const [agentTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, agentTaskId)).limit(1);
  if (!agentTask || agentTask.relatedEntityType !== "projectTask" || !agentTask.relatedEntityId) return;

  const mapped = mapAgentStatusToProjectStatus(agentTask.status);
  if (!mapped) return;

  const patch: Partial<typeof projectTasks.$inferInsert> = { status: mapped };
  if (mapped === "completed") patch.completedDate = new Date();

  await db.update(projectTasks).set(patch).where(eq(projectTasks.id, agentTask.relatedEntityId));
}

function mapAgentStatusToProjectStatus(agentStatus: string): "todo" | "in_progress" | "review" | "completed" | "cancelled" | null {
  switch (agentStatus) {
    case "pending_approval": return "review";
    case "approved":
    case "in_progress": return "in_progress";
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "rejected":
    case "failed": return "todo";
    default: return null;
  }
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

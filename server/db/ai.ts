import { eq, and, desc } from "drizzle-orm";
import {
  aiConversations, aiMessages,
  aiAgentTasks, InsertAiAgentTask, aiAgentRules, InsertAiAgentRule,
  aiAgentLogs, InsertAiAgentLog,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getAiConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiConversations).where(eq(aiConversations.userId, userId)).orderBy(desc(aiConversations.updatedAt));
}

export async function getAiConversationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
  return result[0];
}

export async function createAiConversation(data: typeof aiConversations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiConversations).values(data);
  return { id: result[0].insertId };
}

export async function getAiMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(aiMessages.createdAt);
}

export async function createAiMessage(data: typeof aiMessages.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiMessages).values(data);
  return { id: result[0].insertId };
}

export async function updateAiConversation(id: number, data: Partial<typeof aiConversations.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiConversations).set(data).where(eq(aiConversations.id, id));
}

export async function createAiAgentTask(data: InsertAiAgentTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiAgentTasks).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getAiAgentTasks(filters?: { 
  status?: string; 
  taskType?: string; 
  priority?: string;
  requiresApproval?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(aiAgentTasks);
  const conditions = [];
  if (filters?.status) conditions.push(eq(aiAgentTasks.status, filters.status as any));
  if (filters?.taskType) conditions.push(eq(aiAgentTasks.taskType, filters.taskType as any));
  if (filters?.priority) conditions.push(eq(aiAgentTasks.priority, filters.priority as any));
  if (filters?.requiresApproval !== undefined) conditions.push(eq(aiAgentTasks.requiresApproval, filters.requiresApproval));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(aiAgentTasks.createdAt));
}

export async function getAiAgentTaskById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, id));
  return result[0] || null;
}

export async function updateAiAgentTask(id: number, data: Partial<{
  status: string;
  approvedBy: number;
  approvedAt: Date;
  rejectedBy: number;
  rejectedAt: Date;
  rejectionReason: string;
  executedAt: Date;
  executionResult: string;
  errorMessage: string;
  retryCount: number;
  taskData: string;
  aiReasoning: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(aiAgentTasks).set(data as any).where(eq(aiAgentTasks.id, id));
}

export async function getPendingApprovalTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "pending_approval"))
    .orderBy(desc(aiAgentTasks.priority), desc(aiAgentTasks.createdAt));
}

export async function createAiAgentRule(data: InsertAiAgentRule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiAgentRules).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getAiAgentRules(filters?: { ruleType?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(aiAgentRules);
  const conditions = [];
  if (filters?.ruleType) conditions.push(eq(aiAgentRules.ruleType, filters.ruleType as any));
  if (filters?.isActive !== undefined) conditions.push(eq(aiAgentRules.isActive, filters.isActive));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(aiAgentRules.createdAt));
}

export async function updateAiAgentRule(id: number, data: Partial<{
  name: string;
  description: string;
  triggerCondition: string;
  actionConfig: string;
  requiresApproval: boolean;
  autoApproveThreshold: string;
  notifyUsers: string;
  isActive: boolean;
  lastTriggeredAt: Date;
  triggerCount: number;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(aiAgentRules).set(data as any).where(eq(aiAgentRules.id, id));
}

export async function createAiAgentLog(data: InsertAiAgentLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiAgentLogs).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getAiAgentLogs(filters?: { taskId?: number; ruleId?: number; status?: string }, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(aiAgentLogs);
  const conditions = [];
  if (filters?.taskId) conditions.push(eq(aiAgentLogs.taskId, filters.taskId));
  if (filters?.ruleId) conditions.push(eq(aiAgentLogs.ruleId, filters.ruleId));
  if (filters?.status) conditions.push(eq(aiAgentLogs.status, filters.status as any));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(aiAgentLogs.createdAt)).limit(limit);
}

/**
 * DB helpers for the Thread Follow-Up workflow.
 *
 * Consumers import these directly from "./db/threadFollowUp" (not via the
 * "./db" barrel) so they work regardless of whether the extracted db tree is
 * wired up. See server/threadFollowUp.ts for the workflow.
 */
import { and, asc, desc, eq, lte } from "drizzle-orm";
import {
  emailThreadFollowups,
  threadFollowupLogs,
  type InsertEmailThreadFollowup,
  type InsertThreadFollowupLog,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createThreadFollowup(input: InsertEmailThreadFollowup) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailThreadFollowups).values(input);
  return { id: result[0].insertId };
}

export async function getThreadFollowupById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(emailThreadFollowups).where(eq(emailThreadFollowups.id, id)).limit(1);
  return rows[0] || null;
}

export async function getThreadFollowupByThreadId(threadId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(emailThreadFollowups)
    .where(eq(emailThreadFollowups.threadId, threadId)).limit(1);
  return rows[0] || null;
}

/**
 * Threads the daily job should act on: still active and due
 * (nextNudgeAt <= now). Ordered oldest-due-first.
 */
export async function getDueThreadFollowups(now: Date, limit = 500) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailThreadFollowups)
    .where(and(
      eq(emailThreadFollowups.status, "active"),
      lte(emailThreadFollowups.nextNudgeAt, now),
    ))
    .orderBy(asc(emailThreadFollowups.nextNudgeAt))
    .limit(limit);
}

export async function updateThreadFollowup(
  id: number,
  updates: Partial<InsertEmailThreadFollowup>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailThreadFollowups).set(updates).where(eq(emailThreadFollowups.id, id));
}

export async function listThreadFollowups(filters?: { status?: string; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(emailThreadFollowups);
  if (filters?.status) {
    query = query.where(eq(emailThreadFollowups.status, filters.status as any)) as typeof query;
  }
  return query.orderBy(desc(emailThreadFollowups.updatedAt)).limit(filters?.limit ?? 200);
}

export async function insertThreadFollowupLog(input: InsertThreadFollowupLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(threadFollowupLogs).values(input);
  return { id: result[0].insertId };
}

export async function getThreadFollowupLogs(filters?: {
  followupId?: number;
  threadId?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.followupId) conditions.push(eq(threadFollowupLogs.followupId, filters.followupId));
  if (filters?.threadId) conditions.push(eq(threadFollowupLogs.threadId, filters.threadId));
  let query = db.select().from(threadFollowupLogs);
  if (conditions.length > 0) query = query.where(and(...conditions)) as typeof query;
  return query.orderBy(desc(threadFollowupLogs.createdAt)).limit(filters?.limit ?? 500);
}

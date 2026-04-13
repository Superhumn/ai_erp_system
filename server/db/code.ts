import { eq, and, desc, like, or } from "drizzle-orm";
import {
  codeSnippets, InsertCodeSnippet,
  codeExecutions, InsertCodeExecution,
  codeAiSessions, InsertCodeAiSession,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================
// CODE SNIPPETS
// ============================================

export async function getCodeSnippets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(codeSnippets)
    .where(or(eq(codeSnippets.userId, userId), eq(codeSnippets.isPublic, true)))
    .orderBy(desc(codeSnippets.updatedAt));
}

export async function getCodeSnippetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(codeSnippets).where(eq(codeSnippets.id, id)).limit(1);
  return result[0];
}

export async function createCodeSnippet(data: InsertCodeSnippet) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(codeSnippets).values(data);
  return { id: result[0].insertId };
}

export async function updateCodeSnippet(id: number, data: Partial<InsertCodeSnippet>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(codeSnippets).set(data).where(eq(codeSnippets.id, id));
  return { id };
}

export async function deleteCodeSnippet(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(codeSnippets).where(eq(codeSnippets.id, id));
  return { id };
}

export async function searchCodeSnippets(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const searchTerm = `%${query}%`;
  return db.select().from(codeSnippets)
    .where(
      and(
        or(eq(codeSnippets.userId, userId), eq(codeSnippets.isPublic, true)),
        or(
          like(codeSnippets.title, searchTerm),
          like(codeSnippets.description, searchTerm),
          like(codeSnippets.code, searchTerm),
          like(codeSnippets.tags, searchTerm),
        )
      )
    )
    .orderBy(desc(codeSnippets.updatedAt));
}

// ============================================
// CODE EXECUTIONS
// ============================================

export async function getCodeExecutions(userId: number, snippetId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(codeExecutions.userId, userId)];
  if (snippetId) conditions.push(eq(codeExecutions.snippetId, snippetId));
  return db.select().from(codeExecutions)
    .where(and(...conditions))
    .orderBy(desc(codeExecutions.createdAt))
    .limit(50);
}

export async function createCodeExecution(data: InsertCodeExecution) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(codeExecutions).values(data);
  return { id: result[0].insertId };
}

export async function updateCodeExecution(id: number, data: Partial<InsertCodeExecution>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(codeExecutions).set(data).where(eq(codeExecutions.id, id));
  return { id };
}

// ============================================
// CODE AI SESSIONS
// ============================================

export async function getCodeAiSessions(userId: number, snippetId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(codeAiSessions.userId, userId)];
  if (snippetId) conditions.push(eq(codeAiSessions.snippetId, snippetId));
  return db.select().from(codeAiSessions)
    .where(and(...conditions))
    .orderBy(desc(codeAiSessions.createdAt))
    .limit(50);
}

export async function createCodeAiSession(data: InsertCodeAiSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(codeAiSessions).values(data);
  return { id: result[0].insertId };
}

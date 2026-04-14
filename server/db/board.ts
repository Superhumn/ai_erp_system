import { eq, and, desc } from "drizzle-orm";
import {
  boardResolutions, InsertBoardResolution,
  boardSignatures, InsertBoardSignature,
  investorUpdates, InsertInvestorUpdate,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================
// BOARD RESOLUTIONS
// ============================================

export async function getBoardResolutions(filters?: { companyId?: number; status?: string; type?: string }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(boardResolutions.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(boardResolutions.status, filters.status as any));
  if (filters?.type) conditions.push(eq(boardResolutions.type, filters.type as any));
  if (conditions.length > 0) {
    return db.select().from(boardResolutions).where(and(...conditions)).orderBy(desc(boardResolutions.createdAt));
  }
  return db.select().from(boardResolutions).orderBy(desc(boardResolutions.createdAt));
}

export async function getBoardResolutionById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(boardResolutions).where(eq(boardResolutions.id, id)).limit(1);
  return result[0];
}

export async function createBoardResolution(data: InsertBoardResolution) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const result = await db.insert(boardResolutions).values(data);
  return { id: result[0].insertId };
}

export async function updateBoardResolution(id: number, data: Partial<InsertBoardResolution>) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.update(boardResolutions).set(data).where(eq(boardResolutions.id, id));
}

// ============================================
// BOARD SIGNATURES
// ============================================

export async function getBoardSignatures(resolutionId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(boardSignatures).where(eq(boardSignatures.resolutionId, resolutionId)).orderBy(desc(boardSignatures.createdAt));
}

export async function getBoardSignatureById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(boardSignatures).where(eq(boardSignatures.id, id)).limit(1);
  return result[0];
}

export async function createBoardSignature(data: InsertBoardSignature) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const result = await db.insert(boardSignatures).values(data);
  return { id: result[0].insertId };
}

export async function updateBoardSignature(id: number, data: Partial<InsertBoardSignature>) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.update(boardSignatures).set(data).where(eq(boardSignatures.id, id));
}

// ============================================
// INVESTOR UPDATES
// ============================================

export async function getInvestorUpdates(filters?: { companyId?: number; status?: string; type?: string }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(investorUpdates.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(investorUpdates.status, filters.status as any));
  if (filters?.type) conditions.push(eq(investorUpdates.type, filters.type as any));
  if (conditions.length > 0) {
    return db.select().from(investorUpdates).where(and(...conditions)).orderBy(desc(investorUpdates.createdAt));
  }
  return db.select().from(investorUpdates).orderBy(desc(investorUpdates.createdAt));
}

export async function getInvestorUpdateById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(investorUpdates).where(eq(investorUpdates.id, id)).limit(1);
  return result[0];
}

export async function createInvestorUpdate(data: InsertInvestorUpdate) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const result = await db.insert(investorUpdates).values(data);
  return { id: result[0].insertId };
}

export async function updateInvestorUpdate(id: number, data: Partial<InsertInvestorUpdate>) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.update(investorUpdates).set(data).where(eq(investorUpdates.id, id));
}

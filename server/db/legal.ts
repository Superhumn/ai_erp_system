import { eq, and, desc } from "drizzle-orm";
import { contracts, InsertContract, contractKeyDates, disputes, InsertDispute, documents, InsertDocument } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getContracts(filters?: { companyId?: number; status?: string; type?: string }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(contracts.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(contracts.status, filters.status as any));
  if (filters?.type) conditions.push(eq(contracts.type, filters.type as any));
  if (conditions.length > 0) { return db.select().from(contracts).where(and(...conditions)).orderBy(desc(contracts.createdAt)); }
  return db.select().from(contracts).orderBy(desc(contracts.createdAt));
}
export async function getContractById(id: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1); return result[0]; }
export async function getContractWithKeyDates(id: number) { const db = await getDb(); if (!db) return undefined; const contract = await getContractById(id); if (!contract) return undefined; const keyDates = await db.select().from(contractKeyDates).where(eq(contractKeyDates.contractId, id)).orderBy(contractKeyDates.date); return { ...contract, keyDates }; }
export async function createContract(data: InsertContract) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(contracts).values(data); return { id: result[0].insertId }; }
export async function updateContract(id: number, data: Partial<InsertContract>) { const db = await getDb(); if (!db) return; await db.update(contracts).set(data).where(eq(contracts.id, id)); }
export async function createContractKeyDate(data: typeof contractKeyDates.$inferInsert) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(contractKeyDates).values(data); return { id: result[0].insertId }; }
export async function getDisputes(filters?: { companyId?: number; status?: string; priority?: string }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(disputes.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(disputes.status, filters.status as any));
  if (filters?.priority) conditions.push(eq(disputes.priority, filters.priority as any));
  if (conditions.length > 0) { return db.select().from(disputes).where(and(...conditions)).orderBy(desc(disputes.createdAt)); }
  return db.select().from(disputes).orderBy(desc(disputes.createdAt));
}
export async function getDisputeById(id: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1); return result[0]; }
export async function createDispute(data: InsertDispute) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(disputes).values(data); return { id: result[0].insertId }; }
export async function updateDispute(id: number, data: Partial<InsertDispute>) { const db = await getDb(); if (!db) throw new Error("Database not available"); await db.update(disputes).set(data).where(eq(disputes.id, id)); }
export async function getDocuments(filters?: { companyId?: number; type?: string; referenceType?: string; referenceId?: number }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(documents.companyId, filters.companyId));
  if (filters?.type) conditions.push(eq(documents.type, filters.type as any));
  if (filters?.referenceType) conditions.push(eq(documents.referenceType, filters.referenceType));
  if (filters?.referenceId) conditions.push(eq(documents.referenceId, filters.referenceId));
  if (conditions.length > 0) { return db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt)); }
  return db.select().from(documents).orderBy(desc(documents.createdAt));
}
export async function createDocument(data: InsertDocument) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(documents).values(data); return { id: result[0].insertId }; }
export async function deleteDocument(id: number) { const db = await getDb(); if (!db) throw new Error("Database not available"); await db.delete(documents).where(eq(documents.id, id)); }

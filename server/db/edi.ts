import { eq, and, desc, gte, count, sum, sql } from "drizzle-orm";
import {
  ediTradingPartners, InsertEdiTradingPartner,
  ediDocumentMaps, InsertEdiDocumentMap,
  ediTransactions, InsertEdiTransaction,
  ediTransactionItems, InsertEdiTransactionItem,
  ediProductCrosswalks, InsertEdiProductCrosswalk,
  ediShipToLocations, InsertEdiShipToLocation,
  ediComplianceScorecards, InsertEdiComplianceScorecard,
  ediControlNumbers,
  ediSettings, InsertEdiSettings,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================
// EDI TRADING PARTNERS
// ============================================

export async function getEdiTradingPartners(filters?: { status?: string; partnerType?: string; companyId?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) conditions.push(eq(ediTradingPartners.status, filters.status as any));
  if (filters?.partnerType) conditions.push(eq(ediTradingPartners.partnerType, filters.partnerType as any));
  if (filters?.companyId) conditions.push(eq(ediTradingPartners.companyId, filters.companyId));

  if (conditions.length > 0) {
    return db.select().from(ediTradingPartners).where(and(...conditions)).orderBy(desc(ediTradingPartners.updatedAt));
  }
  return db.select().from(ediTradingPartners).orderBy(desc(ediTradingPartners.updatedAt));
}

export async function getEdiTradingPartnerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ediTradingPartners).where(eq(ediTradingPartners.id, id)).limit(1);
  return result[0];
}

export async function getEdiTradingPartnerByIsaId(isaId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ediTradingPartners).where(eq(ediTradingPartners.isaId, isaId)).limit(1);
  return result[0];
}

export async function createEdiTradingPartner(data: InsertEdiTradingPartner) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ediTradingPartners).values(data);
  return { id: result[0].insertId };
}

export async function updateEdiTradingPartner(id: number, data: Partial<InsertEdiTradingPartner>) {
  const db = await getDb();
  if (!db) return;
  await db.update(ediTradingPartners).set(data).where(eq(ediTradingPartners.id, id));
}

export async function deleteEdiTradingPartner(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(ediTradingPartners).where(eq(ediTradingPartners.id, id));
}

// ============================================
// EDI DOCUMENT MAPS
// ============================================

export async function getEdiDocumentMaps(tradingPartnerId?: number) {
  const db = await getDb();
  if (!db) return [];

  if (tradingPartnerId) {
    return db.select().from(ediDocumentMaps).where(eq(ediDocumentMaps.tradingPartnerId, tradingPartnerId)).orderBy(desc(ediDocumentMaps.updatedAt));
  }
  return db.select().from(ediDocumentMaps).orderBy(desc(ediDocumentMaps.updatedAt));
}

export async function getEdiDocumentMapById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ediDocumentMaps).where(eq(ediDocumentMaps.id, id)).limit(1);
  return result[0];
}

export async function createEdiDocumentMap(data: InsertEdiDocumentMap) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ediDocumentMaps).values(data);
  return { id: result[0].insertId };
}

export async function updateEdiDocumentMap(id: number, data: Partial<InsertEdiDocumentMap>) {
  const db = await getDb();
  if (!db) return;
  await db.update(ediDocumentMaps).set(data).where(eq(ediDocumentMaps.id, id));
}

// ============================================
// EDI TRANSACTIONS
// ============================================

export async function getEdiTransactions(filters?: { tradingPartnerId?: number; transactionSetCode?: string; direction?: string; status?: string; limit?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.tradingPartnerId) conditions.push(eq(ediTransactions.tradingPartnerId, filters.tradingPartnerId));
  if (filters?.transactionSetCode) conditions.push(eq(ediTransactions.transactionSetCode, filters.transactionSetCode));
  if (filters?.direction) conditions.push(eq(ediTransactions.direction, filters.direction as any));
  if (filters?.status) conditions.push(eq(ediTransactions.status, filters.status as any));

  const query = conditions.length > 0
    ? db.select().from(ediTransactions).where(and(...conditions)).orderBy(desc(ediTransactions.createdAt))
    : db.select().from(ediTransactions).orderBy(desc(ediTransactions.createdAt));

  if (filters?.limit) {
    return query.limit(filters.limit);
  }
  return query;
}

export async function getEdiTransactionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ediTransactions).where(eq(ediTransactions.id, id)).limit(1);
  return result[0];
}

export async function getEdiTransactionWithItems(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const transaction = await getEdiTransactionById(id);
  if (!transaction) return undefined;

  const items = await db.select().from(ediTransactionItems).where(eq(ediTransactionItems.transactionId, id)).orderBy(ediTransactionItems.lineNumber);
  return { ...transaction, items };
}

export async function createEdiTransaction(data: InsertEdiTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ediTransactions).values(data);
  return { id: result[0].insertId };
}

export async function updateEdiTransaction(id: number, data: Partial<InsertEdiTransaction>) {
  const db = await getDb();
  if (!db) return;
  await db.update(ediTransactions).set(data).where(eq(ediTransactions.id, id));
}

// ============================================
// EDI TRANSACTION ITEMS
// ============================================

export async function createEdiTransactionItem(data: InsertEdiTransactionItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ediTransactionItems).values(data);
  return { id: result[0].insertId };
}

// ============================================
// EDI PRODUCT CROSSWALKS
// ============================================

export async function getEdiProductCrosswalks(tradingPartnerId?: number) {
  const db = await getDb();
  if (!db) return [];

  if (tradingPartnerId) {
    return db.select().from(ediProductCrosswalks).where(
      and(eq(ediProductCrosswalks.tradingPartnerId, tradingPartnerId), eq(ediProductCrosswalks.isActive, true))
    ).orderBy(ediProductCrosswalks.buyerPartNumber);
  }
  return db.select().from(ediProductCrosswalks).where(eq(ediProductCrosswalks.isActive, true)).orderBy(ediProductCrosswalks.buyerPartNumber);
}

export async function getEdiProductCrosswalkByBuyerPart(tradingPartnerId: number, buyerPartNumber: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ediProductCrosswalks).where(
    and(
      eq(ediProductCrosswalks.tradingPartnerId, tradingPartnerId),
      eq(ediProductCrosswalks.buyerPartNumber, buyerPartNumber),
      eq(ediProductCrosswalks.isActive, true)
    )
  ).limit(1);
  return result[0];
}

export async function getEdiProductCrosswalkByUpc(tradingPartnerId: number, upc: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ediProductCrosswalks).where(
    and(
      eq(ediProductCrosswalks.tradingPartnerId, tradingPartnerId),
      eq(ediProductCrosswalks.upc, upc),
      eq(ediProductCrosswalks.isActive, true)
    )
  ).limit(1);
  return result[0];
}

export async function createEdiProductCrosswalk(data: InsertEdiProductCrosswalk) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ediProductCrosswalks).values(data);
  return { id: result[0].insertId };
}

export async function updateEdiProductCrosswalk(id: number, data: Partial<InsertEdiProductCrosswalk>) {
  const db = await getDb();
  if (!db) return;
  await db.update(ediProductCrosswalks).set(data).where(eq(ediProductCrosswalks.id, id));
}

export async function deleteEdiProductCrosswalk(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(ediProductCrosswalks).set({ isActive: false }).where(eq(ediProductCrosswalks.id, id));
}

// ============================================
// EDI SHIP-TO LOCATIONS
// ============================================

export async function getEdiShipToLocations(tradingPartnerId?: number) {
  const db = await getDb();
  if (!db) return [];

  if (tradingPartnerId) {
    return db.select().from(ediShipToLocations).where(
      and(eq(ediShipToLocations.tradingPartnerId, tradingPartnerId), eq(ediShipToLocations.isActive, true))
    ).orderBy(ediShipToLocations.locationCode);
  }
  return db.select().from(ediShipToLocations).where(eq(ediShipToLocations.isActive, true)).orderBy(ediShipToLocations.locationCode);
}

export async function createEdiShipToLocation(data: InsertEdiShipToLocation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ediShipToLocations).values(data);
  return { id: result[0].insertId };
}

export async function updateEdiShipToLocation(id: number, data: Partial<InsertEdiShipToLocation>) {
  const db = await getDb();
  if (!db) return;
  await db.update(ediShipToLocations).set(data).where(eq(ediShipToLocations.id, id));
}

// ============================================
// EDI COMPLIANCE SCORECARDS
// ============================================

export async function getEdiComplianceScorecards(tradingPartnerId?: number) {
  const db = await getDb();
  if (!db) return [];

  if (tradingPartnerId) {
    return db.select().from(ediComplianceScorecards).where(eq(ediComplianceScorecards.tradingPartnerId, tradingPartnerId)).orderBy(desc(ediComplianceScorecards.periodEnd));
  }
  return db.select().from(ediComplianceScorecards).orderBy(desc(ediComplianceScorecards.periodEnd));
}

export async function createEdiComplianceScorecard(data: InsertEdiComplianceScorecard) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ediComplianceScorecards).values(data);
  return { id: result[0].insertId };
}

// ============================================
// EDI DASHBOARD STATS
// ============================================

export async function getEdiDashboardStats() {
  const db = await getDb();
  if (!db) return { totalPartners: 0, activePartners: 0, totalTransactions: 0, recentTransactions: 0, pendingAcks: 0, errorTransactions: 0 };

  const [partnersResult] = await db.select({ total: count(), active: sum(sql`CASE WHEN status = 'active' THEN 1 ELSE 0 END`) }).from(ediTradingPartners);
  const [transactionsResult] = await db.select({ total: count(), errors: sum(sql`CASE WHEN status = 'error' THEN 1 ELSE 0 END`) }).from(ediTransactions);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentResult] = await db.select({ count: count() }).from(ediTransactions).where(gte(ediTransactions.createdAt, sevenDaysAgo));
  const [pendingAcksResult] = await db.select({ count: count() }).from(ediTransactions).where(
    and(eq(ediTransactions.ackRequired, true), eq(ediTransactions.ackStatus, "pending"))
  );

  return {
    totalPartners: Number(partnersResult?.total ?? 0),
    activePartners: Number(partnersResult?.active ?? 0),
    totalTransactions: Number(transactionsResult?.total ?? 0),
    recentTransactions: Number(recentResult?.count ?? 0),
    pendingAcks: Number(pendingAcksResult?.count ?? 0),
    errorTransactions: Number(transactionsResult?.errors ?? 0),
  };
}

// ============================================
// EDI CONTROL NUMBERS
// ============================================

export async function getNextControlNumber(
  tradingPartnerId: number,
  controlNumberType: "isa" | "gs" | "st"
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.update(ediControlNumbers)
    .set({ lastUsedNumber: sql`${ediControlNumbers.lastUsedNumber} + 1` })
    .where(
      and(eq(ediControlNumbers.tradingPartnerId, tradingPartnerId), eq(ediControlNumbers.controlNumberType, controlNumberType))
    );

  const affectedRows = (result as any)[0]?.affectedRows ?? (result as any).rowsAffected ?? 0;

  let nextNumber: number;
  if (affectedRows === 0) {
    nextNumber = 1;
    await db.insert(ediControlNumbers).values({
      tradingPartnerId,
      controlNumberType,
      lastUsedNumber: nextNumber,
    }).onDuplicateKeyUpdate({
      set: { lastUsedNumber: sql`${ediControlNumbers.lastUsedNumber} + 1` },
    });
  } else {
    const [row] = await db.select().from(ediControlNumbers).where(
      and(eq(ediControlNumbers.tradingPartnerId, tradingPartnerId), eq(ediControlNumbers.controlNumberType, controlNumberType))
    );
    nextNumber = row.lastUsedNumber;
  }

  const padLen = controlNumberType === "isa" ? 9 : controlNumberType === "st" ? 4 : 6;
  return nextNumber.toString().padStart(padLen, "0");
}

// ============================================
// EDI SETTINGS
// ============================================

export async function getEdiSettings(companyId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (companyId) {
    const [result] = await db.select().from(ediSettings).where(eq(ediSettings.companyId, companyId));
    return result || null;
  }
  const [result] = await db.select().from(ediSettings).limit(1);
  return result || null;
}

export async function upsertEdiSettings(data: InsertEdiSettings) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getEdiSettings(data.companyId || undefined);
  if (existing) {
    await db.update(ediSettings).set(data).where(eq(ediSettings.id, existing.id));
    return { id: existing.id };
  }
  const result = await db.insert(ediSettings).values(data);
  return { id: result[0].insertId };
}

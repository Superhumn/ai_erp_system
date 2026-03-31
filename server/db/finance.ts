import { eq, and, or, desc, sql, sum, count, lte, gte } from "drizzle-orm";
import {
  accounts, InsertAccount,
  invoices, InsertInvoice, invoiceItems,
  payments, InsertPayment,
  transactions, InsertTransaction,
  customers, products,
  reconciliationRuns, InsertReconciliationRun, reconciliationLines, InsertReconciliationLine,
  recurringInvoices, recurringInvoiceItems, recurringInvoiceHistory,
  inventoryCostLayers, InsertInventoryCostLayer,
  inventoryCostingConfig, InsertInventoryCostingConfig,
  cogsRecords, InsertCogsRecord,
  cogsPeriodSummary, InsertCogsPeriodSummary,
  cogsTransactions, InsertCogsTransaction,
  freightCostAllocations, InsertFreightCostAllocation,
  quickbooksAccounts, InsertQuickBooksAccount,
  quickbooksAccountMappings, InsertQuickBooksAccountMapping,
  quickbooksItems, InsertQuickBooksItem,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================
// FINANCE - ACCOUNTS
// ============================================

export async function getAccounts(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(accounts.code);
  }
  return db.select().from(accounts).orderBy(accounts.code);
}

export async function getAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return result[0];
}

export async function createAccount(data: InsertAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(accounts).values(data);
  return { id: result[0].insertId };
}

export async function updateAccount(id: number, data: Partial<InsertAccount>) {
  const db = await getDb();
  if (!db) return;
  await db.update(accounts).set(data).where(eq(accounts.id, id));
}

// ============================================
// FINANCE - INVOICES
// ============================================

export async function getInvoices(filters?: { companyId?: number; status?: string; customerId?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters?.companyId) conditions.push(eq(invoices.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(invoices.status, filters.status as any));
  if (filters?.customerId) conditions.push(eq(invoices.customerId, filters.customerId));

  const baseQuery = db.select({
    id: invoices.id,
    companyId: invoices.companyId,
    invoiceNumber: invoices.invoiceNumber,
    customerId: invoices.customerId,
    type: invoices.type,
    status: invoices.status,
    issueDate: invoices.issueDate,
    dueDate: invoices.dueDate,
    subtotal: invoices.subtotal,
    taxAmount: invoices.taxAmount,
    discountAmount: invoices.discountAmount,
    totalAmount: invoices.totalAmount,
    paidAmount: invoices.paidAmount,
    currency: invoices.currency,
    notes: invoices.notes,
    terms: invoices.terms,
    createdAt: invoices.createdAt,
    customer: {
      id: customers.id,
      name: customers.name,
      email: customers.email,
    },
  }).from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id));

  if (conditions.length > 0) {
    return baseQuery.where(and(...conditions)).orderBy(desc(invoices.createdAt));
  }
  return baseQuery.orderBy(desc(invoices.createdAt));
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result[0];
}

export async function getInvoiceWithItems(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const invoiceResult = await db.select({
    id: invoices.id,
    companyId: invoices.companyId,
    invoiceNumber: invoices.invoiceNumber,
    customerId: invoices.customerId,
    type: invoices.type,
    status: invoices.status,
    issueDate: invoices.issueDate,
    dueDate: invoices.dueDate,
    subtotal: invoices.subtotal,
    taxAmount: invoices.taxAmount,
    discountAmount: invoices.discountAmount,
    totalAmount: invoices.totalAmount,
    paidAmount: invoices.paidAmount,
    currency: invoices.currency,
    notes: invoices.notes,
    terms: invoices.terms,
    createdAt: invoices.createdAt,
    customer: {
      id: customers.id,
      name: customers.name,
      email: customers.email,
    },
  }).from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id)).where(eq(invoices.id, id)).limit(1);

  const invoice = invoiceResult[0];
  if (!invoice) return undefined;

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  return { ...invoice, items };
}

export async function createInvoice(data: InsertInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoices).values(data);
  return { id: result[0].insertId };
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>) {
  const db = await getDb();
  if (!db) return;
  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

export async function createInvoiceItem(data: typeof invoiceItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoiceItems).values(data);
  return { id: result[0].insertId };
}

// ============================================
// FINANCE - PAYMENTS
// ============================================

export async function getPayments(filters?: { companyId?: number; type?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.companyId) conditions.push(eq(payments.companyId, filters.companyId));
  if (filters?.type) conditions.push(eq(payments.type, filters.type as any));
  if (filters?.status) conditions.push(eq(payments.status, filters.status as any));

  if (conditions.length > 0) {
    return db.select().from(payments).where(and(...conditions)).orderBy(desc(payments.createdAt));
  }
  return db.select().from(payments).orderBy(desc(payments.createdAt));
}

export async function getPaymentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return result[0];
}

export async function createPayment(data: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(payments).values(data);
  return { id: result[0].insertId };
}

export async function updatePayment(id: number, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(payments).set(data).where(eq(payments.id, id));
}

// ============================================
// FINANCE - TRANSACTIONS
// ============================================

export async function getTransactions(filters?: { companyId?: number; type?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.companyId) conditions.push(eq(transactions.companyId, filters.companyId));
  if (filters?.type) conditions.push(eq(transactions.type, filters.type as any));
  if (filters?.status) conditions.push(eq(transactions.status, filters.status as any));

  if (conditions.length > 0) {
    return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.date));
  }
  return db.select().from(transactions).orderBy(desc(transactions.date));
}

export async function createTransaction(data: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(transactions).values(data);
  return { id: result[0].insertId };
}

// ============================================
// INVENTORY RECONCILIATION
// ============================================

export async function createReconciliationRun(data: Omit<InsertReconciliationRun, 'runNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const runNumber = `REC-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.insert(reconciliationRuns).values({ ...data, runNumber });
  return { id: result[0].insertId, runNumber };
}

export async function getReconciliationRuns(filters?: { status?: string; channel?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(reconciliationRuns.status, filters.status as any));
  if (filters?.channel) conditions.push(eq(reconciliationRuns.channel, filters.channel as any));

  return db.select().from(reconciliationRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reconciliationRuns.startedAt));
}

export async function getReconciliationRunById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reconciliationRuns).where(eq(reconciliationRuns.id, id)).limit(1);
  return result[0];
}

export async function updateReconciliationRun(id: number, data: Partial<InsertReconciliationRun>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reconciliationRuns).set(data).where(eq(reconciliationRuns.id, id));
}

export async function createReconciliationLine(data: InsertReconciliationLine) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reconciliationLines).values(data);
  return { id: result[0].insertId };
}

export async function getReconciliationLines(runId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reconciliationLines)
    .where(eq(reconciliationLines.runId, runId))
    .orderBy(reconciliationLines.status);
}

// ============================================
// RECURRING INVOICES
// ============================================

export async function getRecurringInvoices(filters?: { companyId?: number; customerId?: number; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.companyId) conditions.push(eq(recurringInvoices.companyId, filters.companyId));
  if (filters?.customerId) conditions.push(eq(recurringInvoices.customerId, filters.customerId));
  if (filters?.isActive !== undefined) conditions.push(eq(recurringInvoices.isActive, filters.isActive));

  const baseQuery = db.select({
    id: recurringInvoices.id,
    companyId: recurringInvoices.companyId,
    customerId: recurringInvoices.customerId,
    templateName: recurringInvoices.templateName,
    description: recurringInvoices.description,
    frequency: recurringInvoices.frequency,
    dayOfWeek: recurringInvoices.dayOfWeek,
    dayOfMonth: recurringInvoices.dayOfMonth,
    startDate: recurringInvoices.startDate,
    endDate: recurringInvoices.endDate,
    nextGenerationDate: recurringInvoices.nextGenerationDate,
    currency: recurringInvoices.currency,
    subtotal: recurringInvoices.subtotal,
    taxAmount: recurringInvoices.taxAmount,
    discountAmount: recurringInvoices.discountAmount,
    totalAmount: recurringInvoices.totalAmount,
    autoSend: recurringInvoices.autoSend,
    daysUntilDue: recurringInvoices.daysUntilDue,
    isActive: recurringInvoices.isActive,
    lastGeneratedAt: recurringInvoices.lastGeneratedAt,
    generationCount: recurringInvoices.generationCount,
    createdAt: recurringInvoices.createdAt,
    customer: {
      id: customers.id,
      name: customers.name,
      email: customers.email,
    },
  }).from(recurringInvoices).leftJoin(customers, eq(recurringInvoices.customerId, customers.id));

  if (conditions.length > 0) {
    return baseQuery.where(and(...conditions)).orderBy(desc(recurringInvoices.nextGenerationDate));
  }
  return baseQuery.orderBy(desc(recurringInvoices.nextGenerationDate));
}

export async function getRecurringInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(recurringInvoices).where(eq(recurringInvoices.id, id)).limit(1);
  return result[0];
}

export async function getRecurringInvoiceWithItems(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const invoice = await getRecurringInvoiceById(id);
  if (!invoice) return undefined;

  const items = await db.select().from(recurringInvoiceItems).where(eq(recurringInvoiceItems.recurringInvoiceId, id));
  return { ...invoice, items };
}

export async function createRecurringInvoice(data: typeof recurringInvoices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recurringInvoices).values(data);
  return { id: result[0].insertId };
}

export async function updateRecurringInvoice(id: number, data: Partial<typeof recurringInvoices.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(recurringInvoices).set(data).where(eq(recurringInvoices.id, id));
}

export async function createRecurringInvoiceItem(data: typeof recurringInvoiceItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recurringInvoiceItems).values(data);
  return { id: result[0].insertId };
}

export async function deleteRecurringInvoiceItems(recurringInvoiceId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(recurringInvoiceItems).where(eq(recurringInvoiceItems.recurringInvoiceId, recurringInvoiceId));
}

export async function getRecurringInvoicesDueForGeneration() {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  return db.select()
    .from(recurringInvoices)
    .where(and(
      eq(recurringInvoices.isActive, true),
      lte(recurringInvoices.nextGenerationDate, now)
    ))
    .orderBy(recurringInvoices.nextGenerationDate);
}

export async function createRecurringInvoiceHistory(data: typeof recurringInvoiceHistory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recurringInvoiceHistory).values(data);
  return { id: result[0].insertId };
}

export async function getRecurringInvoiceHistory(recurringInvoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(recurringInvoiceHistory)
    .where(eq(recurringInvoiceHistory.recurringInvoiceId, recurringInvoiceId))
    .orderBy(desc(recurringInvoiceHistory.generatedAt));
}

// ============================================
// INVENTORY COST LAYERS
// ============================================

export async function createInventoryCostLayer(data: InsertInventoryCostLayer) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventoryCostLayers).values(data);
  return { id: result[0].insertId };
}

export async function getInventoryCostLayers(filters?: { productId?: number; warehouseId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.productId) conditions.push(eq(inventoryCostLayers.productId, filters.productId));
  if (filters?.warehouseId) conditions.push(eq(inventoryCostLayers.warehouseId, filters.warehouseId));
  if (filters?.status) conditions.push(eq(inventoryCostLayers.status, filters.status as any));
  if (conditions.length > 0) {
    return db.select().from(inventoryCostLayers).where(and(...conditions)).orderBy(inventoryCostLayers.layerDate);
  }
  return db.select().from(inventoryCostLayers).orderBy(inventoryCostLayers.layerDate);
}

export async function getActiveCostLayers(productId: number, warehouseId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(inventoryCostLayers.productId, productId),
    eq(inventoryCostLayers.status, "active"),
  ];
  if (warehouseId) conditions.push(eq(inventoryCostLayers.warehouseId, warehouseId));
  return db.select().from(inventoryCostLayers)
    .where(and(...conditions))
    .orderBy(inventoryCostLayers.layerDate);
}

export async function updateInventoryCostLayer(id: number, data: Partial<InsertInventoryCostLayer>) {
  const db = await getDb();
  if (!db) return;
  await db.update(inventoryCostLayers).set(data).where(eq(inventoryCostLayers.id, id));
}

export async function updateInventoryCostBasis(id: number, remainingQuantity: string, status?: string) {
  const db = await getDb();
  if (!db) return;
  const updates: any = { remainingQuantity };
  if (status) updates.status = status;
  if (parseFloat(remainingQuantity) <= 0) updates.status = "depleted";
  await db.update(inventoryCostLayers).set(updates).where(eq(inventoryCostLayers.id, id));
}

export async function getWeightedAverageCost(productId: number, warehouseId?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [
    eq(inventoryCostLayers.productId, productId),
    eq(inventoryCostLayers.status, "active"),
  ];
  if (warehouseId) conditions.push(eq(inventoryCostLayers.warehouseId, warehouseId));

  const [result] = await db.select({
    totalQty: sum(inventoryCostLayers.remainingQuantity),
    totalCost: sum(sql`CAST(${inventoryCostLayers.remainingQuantity} AS DECIMAL(15,4)) * CAST(${inventoryCostLayers.unitCost} AS DECIMAL(15,4))`),
  }).from(inventoryCostLayers).where(and(...conditions));

  const totalQty = parseFloat(String(result?.totalQty || "0"));
  const totalCost = parseFloat(String(result?.totalCost || "0"));
  if (totalQty === 0) return null;

  return {
    weightedAverageCost: (totalCost / totalQty).toFixed(4),
    totalQuantity: totalQty.toFixed(4),
    totalValue: totalCost.toFixed(2),
  };
}

export async function getInventoryValuation(filters?: { companyId?: number; warehouseId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(inventoryCostLayers.status, "active")];
  if (filters?.companyId) conditions.push(eq(inventoryCostLayers.companyId, filters.companyId));
  if (filters?.warehouseId) conditions.push(eq(inventoryCostLayers.warehouseId, filters.warehouseId));

  return db.select({
    productId: inventoryCostLayers.productId,
    totalQuantity: sum(inventoryCostLayers.remainingQuantity),
    totalValue: sum(sql`CAST(${inventoryCostLayers.remainingQuantity} AS DECIMAL(15,4)) * CAST(${inventoryCostLayers.unitCost} AS DECIMAL(15,4))`),
    layerCount: count(),
  }).from(inventoryCostLayers)
    .where(and(...conditions))
    .groupBy(inventoryCostLayers.productId);
}

// ============================================
// INVENTORY COSTING CONFIG
// ============================================

export async function createInventoryCostingConfig(data: InsertInventoryCostingConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventoryCostingConfig).values(data);
  return { id: result[0].insertId };
}

export async function getInventoryCostingConfigs(filters?: { companyId?: number; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(inventoryCostingConfig.companyId, filters.companyId));
  if (filters?.isActive !== undefined) conditions.push(eq(inventoryCostingConfig.isActive, filters.isActive));
  if (conditions.length > 0) {
    return db.select().from(inventoryCostingConfig).where(and(...conditions));
  }
  return db.select().from(inventoryCostingConfig);
}

export async function getInventoryCostingConfigByProduct(productId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(inventoryCostingConfig)
    .where(and(eq(inventoryCostingConfig.productId, productId), eq(inventoryCostingConfig.isActive, true)))
    .limit(1);
  return result[0] || null;
}

export async function updateInventoryCostingConfig(id: number, data: Partial<InsertInventoryCostingConfig>) {
  const db = await getDb();
  if (!db) return;
  await db.update(inventoryCostingConfig).set(data).where(eq(inventoryCostingConfig.id, id));
}

// ============================================
// COGS RECORDS
// ============================================

export async function createCogsRecord(data: InsertCogsRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cogsRecords).values(data);
  return { id: result[0].insertId };
}

export async function getCogsRecords(filters?: {
  companyId?: number;
  productId?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(cogsRecords.companyId, filters.companyId));
  if (filters?.productId) conditions.push(eq(cogsRecords.productId, filters.productId));
  if (filters?.startDate) conditions.push(gte(cogsRecords.periodDate, filters.startDate));
  if (filters?.endDate) conditions.push(lte(cogsRecords.periodDate, filters.endDate));
  if (conditions.length > 0) {
    return db.select().from(cogsRecords).where(and(...conditions)).orderBy(desc(cogsRecords.periodDate));
  }
  return db.select().from(cogsRecords).orderBy(desc(cogsRecords.periodDate));
}

export async function getCogsSummary(filters?: { companyId?: number; productId?: number; startDate?: Date; endDate?: Date }) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(cogsRecords.companyId, filters.companyId));
  if (filters?.productId) conditions.push(eq(cogsRecords.productId, filters.productId));
  if (filters?.startDate) conditions.push(gte(cogsRecords.periodDate, filters.startDate));
  if (filters?.endDate) conditions.push(lte(cogsRecords.periodDate, filters.endDate));

  const [result] = await db.select({
    totalCogs: sum(cogsRecords.totalCogs),
    totalRevenue: sum(cogsRecords.totalRevenue),
    totalGrossMargin: sum(cogsRecords.grossMargin),
    totalQuantitySold: sum(cogsRecords.quantitySold),
    recordCount: count(),
  }).from(cogsRecords).where(conditions.length > 0 ? and(...conditions) : undefined);

  return result;
}

export async function getCOGSTransactions(filters?: { productId?: number; startDate?: Date; endDate?: Date; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.productId) conditions.push(eq(cogsTransactions.productId, filters.productId));
  if (filters?.startDate) conditions.push(gte(cogsTransactions.transactionDate, filters.startDate));
  if (filters?.endDate) conditions.push(lte(cogsTransactions.transactionDate, filters.endDate));
  const query = conditions.length > 0
    ? db.select().from(cogsTransactions).where(and(...conditions)).orderBy(desc(cogsTransactions.transactionDate))
    : db.select().from(cogsTransactions).orderBy(desc(cogsTransactions.transactionDate));
  return query.limit(filters?.limit || 100);
}

export async function recordCOGSSale(data: InsertCogsTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cogsTransactions).values(data);
  return { id: result[0].insertId };
}

export async function getCogsDashboardStats(companyId?: number) {
  const db = await getDb();
  if (!db) return { totalCogs: "0", totalRevenue: "0", grossMargin: "0", grossMarginPercent: "0", recordCount: 0 };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const conditions = [gte(cogsRecords.periodDate, thirtyDaysAgo)];
  if (companyId) conditions.push(eq(cogsRecords.companyId, companyId));

  const [result] = await db.select({
    totalCogs: sum(cogsRecords.totalCogs),
    totalRevenue: sum(cogsRecords.totalRevenue),
    totalGrossMargin: sum(cogsRecords.grossMargin),
    recordCount: count(),
  }).from(cogsRecords).where(and(...conditions));

  const totalCogs = parseFloat(String(result?.totalCogs || "0"));
  const totalRevenue = parseFloat(String(result?.totalRevenue || "0"));
  const grossMargin = totalRevenue - totalCogs;
  const grossMarginPercent = totalRevenue > 0 ? ((grossMargin / totalRevenue) * 100) : 0;

  return {
    totalCogs: totalCogs.toFixed(2),
    totalRevenue: totalRevenue.toFixed(2),
    grossMargin: grossMargin.toFixed(2),
    grossMarginPercent: grossMarginPercent.toFixed(2),
    recordCount: Number(result?.recordCount || 0),
  };
}

// ============================================
// COGS PERIOD SUMMARIES
// ============================================

export async function createCogsPeriodSummaryRecord(data: InsertCogsPeriodSummary) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cogsPeriodSummary).values(data);
  return { id: result[0].insertId };
}

export async function getCogsPeriodSummaries(filters?: {
  companyId?: number;
  productId?: number;
  periodType?: string;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(cogsPeriodSummary.companyId, filters.companyId));
  if (filters?.productId) conditions.push(eq(cogsPeriodSummary.productId, filters.productId));
  if (filters?.periodType) conditions.push(eq(cogsPeriodSummary.periodType, filters.periodType as any));
  if (filters?.periodStart) conditions.push(eq(cogsPeriodSummary.periodStart, filters.periodStart));
  if (filters?.periodEnd) conditions.push(eq(cogsPeriodSummary.periodEnd, filters.periodEnd));
  if (conditions.length > 0) {
    return db.select().from(cogsPeriodSummary).where(and(...conditions)).orderBy(desc(cogsPeriodSummary.periodStart));
  }
  return db.select().from(cogsPeriodSummary).orderBy(desc(cogsPeriodSummary.periodStart));
}

export async function updateCogsPeriodSummaryRecord(id: number, data: Partial<InsertCogsPeriodSummary>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cogsPeriodSummary).set(data).where(eq(cogsPeriodSummary.id, id));
  return { id };
}

// ============================================
// FREIGHT COST ALLOCATION
// ============================================

export async function allocateFreightCosts(data: InsertFreightCostAllocation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(freightCostAllocations).values(data);
  return { id: result[0].insertId };
}

// ============================================
// PRODUCT PROFITABILITY
// ============================================

export async function getProductProfitability(productId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return null;

  const conditions = [eq(cogsRecords.productId, productId)];
  if (startDate) conditions.push(gte(cogsRecords.periodDate, startDate));
  if (endDate) conditions.push(lte(cogsRecords.periodDate, endDate));

  const [result] = await db.select({
    totalCogs: sum(cogsRecords.totalCogs),
    totalRevenue: sum(cogsRecords.totalRevenue),
    totalQuantitySold: sum(cogsRecords.quantitySold),
    avgUnitCogs: sql`AVG(CAST(${cogsRecords.unitCogs} AS DECIMAL(15,4)))`,
    recordCount: count(),
  }).from(cogsRecords).where(and(...conditions));

  const totalCogs = parseFloat(String(result?.totalCogs || "0"));
  const totalRevenue = parseFloat(String(result?.totalRevenue || "0"));
  return {
    productId,
    totalCogs: totalCogs.toFixed(2),
    totalRevenue: totalRevenue.toFixed(2),
    grossProfit: (totalRevenue - totalCogs).toFixed(2),
    grossMarginPercent: totalRevenue > 0 ? (((totalRevenue - totalCogs) / totalRevenue) * 100).toFixed(2) : "0",
    totalQuantitySold: String(result?.totalQuantitySold || "0"),
    avgUnitCogs: String(result?.avgUnitCogs || "0"),
    recordCount: Number(result?.recordCount || 0),
  };
}

// ============================================
// INVOICE LOOKUP
// ============================================

export async function getInvoiceByNumber(invoiceNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(invoices)
    .where(eq(invoices.invoiceNumber, invoiceNumber))
    .limit(1);
  return result[0] || null;
}

// ============================================
// QUICKBOOKS INTEGRATION
// ============================================

export async function syncQuickBooksAccounts(companyId: number, accountsData: InsertQuickBooksAccount[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const account of accountsData) {
    const existing = await db.select().from(quickbooksAccounts)
      .where(and(
        eq(quickbooksAccounts.quickbooksAccountId, account.quickbooksAccountId),
        eq(quickbooksAccounts.companyId, companyId)
      )).limit(1);

    if (existing.length > 0) {
      await db.update(quickbooksAccounts)
        .set({ ...account, lastSyncedAt: new Date() })
        .where(eq(quickbooksAccounts.id, existing[0].id));
    } else {
      await db.insert(quickbooksAccounts).values({ ...account, companyId, lastSyncedAt: new Date() });
    }
  }
}

export async function syncQuickBooksItems(companyId: number, itemsData: InsertQuickBooksItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const item of itemsData) {
    const existing = await db.select().from(quickbooksItems)
      .where(and(
        eq(quickbooksItems.quickbooksItemId, item.quickbooksItemId),
        eq(quickbooksItems.companyId, companyId)
      )).limit(1);

    if (existing.length > 0) {
      await db.update(quickbooksItems)
        .set({ ...item, lastSyncedAt: new Date() })
        .where(eq(quickbooksItems.id, existing[0].id));
    } else {
      await db.insert(quickbooksItems).values({ ...item, companyId, lastSyncedAt: new Date() });
    }
  }
}

export async function getQuickBooksAccountsByType(accountType: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(quickbooksAccounts.accountType, accountType)];
  if (companyId) conditions.push(eq(quickbooksAccounts.companyId, companyId));
  return db.select().from(quickbooksAccounts).where(and(...conditions));
}

export async function getQuickBooksAccountMappings(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(quickbooksAccountMappings).where(eq(quickbooksAccountMappings.companyId, companyId));
  }
  return db.select().from(quickbooksAccountMappings);
}

export async function upsertQuickBooksAccountMapping(data: InsertQuickBooksAccountMapping) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(quickbooksAccountMappings.mappingType, data.mappingType)];
  if (data.companyId) conditions.push(eq(quickbooksAccountMappings.companyId, data.companyId));

  const existing = await db.select().from(quickbooksAccountMappings)
    .where(and(...conditions)).limit(1);

  if (existing.length > 0) {
    await db.update(quickbooksAccountMappings).set(data).where(eq(quickbooksAccountMappings.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(quickbooksAccountMappings).values(data);
  return { id: result[0].insertId };
}

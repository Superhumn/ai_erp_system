import { eq, and, or, desc, sum, count, lte, gte } from "drizzle-orm";
import {
  accounts, InsertAccount,
  invoices, InsertInvoice, invoiceItems,
  payments, InsertPayment,
  transactions, InsertTransaction,
  customers,
  reconciliationRuns, InsertReconciliationRun, reconciliationLines, InsertReconciliationLine,
  recurringInvoices, recurringInvoiceItems, recurringInvoiceHistory,
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

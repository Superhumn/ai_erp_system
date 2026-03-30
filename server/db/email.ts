import { eq, and, or, desc, sql, lte, isNull } from "drizzle-orm";
import {
  inboundEmails, InsertInboundEmail, emailAttachments, InsertEmailAttachment,
  parsedDocuments, InsertParsedDocument, parsedDocumentLineItems, InsertParsedDocumentLineItem,
  autoReplyRules, sentEmails,
  imapCredentials, InsertImapCredential,
  emailCredentials, scheduledEmailScans, emailScanLogs,
  emailTemplates, InsertEmailTemplate,
  vendors, purchaseOrders, shipments,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createInboundEmail(input: InsertInboundEmail) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(inboundEmails).values(input);
  return { id: result[0].insertId };
}

export async function getInboundEmails(options?: {
  status?: string;
  category?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (options?.status) {
    conditions.push(eq(inboundEmails.parsingStatus, options.status as any));
  }
  
  if (options?.category) {
    conditions.push(eq(inboundEmails.category, options.category as any));
  }
  
  if (options?.priority) {
    conditions.push(eq(inboundEmails.priority, options.priority as any));
  }
  
  let query = db.select().from(inboundEmails);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);
}

export async function getInboundEmailById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(inboundEmails).where(eq(inboundEmails.id, id));
  return result[0] || null;
}

export async function updateInboundEmailStatus(
  id: number,
  status: "pending" | "processing" | "parsed" | "failed" | "reviewed" | "archived",
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updates: any = { parsingStatus: status };
  if (status === "parsed") {
    updates.parsedAt = new Date();
  }
  if (errorMessage) {
    updates.errorMessage = errorMessage;
  }
  
  await db.update(inboundEmails).set(updates).where(eq(inboundEmails.id, id));
}

export async function deleteInboundEmail(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete related documents first
  await db.delete(parsedDocuments).where(eq(parsedDocuments.emailId, id));
  // Delete related attachments
  await db.delete(emailAttachments).where(eq(emailAttachments.emailId, id));
  // Delete the email
  await db.delete(inboundEmails).where(eq(inboundEmails.id, id));
}

export async function createEmailAttachment(input: InsertEmailAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(emailAttachments).values(input);
  return { id: result[0].insertId };
}

export async function getEmailAttachments(emailId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(emailAttachments).where(eq(emailAttachments.emailId, emailId));
}

export async function updateAttachmentProcessed(id: number, extractedText?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(emailAttachments).set({
    isProcessed: true,
    extractedText: extractedText || null
  }).where(eq(emailAttachments.id, id));
}

// Auto-reply rules
export async function getAutoReplyRules(options?: { isEnabled?: boolean; category?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (options?.isEnabled !== undefined) {
    conditions.push(eq(autoReplyRules.isEnabled, options.isEnabled));
  }
  if (options?.category) {
    conditions.push(eq(autoReplyRules.category, options.category as any));
  }
  
  let query = db.select().from(autoReplyRules);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  return query.orderBy(desc(autoReplyRules.priority));
}

export async function getAutoReplyRuleById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(autoReplyRules).where(eq(autoReplyRules.id, id));
  return result[0] || null;
}

export async function createAutoReplyRule(input: {
  name: string;
  category: string;
  replyTemplate: string;
  senderPattern?: string;
  subjectPattern?: string;
  bodyKeywords?: string[];
  minConfidence?: string;
  replySubjectPrefix?: string;
  tone?: string;
  includeOriginal?: boolean;
  delayMinutes?: number;
  autoSend?: boolean;
  createTask?: boolean;
  notifyOwner?: boolean;
  priority?: number;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(autoReplyRules).values({
    ...input,
    category: input.category as any,
    tone: (input.tone || 'professional') as any,
    bodyKeywords: input.bodyKeywords ? JSON.stringify(input.bodyKeywords) : null,
  } as any);
  return { id: result[0].insertId };
}

export async function updateAutoReplyRule(id: number, updates: {
  name?: string;
  category?: string;
  isEnabled?: boolean;
  priority?: number;
  senderPattern?: string;
  subjectPattern?: string;
  bodyKeywords?: string[];
  minConfidence?: string;
  replyTemplate?: string;
  replySubjectPrefix?: string;
  tone?: string;
  includeOriginal?: boolean;
  delayMinutes?: number;
  autoSend?: boolean;
  createTask?: boolean;
  notifyOwner?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = { ...updates };
  if (updates.bodyKeywords) {
    updateData.bodyKeywords = JSON.stringify(updates.bodyKeywords);
  }
  
  await db.update(autoReplyRules).set(updateData).where(eq(autoReplyRules.id, id));
}

export async function deleteAutoReplyRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(autoReplyRules).where(eq(autoReplyRules.id, id));
}

export async function incrementAutoReplyRuleTriggered(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(autoReplyRules).set({
    timesTriggered: sql`${autoReplyRules.timesTriggered} + 1`,
    lastTriggeredAt: new Date(),
  }).where(eq(autoReplyRules.id, id));
}

// Sent emails tracking
export async function getSentEmails(options?: {
  relatedEntityType?: string;
  relatedEntityId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (options?.relatedEntityType) {
    conditions.push(eq(sentEmails.relatedEntityType, options.relatedEntityType));
  }
  if (options?.relatedEntityId) {
    conditions.push(eq(sentEmails.relatedEntityId, options.relatedEntityId));
  }
  if (options?.status) {
    conditions.push(eq(sentEmails.status, options.status as any));
  }
  
  let query = db.select().from(sentEmails);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  return query.orderBy(desc(sentEmails.createdAt)).limit(options?.limit || 100);
}

export async function getSentEmailById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sentEmails).where(eq(sentEmails.id, id));
  return result[0] || null;
}

export async function createSentEmail(input: {
  inboundEmailId?: number;
  relatedEntityType?: string;
  relatedEntityId?: number;
  toEmail: string;
  toName?: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  status?: string;
  sentBy?: number;
  aiGenerated?: boolean;
  aiTaskId?: number;
  threadId?: string;
  metadata?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(sentEmails).values({
    ...input,
    status: (input.status || 'queued') as any,
  } as any);
  return { id: result[0].insertId };
}

export async function updateSentEmailStatus(id: number, status: string, errorMessage?: string, messageId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updates: any = { status };
  if (status === 'sent') {
    updates.sentAt = new Date();
  } else if (status === 'delivered') {
    updates.deliveredAt = new Date();
  }
  if (errorMessage) updates.errorMessage = errorMessage;
  if (messageId) updates.messageId = messageId;
  
  await db.update(sentEmails).set(updates).where(eq(sentEmails.id, id));
}

export async function getEmailThread(threadId: string) {
  const db = await getDb();
  if (!db) return { inbound: [], outbound: [] };
  
  const inbound = await db.select().from(inboundEmails)
    .where(sql`JSON_EXTRACT(metadata, '$.threadId') = ${threadId}`)
    .orderBy(desc(inboundEmails.receivedAt));
  
  const outbound = await db.select().from(sentEmails)
    .where(eq(sentEmails.threadId, threadId))
    .orderBy(desc(sentEmails.createdAt));
  
  return { inbound, outbound };
}

export async function createParsedDocument(input: InsertParsedDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(parsedDocuments).values(input);
  return { id: result[0].insertId };
}

export async function getParsedDocuments(options?: {
  emailId?: number;
  documentType?: string;
  isReviewed?: boolean;
  isApproved?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (options?.emailId) {
    conditions.push(eq(parsedDocuments.emailId, options.emailId));
  }
  
  if (options?.documentType) {
    conditions.push(eq(parsedDocuments.documentType, options.documentType as any));
  }
  
  if (options?.isReviewed !== undefined) {
    conditions.push(eq(parsedDocuments.isReviewed, options.isReviewed));
  }
  
  if (options?.isApproved !== undefined) {
    conditions.push(eq(parsedDocuments.isApproved, options.isApproved));
  }
  
  let query = db.select().from(parsedDocuments);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(parsedDocuments.createdAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);
}

export async function getParsedDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(parsedDocuments).where(eq(parsedDocuments.id, id));
  return result[0] || null;
}

export async function updateParsedDocument(id: number, updates: Partial<InsertParsedDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set(updates).where(eq(parsedDocuments.id, id));
}

export async function approveParsedDocument(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({
    isReviewed: true,
    isApproved: true,
    reviewedBy: userId,
    reviewedAt: new Date()
  }).where(eq(parsedDocuments.id, id));
}

export async function rejectParsedDocument(id: number, userId: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({
    isReviewed: true,
    isApproved: false,
    reviewedBy: userId,
    reviewedAt: new Date(),
    notes: notes || null
  }).where(eq(parsedDocuments.id, id));
}

export async function createParsedDocumentLineItem(input: InsertParsedDocumentLineItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(parsedDocumentLineItems).values(input);
  return { id: result[0].insertId };
}

export async function getParsedDocumentLineItems(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(parsedDocumentLineItems)
    .where(eq(parsedDocumentLineItems.documentId, documentId))
    .orderBy(parsedDocumentLineItems.lineNumber);
}

export async function linkParsedDocumentToVendor(documentId: number, vendorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ vendorId }).where(eq(parsedDocuments.id, documentId));
}

export async function linkParsedDocumentToPO(documentId: number, purchaseOrderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ purchaseOrderId }).where(eq(parsedDocuments.id, documentId));
}

export async function linkParsedDocumentToShipment(documentId: number, shipmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ shipmentId }).where(eq(parsedDocuments.id, documentId));
}

export async function setCreatedTransaction(documentId: number, transactionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ createdTransactionId: transactionId }).where(eq(parsedDocuments.id, documentId));
}

export async function setCreatedVendor(documentId: number, vendorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parsedDocuments).set({ createdVendorId: vendorId, vendorId }).where(eq(parsedDocuments.id, documentId));
}

// Get email scanning statistics
export async function getEmailScanningStats() {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, parsed: 0, failed: 0, documents: 0 };
  
  const emails = await db.select({
    status: inboundEmails.parsingStatus,
    count: sql<number>`COUNT(*)`
  }).from(inboundEmails).groupBy(inboundEmails.parsingStatus);
  
  const docCount = await db.select({
    count: sql<number>`COUNT(*)`
  }).from(parsedDocuments);
  
  const stats = {
    total: 0,
    pending: 0,
    processing: 0,
    parsed: 0,
    failed: 0,
    reviewed: 0,
    documents: Number(docCount[0]?.count) || 0
  };
  
  for (const row of emails) {
    stats.total += Number(row.count);
    if (row.status === "pending") stats.pending = Number(row.count);
    if (row.status === "processing") stats.processing = Number(row.count);
    if (row.status === "parsed") stats.parsed = Number(row.count);
    if (row.status === "failed") stats.failed = Number(row.count);
    if (row.status === "reviewed") stats.reviewed = Number(row.count);
  }
  
  return stats;
}

// Update email categorization
export async function updateEmailCategorization(
  emailId: number,
  categorization: {
    category: string;
    categoryConfidence: string;
    categoryKeywords: string[];
    suggestedAction: string | null;
    priority: string;
    subcategory: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(inboundEmails).set({
    category: categorization.category as any,
    categoryConfidence: categorization.categoryConfidence,
    categoryKeywords: categorization.categoryKeywords,
    suggestedAction: categorization.suggestedAction,
    priority: categorization.priority as any,
    subcategory: categorization.subcategory,
  }).where(eq(inboundEmails.id, emailId));
}

// Get email category statistics
export async function getEmailCategoryStats() {
  const db = await getDb();
  if (!db) return { categories: [], priorities: [] };
  
  const categoryStats = await db.select({
    category: inboundEmails.category,
    count: sql<number>`COUNT(*)`
  }).from(inboundEmails).groupBy(inboundEmails.category);
  
  const priorityStats = await db.select({
    priority: inboundEmails.priority,
    count: sql<number>`COUNT(*)`
  }).from(inboundEmails).groupBy(inboundEmails.priority);
  
  return {
    categories: categoryStats.map(row => ({
      category: row.category || "general",
      count: Number(row.count)
    })),
    priorities: priorityStats.map(row => ({
      priority: row.priority || "medium",
      count: Number(row.count)
    }))
  };
}

// Find inbound email by message ID
export async function findInboundEmailByMessageId(messageId: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(inboundEmails)
    .where(eq(inboundEmails.messageId, messageId))
    .limit(1);
  
  return result[0] || null;
}

// Get uncategorized emails (category is null or 'general' with low confidence)
export async function getUncategorizedEmails(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(inboundEmails)
    .where(
      or(
        isNull(inboundEmails.category),
        and(
          eq(inboundEmails.category, "general"),
          or(
            isNull(inboundEmails.categoryConfidence),
            sql`CAST(${inboundEmails.categoryConfidence} AS DECIMAL) < 60`
          )
        )
      )
    )
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(limit);
  
  return result;
}



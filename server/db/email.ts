import { eq, and, or, desc, sql, lte, gte, isNull, count } from "drizzle-orm";
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

// ============================================
// EMAIL CREDENTIALS
// ============================================

export async function getEmailCredentials(userId?: number, companyId?: number) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(emailCredentials);
  const conditions = [];

  if (userId) conditions.push(eq(emailCredentials.userId, userId));
  if (companyId) conditions.push(eq(emailCredentials.companyId, companyId));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query.orderBy(desc(emailCredentials.createdAt));
}

export async function getEmailCredentialById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db.select().from(emailCredentials).where(eq(emailCredentials.id, id));
  return result || null;
}

export async function createEmailCredential(data: {
  userId: number;
  companyId?: number;
  name: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'custom';
  email: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUsername?: string;
  imapPassword?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scanFolder?: string;
  scanUnreadOnly?: boolean;
  markAsRead?: boolean;
  maxEmailsPerScan?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(emailCredentials).values(data);
  return { id: result.insertId };
}

export async function updateEmailCredential(id: number, data: Partial<{
  name: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scanFolder: string;
  scanUnreadOnly: boolean;
  markAsRead: boolean;
  maxEmailsPerScan: number;
  isActive: boolean;
  lastScanAt: Date;
  lastScanStatus: 'success' | 'failed' | 'partial';
  lastScanError: string | null;
  emailsScanned: number;
}>) {
  const db = await getDb();
  if (!db) return;

  await db.update(emailCredentials).set(data).where(eq(emailCredentials.id, id));
}

export async function deleteEmailCredential(id: number) {
  const db = await getDb();
  if (!db) return;

  await db.delete(scheduledEmailScans).where(eq(scheduledEmailScans.credentialId, id));
  await db.delete(emailScanLogs).where(eq(emailScanLogs.credentialId, id));
  await db.delete(emailCredentials).where(eq(emailCredentials.id, id));
}

// ============================================
// IMAP CREDENTIALS
// ============================================

export async function createImapCredential(data: InsertImapCredential) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(imapCredentials).values(data);
  return { id: result[0].insertId };
}

export async function getImapCredentials(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(imapCredentials)
    .where(eq(imapCredentials.userId, userId))
    .orderBy(desc(imapCredentials.createdAt));
}

export async function getImapCredentialById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(imapCredentials).where(eq(imapCredentials.id, id)).limit(1);
  return result[0] || null;
}

export async function updateImapCredential(id: number, data: Partial<InsertImapCredential>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(imapCredentials).set(data).where(eq(imapCredentials.id, id));
}

export async function deleteImapCredential(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(imapCredentials).where(eq(imapCredentials.id, id));
}

// ============================================
// SCHEDULED SCANS
// ============================================

export async function getScheduledScans(credentialId?: number) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(scheduledEmailScans);
  if (credentialId) {
    query = query.where(eq(scheduledEmailScans.credentialId, credentialId)) as typeof query;
  }

  return query.orderBy(desc(scheduledEmailScans.createdAt));
}

export async function createScheduledScan(data: {
  credentialId: number;
  companyId?: number;
  intervalMinutes?: number;
  isEnabled?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const nextRunAt = new Date(Date.now() + (data.intervalMinutes || 15) * 60 * 1000);

  const [result] = await db.insert(scheduledEmailScans).values({
    ...data,
    nextRunAt,
  });
  return { id: result.insertId };
}

export async function updateScheduledScan(id: number, data: Partial<{
  isEnabled: boolean;
  intervalMinutes: number;
  lastRunAt: Date;
  nextRunAt: Date;
  lastRunStatus: 'success' | 'failed' | 'running';
  lastRunError: string | null;
  lastRunEmailsFound: number;
  totalRuns: number;
  totalEmailsProcessed: number;
}>) {
  const db = await getDb();
  if (!db) return;

  await db.update(scheduledEmailScans).set(data).where(eq(scheduledEmailScans.id, id));
}

export async function deleteScheduledScan(id: number) {
  const db = await getDb();
  if (!db) return;

  await db.delete(scheduledEmailScans).where(eq(scheduledEmailScans.id, id));
}

export async function getScanLogs(credentialId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(emailScanLogs)
    .where(eq(emailScanLogs.credentialId, credentialId))
    .orderBy(desc(emailScanLogs.startedAt))
    .limit(limit);
}

// ============================================
// EMAIL TEMPLATES
// ============================================

export async function createEmailTemplate(data: InsertEmailTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailTemplates).values(data as any);
  return { id: result[0].insertId, ...data };
}

export async function getEmailTemplates(filters?: { templateType?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(emailTemplates);
  const conditions = [];
  if (filters?.templateType) conditions.push(eq(emailTemplates.templateType, filters.templateType as any));
  if (filters?.isActive !== undefined) conditions.push(eq(emailTemplates.isActive, filters.isActive));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(emailTemplates.createdAt));
}

export async function updateEmailTemplate(id: number, data: Partial<{
  name: string;
  subject: string;
  bodyTemplate: string;
  isDefault: boolean;
  isActive: boolean;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailTemplates).set(data as any).where(eq(emailTemplates.id, id));
}

// ============================================
// EMAIL EVENTS (Webhook tracking)
// ============================================

export async function createEmailEvent(data: {
  messageId?: number;
  providerMessageId?: string;
  eventType: string;
  eventData?: any;
  provider?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sentEmails).values({
    toEmail: '',
    fromEmail: '',
    subject: `event:${data.eventType}`,
    status: 'sent' as any,
    messageId: data.providerMessageId,
    metadata: JSON.stringify({ eventType: data.eventType, eventData: data.eventData, provider: data.provider, linkedMessageId: data.messageId }),
  } as any);
  return { id: result[0].insertId };
}

export async function getEmailEventsByMessageId(messageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sentEmails)
    .where(sql`JSON_EXTRACT(metadata, '$.linkedMessageId') = ${messageId}`)
    .orderBy(desc(sentEmails.createdAt));
}

export async function getEmailEventsByProviderMessageId(providerMessageId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sentEmails)
    .where(eq(sentEmails.messageId, providerMessageId))
    .orderBy(desc(sentEmails.createdAt));
}

export async function getRecentEmailEvents(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sentEmails)
    .where(sql`JSON_EXTRACT(metadata, '$.eventType') IS NOT NULL`)
    .orderBy(desc(sentEmails.createdAt))
    .limit(limit);
}

// ============================================
// EMAIL MESSAGES
// ============================================

export async function createEmailMessage(data: {
  toEmail: string;
  toName?: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  status?: string;
  sentBy?: number;
  idempotencyKey?: string;
  providerMessageId?: string;
  metadata?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sentEmails).values({
    ...data,
    status: (data.status || 'queued') as any,
    messageId: data.providerMessageId,
  } as any);
  return { id: result[0].insertId };
}

export async function getEmailMessages(filters?: { status?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) conditions.push(eq(sentEmails.status, filters.status as any));

  let query = db.select().from(sentEmails);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  return query.orderBy(desc(sentEmails.createdAt)).limit(filters?.limit || 100);
}

export async function getEmailMessageById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(sentEmails).where(eq(sentEmails.id, id)).limit(1);
  return result[0] || null;
}

export async function getEmailMessageByIdempotencyKey(key: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(sentEmails)
    .where(sql`JSON_EXTRACT(metadata, '$.idempotencyKey') = ${key}`)
    .limit(1);
  return result[0] || null;
}

export async function getEmailMessageByProviderMessageId(providerMessageId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(sentEmails)
    .where(eq(sentEmails.messageId, providerMessageId))
    .limit(1);
  return result[0] || null;
}

export async function getEmailMessageStats() {
  const db = await getDb();
  if (!db) return { total: 0, sent: 0, delivered: 0, failed: 0, queued: 0 };

  const stats = await db.select({
    status: sentEmails.status,
    count: count(),
  }).from(sentEmails).groupBy(sentEmails.status);

  const result = { total: 0, sent: 0, delivered: 0, failed: 0, queued: 0 };
  for (const row of stats) {
    const c = Number(row.count);
    result.total += c;
    if (row.status === 'sent') result.sent = c;
    else if (row.status === 'delivered') result.delivered = c;
    else if (row.status === 'failed') result.failed = c;
    else if (row.status === 'queued') result.queued = c;
  }
  return result;
}

export async function getQueuedEmailMessages(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sentEmails)
    .where(eq(sentEmails.status, 'queued' as any))
    .orderBy(sentEmails.createdAt)
    .limit(limit);
}

export async function updateEmailMessage(id: number, data: Partial<{
  status: string;
  messageId: string;
  sentAt: Date;
  deliveredAt: Date;
  errorMessage: string;
  metadata: any;
}>) {
  const db = await getDb();
  if (!db) return;
  await db.update(sentEmails).set(data as any).where(eq(sentEmails.id, id));
}

export async function updateEmailMessageStatus(id: number, status: string, errorMessage?: string) {
  const db = await getDb();
  if (!db) return;

  const updates: any = { status };
  if (status === 'sent') updates.sentAt = new Date();
  else if (status === 'delivered') updates.deliveredAt = new Date();
  if (errorMessage) updates.errorMessage = errorMessage;

  await db.update(sentEmails).set(updates).where(eq(sentEmails.id, id));
}

export async function incrementEmailMessageRetry(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(sentEmails).set({
    status: 'queued' as any,
  }).where(eq(sentEmails.id, id));
}

// ============================================
// TRANSACTIONAL EMAIL TEMPLATES
// ============================================

export async function createTransactionalEmailTemplate(data: {
  name: string;
  subject: string;
  bodyTemplate: string;
  description?: string;
  variables?: string[];
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailTemplates).values({
    name: data.name,
    subject: data.subject,
    bodyTemplate: data.bodyTemplate,
    templateType: 'transactional' as any,
    isActive: data.isActive ?? true,
  } as any);
  return { id: result[0].insertId };
}

export async function getTransactionalEmailTemplates(filters?: { isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(emailTemplates.templateType, 'transactional' as any)];
  if (filters?.isActive !== undefined) conditions.push(eq(emailTemplates.isActive, filters.isActive));
  return db.select().from(emailTemplates).where(and(...conditions)).orderBy(desc(emailTemplates.createdAt));
}

export async function getTransactionalEmailTemplateById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.templateType, 'transactional' as any)))
    .limit(1);
  return result[0] || null;
}

export async function getTransactionalEmailTemplateByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(emailTemplates)
    .where(and(eq(emailTemplates.name, name), eq(emailTemplates.templateType, 'transactional' as any)))
    .limit(1);
  return result[0] || null;
}

export async function updateTransactionalEmailTemplate(id: number, data: Partial<{
  name: string;
  subject: string;
  bodyTemplate: string;
  description: string;
  isActive: boolean;
}>) {
  const db = await getDb();
  if (!db) return;
  await db.update(emailTemplates).set(data as any).where(
    and(eq(emailTemplates.id, id), eq(emailTemplates.templateType, 'transactional' as any))
  );
}

export async function deleteTransactionalEmailTemplate(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(emailTemplates).where(
    and(eq(emailTemplates.id, id), eq(emailTemplates.templateType, 'transactional' as any))
  );
}

// ============================================
// EMAIL ATTACHMENT & CATEGORY UPDATES
// ============================================

export async function updateEmailAttachment(id: number, data: Partial<{
  extractedText: string;
  metadata: any;
  isProcessed: boolean;
}>) {
  const db = await getDb();
  if (!db) return;

  await db.update(emailAttachments).set(data).where(eq(emailAttachments.id, id));
}

export async function updateEmailCategory(id: number, data: {
  category: 'receipt' | 'purchase_order' | 'invoice' | 'shipping_confirmation' | 'freight_quote' | 'delivery_notification' | 'order_confirmation' | 'payment_confirmation' | 'general';
  categoryConfidence?: string;
  priority?: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}) {
  const db = await getDb();
  if (!db) return;

  await db.update(inboundEmails).set(data).where(eq(inboundEmails.id, id));
}

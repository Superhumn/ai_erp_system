import { eq, and, or, desc, sql, lt, count } from "drizzle-orm";
import {
  auditLogs, InsertAuditLog,
  notifications, notificationPreferences,
  integrationConfigs,
  alerts, InsertAlert, recommendations, InsertRecommendation,
  syncLogs,
  rawMaterialInventory,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data);
}

export async function getAuditLogs(filters?: { companyId?: number; entityType?: string; entityId?: number; userId?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(auditLogs.companyId, filters.companyId));
  if (filters?.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  if (filters?.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
  if (filters?.userId) conditions.push(eq(auditLogs.userId, filters.userId));
  
  if (conditions.length > 0) {
    return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(100);
  }
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
}

export async function getIntegrationConfigs(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(integrationConfigs).where(eq(integrationConfigs.companyId, companyId));
  }
  return db.select().from(integrationConfigs);
}

export async function createIntegrationConfig(data: typeof integrationConfigs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(integrationConfigs).values(data);
  return { id: result[0].insertId };
}

export async function updateIntegrationConfig(id: number, data: Partial<typeof integrationConfigs.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(integrationConfigs).set(data).where(eq(integrationConfigs.id, id));
}

export async function createAlert(data: Omit<InsertAlert, 'alertNumber'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const alertNumber = `ALT-${Date.now().toString(36).toUpperCase()}`;
  const result = await db.insert(alerts).values({ ...data, alertNumber });
  return { id: result[0].insertId, alertNumber };
}

export async function getAlerts(filters?: { type?: string; status?: string; severity?: string; assignedTo?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.type) conditions.push(eq(alerts.type, filters.type as any));
  if (filters?.status) conditions.push(eq(alerts.status, filters.status as any));
  if (filters?.severity) conditions.push(eq(alerts.severity, filters.severity as any));
  if (filters?.assignedTo) conditions.push(eq(alerts.assignedTo, filters.assignedTo));
  
  return db.select().from(alerts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(alerts.createdAt));
}

export async function getAlertById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return result[0];
}

export async function updateAlert(id: number, data: Partial<InsertAlert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set(data).where(eq(alerts.id, id));
}

export async function acknowledgeAlert(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({
    status: 'acknowledged',
    acknowledgedBy: userId,
    acknowledgedAt: new Date()
  }).where(eq(alerts.id, id));
}

export async function resolveAlert(id: number, userId: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({
    status: 'resolved',
    resolvedBy: userId,
    resolvedAt: new Date(),
    resolutionNotes: notes
  }).where(eq(alerts.id, id));
}

// Generate low stock alerts
export async function generateLowStockAlerts() {
  const { getRawMaterialById } = await import("./manufacturing");
  const db = await getDb();
  if (!db) return [];
  
  // Check raw materials below reorder point
  const lowStockMaterials = await db.select().from(rawMaterialInventory)
    .where(sql`${rawMaterialInventory.quantity} <= ${rawMaterialInventory.reorderPoint}`);
  
  const createdAlerts: number[] = [];
  
  for (const material of lowStockMaterials) {
    // Check if alert already exists
    const existing = await db.select().from(alerts)
      .where(and(
        eq(alerts.type, 'low_stock'),
        eq(alerts.entityType, 'raw_material'),
        eq(alerts.entityId, material.rawMaterialId),
        eq(alerts.status, 'open')
      ))
      .limit(1);
    
    if (!existing[0]) {
      const rawMat = await getRawMaterialById(material.rawMaterialId);
      const { id } = await createAlert({
        type: 'low_stock',
        severity: parseFloat(material.quantity) === 0 ? 'critical' : 'warning',
        title: `Low stock: ${rawMat?.name || 'Unknown material'}`,
        description: `Current quantity (${material.quantity}) is at or below reorder point (${material.reorderPoint})`,
        entityType: 'raw_material',
        entityId: material.rawMaterialId,
        thresholdValue: material.reorderPoint || '0',
        actualValue: material.quantity,
        autoGenerated: true
      });
      createdAlerts.push(id);
    }
  }
  
  return createdAlerts;
}

// Recommendations
export async function createRecommendation(data: InsertRecommendation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(recommendations).values(data);
  return { id: result[0].insertId };
}

export async function getRecommendations(filters?: { status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(recommendations.status, filters.status as any));
  if (filters?.type) conditions.push(eq(recommendations.type, filters.type as any));
  
  return db.select().from(recommendations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recommendations.createdAt));
}

export async function approveRecommendation(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(recommendations).set({
    status: 'approved',
    approvedBy: userId,
    approvedAt: new Date()
  }).where(eq(recommendations.id, id));
}

export async function rejectRecommendation(id: number, userId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(recommendations).set({
    status: 'rejected',
    rejectedBy: userId,
    rejectedAt: new Date(),
    rejectionReason: reason
  }).where(eq(recommendations.id, id));
}

export async function createSyncLog(data: {
  integration: string;
  action: string;
  status: 'success' | 'error' | 'warning' | 'pending';
  details?: string;
  recordsProcessed?: number;
  recordsFailed?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(syncLogs).values({
    integration: data.integration,
    action: data.action,
    status: data.status,
    details: data.details || null,
    recordsProcessed: data.recordsProcessed || null,
    recordsFailed: data.recordsFailed || null,
    errorMessage: data.errorMessage || null,
    metadata: data.metadata || null,
  });
  return { id: result.insertId };
}

export async function getSyncHistory(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select()
    .from(syncLogs)
    .orderBy(desc(syncLogs.createdAt))
    .limit(limit);
}

export async function clearSyncHistory() {
  const db = await getDb();
  if (!db) return;
  await db.delete(syncLogs);
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

export type NotificationType = 
  | "shipping_update" | "inventory_low" | "inventory_received" | "inventory_adjustment"
  | "po_approved" | "po_shipped" | "po_received" | "po_fulfilled"
  | "work_order_started" | "work_order_completed" | "work_order_shortage"
  | "sales_order_new" | "sales_order_shipped" | "sales_order_delivered"
  | "alert" | "system" | "info" | "warning" | "error" | "success" | "reminder";

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  severity?: "info" | "warning" | "critical";
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    severity: input.severity || "info",
    link: input.link,
    metadata: input.metadata,
    isRead: false,
  });
  
  return result.insertId;
}

export async function createNotificationsForAllUsers(
  input: Omit<CreateNotificationInput, "userId">,
  userIds: number[]
) {
  const db = await getDb();
  if (!db || userIds.length === 0) return [];
  
  const notificationValues = userIds.map(userId => ({
    userId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    severity: input.severity || "info" as const,
    link: input.link,
    metadata: input.metadata,
    isRead: false,
  }));
  
  await db.insert(notifications).values(notificationValues);
  return notificationValues.length;
}

export async function getUserNotifications(userId: number, options?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(notifications.userId, userId)];
  if (options?.unreadOnly) {
    conditions.push(eq(notifications.isRead, false));
  }
  
  return db.select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    ));
  
  return result?.count || 0;
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId)
    ));
  
  return true;
}

export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    ));
  
  return true;
}

export async function deleteNotification(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(notifications)
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId)
    ));
  
  return true;
}

export async function deleteOldNotifications(daysOld: number = 30) {
  const db = await getDb();
  if (!db) return 0;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const [result] = await db.delete(notifications)
    .where(lt(notifications.createdAt, cutoffDate));
  
  return result.affectedRows || 0;
}

// Notification preferences
export async function getUserNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
}

export async function updateNotificationPreference(
  userId: number,
  notificationType: string,
  settings: { inApp?: boolean; email?: boolean; push?: boolean }
) {
  const db = await getDb();
  if (!db) return false;
  
  // Check if preference exists
  const existing = await db.select()
    .from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.notificationType, notificationType)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    await db.update(notificationPreferences)
      .set(settings)
      .where(and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.notificationType, notificationType)
      ));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      notificationType,
      inApp: settings.inApp ?? true,
      email: settings.email ?? false,
      push: settings.push ?? false,
    });
  }
  
  return true;
}

// Helper to check if user should receive notification
export async function shouldNotifyUser(userId: number, notificationType: string, channel: "inApp" | "email" | "push") {
  const db = await getDb();
  if (!db) return channel === "inApp"; // Default to in-app only
  
  const [pref] = await db.select()
    .from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.notificationType, notificationType)
    ))
    .limit(1);
  
  if (!pref) return channel === "inApp"; // Default to in-app only
  
  return pref[channel] ?? false;
}

// Bulk notification creation for events
export async function notifyUsersOfEvent(
  event: {
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: number;
    severity?: "info" | "warning" | "critical";
    link?: string;
    metadata?: Record<string, unknown>;
  },
  userIds: number[]
) {
  const db = await getDb();
  if (!db || userIds.length === 0) return { inApp: 0, email: 0 };
  
  let inAppCount = 0;
  let emailCount = 0;
  
  for (const userId of userIds) {
    const shouldInApp = await shouldNotifyUser(userId, event.type, "inApp");
    const shouldEmail = await shouldNotifyUser(userId, event.type, "email");
    
    if (shouldInApp) {
      await createNotification({ ...event, userId });
      inAppCount++;
    }
    
    if (shouldEmail) {
      emailCount++;
      try {
        const { sendEmail, isEmailConfigured, formatEmailHtml } = await import("../_core/email");
        if (isEmailConfigured()) {
          const { getUserById } = await import("./auth");
          const user = await getUserById(userId);
          if (user?.email) {
            await sendEmail({
              to: user.email,
              subject: `[${event.severity || 'info'}] ${event.title}`,
              html: formatEmailHtml(
                `${event.title}\n\n${event.message}${event.link ? `\n\nView details: ${event.link}` : ""}`
              ),
              text: `${event.title}\n\n${event.message}${event.link ? `\n\nView details: ${event.link}` : ""}`,
            });
          }
        }
      } catch (emailErr) {
        console.warn("[Notification] Failed to send email notification:", emailErr);
      }
    }
  }
  
  return { inApp: inAppCount, email: emailCount };
}

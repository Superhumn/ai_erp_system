/**
 * GDPR Compliance Service
 * Provides Data Subject Access Request (DSAR) export and
 * Right to Erasure (Right to be Forgotten) functionality.
 */
import { getDb } from "./db";
import * as db from "./db";
import {
  users,
  localAuthCredentials,
  aiConversations,
  aiMessages,
  aiAgentTasks,
  aiAgentLogs,
  auditLogs,
  sentEmails,
  orders,
  invoices,
  teamInvitations,
  userPermissions,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { encrypt } from "./_core/crypto";

// ============================================
// DATA SUBJECT ACCESS REQUEST (DSAR)
// ============================================

export interface DsarExportResult {
  exportedAt: string;
  dataSubject: {
    userId: number;
    email?: string;
    name?: string;
  };
  sections: Record<string, any>;
  metadata: {
    totalRecords: number;
    sections: string[];
  };
}

/**
 * Export all personal data for a given user (DSAR).
 * Returns a structured object with all data categories.
 */
export async function exportUserData(userId: number): Promise<DsarExportResult> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const sections: Record<string, any> = {};
  let totalRecords = 0;

  // 1. User profile
  const user = await db.getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  sections.profile = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    loginMethod: user.loginMethod,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
    linkedVendorId: user.linkedVendorId,
    linkedWarehouseId: user.linkedWarehouseId,
  };
  totalRecords++;

  // 2. Authentication credentials (metadata only, not password hashes)
  if (user.email) {
    const authCreds = await database
      .select({
        email: localAuthCredentials.email,
        createdAt: localAuthCredentials.createdAt,
        updatedAt: localAuthCredentials.updatedAt,
      })
      .from(localAuthCredentials)
      .where(eq(localAuthCredentials.openId, user.openId))
      .limit(1);
    if (authCreds.length > 0) {
      sections.authentication = {
        email: authCreds[0].email,
        createdAt: authCreds[0].createdAt,
        updatedAt: authCreds[0].updatedAt,
        note: "Password hashes are not included for security reasons.",
      };
      totalRecords++;
    }
  }

  // 3. Permissions
  const permissions = await db.getUserPermissions(userId);
  if (permissions.length > 0) {
    sections.permissions = permissions.map((p: any) => ({
      permission: p.permission,
      grantedBy: p.grantedBy,
      grantedAt: p.grantedAt,
    }));
    totalRecords += permissions.length;
  }

  // 4. AI conversations and messages
  const conversations = await db.getAiConversations(userId);
  if (conversations.length > 0) {
    const conversationsWithMessages = [];
    for (const convo of conversations) {
      const messages = await db.getAiMessages(convo.id);
      conversationsWithMessages.push({
        id: convo.id,
        title: convo.title,
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
        messageCount: messages.length,
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
      totalRecords += messages.length;
    }
    sections.aiConversations = conversationsWithMessages;
    totalRecords += conversations.length;
  }

  // 5. Audit logs (actions by this user)
  const userAuditLogs = await db.getAuditLogs({ userId });
  if (userAuditLogs.length > 0) {
    sections.auditLogs = userAuditLogs.map((log: any) => ({
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      entityName: log.entityName,
      createdAt: log.createdAt,
      ipAddress: log.ipAddress,
    }));
    totalRecords += userAuditLogs.length;
  }

  // 6. Sent emails (by this user)
  const userEmails = await database
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.sentBy, userId));
  if (userEmails.length > 0) {
    sections.sentEmails = userEmails.map((e: any) => ({
      toEmail: e.toEmail,
      subject: e.subject,
      sentAt: e.sentAt,
      status: e.status,
    }));
    totalRecords += userEmails.length;
  }

  // 7. Team invitations (sent by or for this user)
  if (user.email) {
    const invitations = await database
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.email, user.email));
    if (invitations.length > 0) {
      sections.teamInvitations = invitations.map((inv: any) => ({
        email: inv.email,
        role: inv.role,
        status: inv.status,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      }));
      totalRecords += invitations.length;
    }
  }

  const sectionNames = Object.keys(sections);

  return {
    exportedAt: new Date().toISOString(),
    dataSubject: {
      userId: user.id,
      email: user.email || undefined,
      name: user.name || undefined,
    },
    sections,
    metadata: {
      totalRecords,
      sections: sectionNames,
    },
  };
}

// ============================================
// RIGHT TO ERASURE (RIGHT TO BE FORGOTTEN)
// ============================================

export interface ErasureResult {
  erasedAt: string;
  userId: number;
  sectionsErased: string[];
  recordsDeleted: number;
  errors: string[];
  retainedData: string[];
}

/**
 * Delete/anonymize all personal data for a user.
 * Some data is anonymized rather than deleted to maintain referential integrity
 * and legitimate business record-keeping (e.g., financial records, audit trails).
 *
 * IMPORTANT: This should only be called by admins or the user themselves,
 * after proper identity verification.
 */
export async function eraseUserData(
  userId: number,
  requestedBy: number
): Promise<ErasureResult> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const user = await db.getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const sectionsErased: string[] = [];
  const retainedData: string[] = [];
  const errors: string[] = [];
  let recordsDeleted = 0;

  // 1. Delete AI conversations and messages
  try {
    const conversations = await db.getAiConversations(userId);
    for (const convo of conversations) {
      await database.delete(aiMessages).where(eq(aiMessages.conversationId, convo.id));
      recordsDeleted++;
    }
    await database.delete(aiConversations).where(eq(aiConversations.userId, userId));
    recordsDeleted += conversations.length;
    if (conversations.length > 0) sectionsErased.push("aiConversations");
  } catch (e: any) {
    errors.push(`AI conversations: ${e.message}`);
  }

  // 2. Delete user permissions
  try {
    const permissions = await db.getUserPermissions(userId);
    if (permissions.length > 0) {
      await database.delete(userPermissions).where(eq(userPermissions.userId, userId));
      recordsDeleted += permissions.length;
      sectionsErased.push("permissions");
    }
  } catch (e: any) {
    errors.push(`Permissions: ${e.message}`);
  }

  // 3. Delete local auth credentials
  try {
    if (user.openId) {
      const result = await database
        .delete(localAuthCredentials)
        .where(eq(localAuthCredentials.openId, user.openId));
      recordsDeleted++;
      sectionsErased.push("authCredentials");
    }
  } catch (e: any) {
    errors.push(`Auth credentials: ${e.message}`);
  }

  // 4. Anonymize audit logs (retain for compliance but remove PII)
  try {
    const userLogs = await db.getAuditLogs({ userId });
    if (userLogs.length > 0) {
      await database
        .update(auditLogs)
        .set({ ipAddress: null, userAgent: null })
        .where(eq(auditLogs.userId, userId));
      retainedData.push("auditLogs (anonymized - IP/userAgent removed, action records retained for compliance)");
    }
  } catch (e: any) {
    errors.push(`Audit logs: ${e.message}`);
  }

  // 5. Anonymize sent emails (remove personal references but keep business records)
  try {
    const userEmails = await database
      .select()
      .from(sentEmails)
      .where(eq(sentEmails.sentBy, userId));
    if (userEmails.length > 0) {
      retainedData.push("sentEmails (retained as business records with user reference)");
    }
  } catch (e: any) {
    errors.push(`Sent emails: ${e.message}`);
  }

  // 6. Anonymize user profile (keep record but remove PII)
  try {
    await database
      .update(users)
      .set({
        name: `[Deleted User ${userId}]`,
        email: null,
        phone: null,
        avatarUrl: null,
        isActive: false,
      })
      .where(eq(users.id, userId));
    recordsDeleted++;
    sectionsErased.push("userProfile (anonymized)");
  } catch (e: any) {
    errors.push(`User profile: ${e.message}`);
  }

  // 7. Log the erasure action itself (for compliance)
  try {
    await db.createAuditLog({
      userId: requestedBy,
      action: "delete",
      entityType: "user_data_erasure",
      entityId: userId,
      entityName: `GDPR erasure for user ${userId}`,
      newValues: JSON.stringify({
        sectionsErased,
        recordsDeleted,
        retainedData,
        errors: errors.length > 0 ? errors : undefined,
      }),
    });
  } catch (e: any) {
    errors.push(`Audit log creation: ${e.message}`);
  }

  return {
    erasedAt: new Date().toISOString(),
    userId,
    sectionsErased,
    recordsDeleted,
    errors,
    retainedData,
  };
}

// ============================================
// DATA INVENTORY SUMMARY
// ============================================

/**
 * Get a summary of what personal data is stored for a user.
 * Useful for transparency and pre-deletion review.
 */
export async function getUserDataSummary(userId: number): Promise<{
  userId: number;
  dataCategories: Array<{ category: string; recordCount: number; description: string }>;
}> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const categories: Array<{ category: string; recordCount: number; description: string }> = [];

  // Profile
  const user = await db.getUserById(userId);
  if (user) {
    categories.push({
      category: "profile",
      recordCount: 1,
      description: "User profile including name, email, phone, role",
    });
  }

  // AI conversations
  const conversations = await db.getAiConversations(userId);
  if (conversations.length > 0) {
    let messageCount = 0;
    for (const convo of conversations) {
      const msgs = await db.getAiMessages(convo.id);
      messageCount += msgs.length;
    }
    categories.push({
      category: "aiConversations",
      recordCount: conversations.length,
      description: `${conversations.length} conversations with ${messageCount} messages`,
    });
  }

  // Audit logs
  const logs = await db.getAuditLogs({ userId });
  if (logs.length > 0) {
    categories.push({
      category: "auditLogs",
      recordCount: logs.length,
      description: "Activity audit trail (will be anonymized, not deleted)",
    });
  }

  // Sent emails
  const emails = await database
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.sentBy, userId));
  if (emails.length > 0) {
    categories.push({
      category: "sentEmails",
      recordCount: emails.length,
      description: "Emails sent through the system (retained as business records)",
    });
  }

  // Permissions
  const permissions = await db.getUserPermissions(userId);
  if (permissions.length > 0) {
    categories.push({
      category: "permissions",
      recordCount: permissions.length,
      description: "User permission grants",
    });
  }

  return { userId, dataCategories: categories };
}

import { eq, and, desc, inArray } from "drizzle-orm";
import {
  users, InsertUser, localAuthCredentials, InsertLocalAuthCredential,
  companies, InsertCompany,
  googleOAuthTokens, InsertGoogleOAuthToken,
  quickbooksOAuthTokens, InsertQuickBooksOAuthToken,
  teamInvitations, InsertTeamInvitation,
  userPermissions, InsertUserPermission,
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { ENV } from '../_core/env';

// ============================================
// USER MANAGEMENT
// ============================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}


export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: InsertUser['role']) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ============================================
// LOCAL AUTH CREDENTIALS
// ============================================

export async function getUserByEmail(email: string) {
    const db = await getDb();
    if (!db) {
          console.warn("[Database] Cannot get user: database not available");
          return undefined;
    }

    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getLocalAuthCredentialByEmail(email: string) {
    const db = await getDb();
    if (!db) {
          console.warn("[Database] Cannot get local auth credential: database not available");
          return undefined;
    }

    const result = await db.select().from(localAuthCredentials).where(eq(localAuthCredentials.email, email)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getLocalAuthCredentialByOpenId(openId: string) {
    const db = await getDb();
    if (!db) {
          console.warn("[Database] Cannot get local auth credential: database not available");
          return undefined;
    }

    const result = await db.select().from(localAuthCredentials).where(eq(localAuthCredentials.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function createLocalAuthCredential(credential: InsertLocalAuthCredential) {
    const db = await getDb();
    if (!db) {
          throw new Error("[Database] Cannot create local auth credential: database not available");
    }

    await db.insert(localAuthCredentials).values(credential);
}

export async function updateLocalAuthCredential(openId: string, updates: Partial<InsertLocalAuthCredential>) {
    const db = await getDb();
    if (!db) {
          throw new Error("[Database] Cannot update local auth credential: database not available");
    }

    await db.update(localAuthCredentials).set(updates).where(eq(localAuthCredentials.openId, openId));
}

// ============================================
// COMPANY MANAGEMENT
// ============================================

export async function getCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).orderBy(desc(companies.createdAt));
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0];
}

export async function createCompany(data: InsertCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(companies).values(data);
  return { id: result[0].insertId };
}

export async function updateCompany(id: number, data: Partial<InsertCompany>) {
  const db = await getDb();
  if (!db) return;
  await db.update(companies).set(data).where(eq(companies.id, id));
}

// ============================================
// GOOGLE OAUTH TOKENS
// ============================================

export async function getGoogleOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(googleOAuthTokens).where(eq(googleOAuthTokens.userId, userId)).limit(1);
  return result[0];
}

export async function upsertGoogleOAuthToken(data: InsertGoogleOAuthToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if token exists for this user
  const existing = await getGoogleOAuthToken(data.userId);

  if (existing) {
    // Update existing token
    await db.update(googleOAuthTokens)
      .set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? existing.refreshToken,
        expiresAt: data.expiresAt,
        scope: data.scope,
        googleEmail: data.googleEmail,
      })
      .where(eq(googleOAuthTokens.userId, data.userId));
    return { id: existing.id };
  } else {
    // Insert new token
    const result = await db.insert(googleOAuthTokens).values(data);
    return { id: result[0].insertId };
  }
}

export async function deleteGoogleOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(googleOAuthTokens).where(eq(googleOAuthTokens.userId, userId));
}

// QuickBooks OAuth token management
export async function getQuickBooksOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(quickbooksOAuthTokens).where(eq(quickbooksOAuthTokens.userId, userId)).limit(1);
  return result[0];
}

export async function upsertQuickBooksOAuthToken(data: InsertQuickBooksOAuthToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if token exists for this user
  const existing = await getQuickBooksOAuthToken(data.userId);

  if (existing) {
    // Update existing token
    // Note: QuickBooks always returns a new refresh token on token refresh
    await db.update(quickbooksOAuthTokens)
      .set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? existing.refreshToken, // Use existing only if new one not provided
        expiresAt: data.expiresAt,
        scope: data.scope,
        realmId: data.realmId,
      })
      .where(eq(quickbooksOAuthTokens.userId, data.userId));
    return { id: existing.id };
  } else {
    // Insert new token
    const result = await db.insert(quickbooksOAuthTokens).values(data);
    return { id: result[0].insertId };
  }
}

export async function deleteQuickBooksOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(quickbooksOAuthTokens).where(eq(quickbooksOAuthTokens.userId, userId));
}

// ============================================
// TEAM & PERMISSION MANAGEMENT
// ============================================

// Default permissions by role
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'], // All permissions
  finance: [
    'accounts.*', 'invoices.*', 'payments.*', 'transactions.*',
    'customers.read', 'vendors.read', 'reports.finance'
  ],
  ops: [
    'products.*', 'inventory.*', 'orders.*', 'purchase_orders.*',
    'shipments.*', 'warehouses.*', 'vendors.*', 'transfers.*'
  ],
  legal: [
    'contracts.*', 'disputes.*', 'documents.*',
    'customers.read', 'vendors.read', 'employees.read'
  ],
  exec: [
    'dashboard.*', 'reports.*', 'ai.*',
    'customers.read', 'vendors.read', 'employees.read',
    'invoices.read', 'orders.read', 'projects.read'
  ],
  copacker: [
    'inventory.read', 'inventory.update',
    'shipments.read', 'shipments.upload_documents',
    'warehouses.read_own'
  ],
  vendor: [
    'purchase_orders.read_own', 'purchase_orders.update_status',
    'shipments.read_own', 'shipments.upload_documents',
    'invoices.read_own'
  ],
  contractor: [
    'projects.read_assigned', 'projects.update_assigned',
    'documents.read_own', 'documents.upload'
  ],
  user: [
    'dashboard.read', 'ai.query'
  ]
};

export async function getTeamMembers() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getTeamMemberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateTeamMember(id: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) return;

  await db.update(users).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUsersByRoles(roles: string[]) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(
    and(
      inArray(users.role, roles as typeof users.role.enumValues),
      eq(users.isActive, true)
    )
  );
}

export async function deactivateTeamMember(id: number) {
  const db = await getDb();
  if (!db) return;

  await db.update(users).set({
    isActive: false,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
}

export async function reactivateTeamMember(id: number) {
  const db = await getDb();
  if (!db) return;

  await db.update(users).set({
    isActive: true,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
}

// Team Invitations
export async function createTeamInvitation(data: Omit<InsertTeamInvitation, 'inviteCode'>) {
  const db = await getDb();
  if (!db) return null;

  const inviteCode = `INV-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()}`;

  const result = await db.insert(teamInvitations).values({
    ...data,
    inviteCode,
  });

  return { id: result[0].insertId, inviteCode };
}

export async function getTeamInvitations() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(teamInvitations).orderBy(desc(teamInvitations.createdAt));
}

export async function getTeamInvitationByCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(teamInvitations)
    .where(eq(teamInvitations.inviteCode, inviteCode))
    .limit(1);
  return result[0];
}

export async function acceptTeamInvitation(inviteCode: string, userId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  const invitation = await getTeamInvitationByCode(inviteCode);
  if (!invitation) {
    return { success: false, error: 'Invalid invitation code' };
  }

  if (invitation.status !== 'pending') {
    return { success: false, error: 'Invitation is no longer valid' };
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    await db.update(teamInvitations).set({ status: 'expired' })
      .where(eq(teamInvitations.id, invitation.id));
    return { success: false, error: 'Invitation has expired' };
  }

  // Update invitation
  await db.update(teamInvitations).set({
    status: 'accepted',
    acceptedAt: new Date(),
    acceptedByUserId: userId,
  }).where(eq(teamInvitations.id, invitation.id));

  // Update user with role and linked entities
  await db.update(users).set({
    role: invitation.role,
    linkedVendorId: invitation.linkedVendorId,
    linkedWarehouseId: invitation.linkedWarehouseId,
    invitedBy: invitation.invitedBy,
    invitedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  // Add custom permissions if specified
  if (invitation.customPermissions) {
    const permissions = JSON.parse(invitation.customPermissions) as string[];
    for (const permission of permissions) {
      await db.insert(userPermissions).values({
        userId,
        permission,
        grantedBy: invitation.invitedBy,
      });
    }
  }

  return { success: true, role: invitation.role };
}

export async function revokeTeamInvitation(id: number) {
  const db = await getDb();
  if (!db) return;

  await db.update(teamInvitations).set({ status: 'revoked' })
    .where(eq(teamInvitations.id, id));
}

// User Permissions
export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
}

export async function addUserPermission(userId: number, permission: string, grantedBy: number) {
  const db = await getDb();
  if (!db) return;

  // Check if permission already exists
  const existing = await db.select().from(userPermissions)
    .where(and(
      eq(userPermissions.userId, userId),
      eq(userPermissions.permission, permission)
    )).limit(1);

  if (existing.length === 0) {
    await db.insert(userPermissions).values({
      userId,
      permission,
      grantedBy,
    });
  }
}

export async function removeUserPermission(userId: number, permission: string) {
  const db = await getDb();
  if (!db) return;

  await db.delete(userPermissions).where(and(
    eq(userPermissions.userId, userId),
    eq(userPermissions.permission, permission)
  ));
}

export async function setUserPermissions(userId: number, permissions: string[], grantedBy: number) {
  const db = await getDb();
  if (!db) return;

  // Remove all existing permissions
  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

  // Add new permissions
  for (const permission of permissions) {
    await db.insert(userPermissions).values({
      userId,
      permission,
      grantedBy,
    });
  }
}

// Check if user has a specific permission
export async function userHasPermission(userId: number, requiredPermission: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get user role
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0]) return false;

  const role = user[0].role;

  // Admin has all permissions
  if (role === 'admin') return true;

  // Check role-based permissions
  const rolePermissions = ROLE_PERMISSIONS[role] || [];

  // Check for wildcard match
  for (const perm of rolePermissions) {
    if (perm === '*') return true;
    if (perm === requiredPermission) return true;

    // Check module wildcard (e.g., 'inventory.*' matches 'inventory.update')
    if (perm.endsWith('.*')) {
      const module = perm.slice(0, -2);
      if (requiredPermission.startsWith(module + '.')) return true;
    }
  }

  // Check custom permissions
  const customPerms = await getUserPermissions(userId);
  for (const perm of customPerms) {
    if (perm.permission === requiredPermission) return true;
    if (perm.permission === '*') return true;
    if (perm.permission.endsWith('.*')) {
      const module = perm.permission.slice(0, -2);
      if (requiredPermission.startsWith(module + '.')) return true;
    }
  }

  return false;
}

// Get all effective permissions for a user
export async function getUserEffectivePermissions(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0]) return [];

  const role = user[0].role;
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  const customPerms = await getUserPermissions(userId);

  const allPerms = new Set<string>([
    ...rolePerms,
    ...customPerms.map(p => p.permission)
  ]);

  return Array.from(allPerms);
}

// ============================================
// GOOGLE OAUTH TOKEN BY USER ID
// ============================================

export async function getGoogleOAuthTokenByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(googleOAuthTokens).where(eq(googleOAuthTokens.userId, userId)).limit(1);
  return result[0] || null;
}

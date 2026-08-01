import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router, mergeRouters } from "../_core/trpc";
import * as db from "../db";

// Role-based access middleware
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const financeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'finance', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Finance access required' });
  }
  return next({ ctx });
});

export const opsProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operations access required' });
  }
  return next({ ctx });
});

export const legalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'legal', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Legal access required' });
  }
  return next({ ctx });
});

// Copacker can only access their assigned warehouse inventory
export const copackerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'copacker'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Copacker access required' });
  }
  return next({ ctx });
});

// Vendor can access their own purchase orders and shipments
export const vendorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'vendor'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Vendor access required' });
  }
  return next({ ctx });
});

// Plant User can only access Work Orders, Receiving, Inventory, and Transfers
export const plantProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'plant', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Plant user access required' });
  }
  return next({ ctx });
});

// Procurement-specific (separate from general finance)
export const procurementProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'procurement', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Procurement access required' });
  }
  return next({ ctx });
});

// Helper to create audit log
export async function createAuditLog(userId: number, action: 'create' | 'update' | 'delete' | 'view' | 'export' | 'approve' | 'reject', entityType: string, entityId: number, entityName?: string, oldValues?: any, newValues?: any) {
  await db.createAuditLog({
    userId,
    action,
    entityType,
    entityId,
    entityName,
    oldValues,
    newValues,
  });
}

// Helper to refresh Google OAuth token
export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken?: string; expiresAt?: Date; error?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return { error: 'Google OAuth not configured' };
  }
  
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[Google OAuth] Failed to refresh token:', error);
      return { error: 'Failed to refresh token' };
    }
    
    const data = await response.json();
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));
    
    return {
      accessToken: data.access_token,
      expiresAt,
    };
  } catch (error: any) {
    console.error('[Google OAuth] Error refreshing token:', error);
    return { error: error.message };
  }
}

// Helper to get valid Google access token (refreshes if needed)
export async function getValidGoogleToken(userId: number): Promise<{ accessToken: string; error?: string }> {
  const token = await db.getGoogleOAuthToken(userId);
  
  if (!token) {
    return { accessToken: '', error: 'Google account not connected' };
  }
  
  // Check if token needs refresh
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    if (!token.refreshToken) {
      return { accessToken: '', error: 'Google token has expired. Please reconnect your Google account.' };
    }
    const refreshed = await refreshGoogleToken(token.refreshToken);
    
    if (refreshed.accessToken && refreshed.expiresAt) {
      // Persist the refreshed token, but never let a DB write failure block the
      // request — the freshly refreshed token is valid whether or not we manage
      // to store it. (This path serves the data-room document proxy and the
      // auto-sync scheduler; a failing upsert here previously aborted both.)
      try {
        await db.upsertGoogleOAuthToken({
          userId,
          accessToken: refreshed.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: refreshed.expiresAt,
          googleEmail: token.googleEmail,
        });
      } catch (persistErr) {
        console.error(`[GoogleToken] Failed to persist refreshed token for user ${userId} (using it anyway):`, persistErr);
      }
      return { accessToken: refreshed.accessToken };
    }
    
    return { accessToken: '', error: refreshed.error || 'Failed to refresh token' };
  }
  
  return { accessToken: token.accessToken };
}

// Helper to generate unique numbers
export function generateNumber(prefix: string) {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}${month}-${random}`;
}

// Re-export trpc primitives for convenience
export { publicProcedure, protectedProcedure, router, mergeRouters };

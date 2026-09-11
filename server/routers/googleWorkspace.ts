// appRouter.googleWorkspace — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { createGoogleDoc, createGoogleSheet, updateGoogleSheet, appendToGoogleSheet, getGoogleSheetValues, shareGoogleFile, getFileShareableLink } from "../_core/googleWorkspace";
import { getGoogleFullAccessAuthUrl } from "../_core/googleDrive";
import { createAuditLog, refreshGoogleToken, getValidGoogleToken } from "./_shared";

// ============================================
// GOOGLE WORKSPACE (DOCS & SHEETS)
// ============================================
export const googleWorkspaceRouter = router({
    // Get connection status (shared with Gmail)
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getGoogleOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, email: null };
      }
      let isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      if (isExpired && token.refreshToken) {
        const refreshed = await refreshGoogleToken(token.refreshToken);
        if (refreshed.accessToken && refreshed.expiresAt) {
          await db.upsertGoogleOAuthToken({
            userId: ctx.user.id,
            accessToken: refreshed.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: refreshed.expiresAt,
            googleEmail: token.googleEmail,
          });
          isExpired = false;
        }
      }
      return {
        connected: !isExpired,
        email: token.googleEmail,
        needsRefresh: !!isExpired
      };
    }),

    // Get full access OAuth URL (redirects back to settings/integrations after auth)
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return { url: null, error: 'Google OAuth not configured' };
      }

      const url = getGoogleFullAccessAuthUrl(ctx.user.id, '/settings/integrations');
      return { url, error: null };
    }),

    // Disconnect the connected Google account (shared with Gmail/Sheets/Drive).
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteGoogleOAuthToken(ctx.user.id);
      return { success: true };
    }),

    // Create Google Doc
    createDoc: protectedProcedure
      .input(z.object({
        title: z.string(),
        content: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await createGoogleDoc(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create document' });
        }
        
        // Get shareable link
        const linkResult = await getFileShareableLink(accessToken, result.document!.documentId);
        
        // Create audit log
        await createAuditLog(ctx.user.id, 'create', 'google_doc', 0, input.title);
        
        return { 
          ...result.document,
          webViewLink: linkResult.webViewLink 
        };
      }),
    
    // Create Google Sheet
    createSheet: protectedProcedure
      .input(z.object({
        title: z.string(),
        sheets: z.array(z.object({
          title: z.string(),
          rowCount: z.number().optional(),
          columnCount: z.number().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await createGoogleSheet(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create spreadsheet' });
        }
        
        // Create audit log
        await createAuditLog(ctx.user.id, 'create', 'google_sheet', 0, input.title);
        
        return result.spreadsheet;
      }),
    
    // Update Google Sheet values
    updateSheetValues: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string(),
        range: z.string(),
        values: z.array(z.array(z.any())),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await updateGoogleSheet(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to update spreadsheet' });
        }
        
        return { success: true, updatedCells: result.updatedCells };
      }),
    
    // Append to Google Sheet
    appendToSheet: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string(),
        range: z.string(),
        values: z.array(z.array(z.any())),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await appendToGoogleSheet(accessToken, input.spreadsheetId, input.range, input.values);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to append to spreadsheet' });
        }
        
        return { success: true, updatedCells: result.updatedCells };
      }),
    
    // Get Sheet values
    getSheetValues: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string(),
        range: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await getGoogleSheetValues(accessToken, input.spreadsheetId, input.range);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to get values' });
        }
        
        return result.values;
      }),
    
    // Share file
    shareFile: protectedProcedure
      .input(z.object({
        fileId: z.string(),
        role: z.enum(['reader', 'writer', 'commenter', 'owner']),
        type: z.enum(['user', 'group', 'domain', 'anyone']),
        emailAddress: z.string().optional(),
        domain: z.string().optional(),
        sendNotificationEmail: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await shareGoogleFile(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to share file' });
        }
        
        return { success: true, permissionId: result.permissionId };
      }),
  });

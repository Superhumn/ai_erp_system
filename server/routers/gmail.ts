// appRouter.gmail — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { sendGmailMessage, createGmailDraft, listGmailMessages, getGmailMessage, replyToGmailMessage, getGmailProfile, type GmailSendOptions, type GmailDraftOptions } from "../_core/gmail";
import { getGoogleFullAccessAuthUrl } from "../_core/googleDrive";
import { createAuditLog, refreshGoogleToken, getValidGoogleToken } from "./_shared";

// ============================================
// GMAIL INTEGRATION
// ============================================
export const gmailRouter = router({
    // Get connection status
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getGoogleOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, email: null };
      }
      // Check if token is expired and attempt refresh
      let isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      let accessToken = token.accessToken;

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
          accessToken = refreshed.accessToken;
          isExpired = false;
        }
      }

      // Get Gmail profile if connected
      if (!isExpired) {
        try {
          const profileResult = await getGmailProfile(accessToken);
          return {
            connected: true,
            email: profileResult.profile?.emailAddress || token.googleEmail,
            messagesTotal: profileResult.profile?.messagesTotal,
            threadsTotal: profileResult.profile?.threadsTotal,
          };
        } catch {
          // If profile fetch fails, still report as connected with stored email
          return { connected: true, email: token.googleEmail };
        }
      }

      return {
        connected: false,
        email: token.googleEmail,
        needsRefresh: true
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

    // Disconnect the connected Google account. Gmail, Workspace, Sheets import
    // and Drive/data-room all share one Google OAuth token, so this removes the
    // connection for all of them.
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteGoogleOAuthToken(ctx.user.id);
      return { success: true };
    }),

    // Send email via Gmail
    sendEmail: protectedProcedure
      .input(z.object({
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        cc: z.union([z.string(), z.array(z.string())]).optional(),
        bcc: z.union([z.string(), z.array(z.string())]).optional(),
        replyTo: z.string().optional(),
        html: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await sendGmailMessage(accessToken, input as GmailSendOptions);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send email' });
        }
        
        // Create audit log
        await createAuditLog(ctx.user.id, 'create', 'gmail_message', 0, `Sent email to ${Array.isArray(input.to) ? input.to.join(', ') : input.to}`);

        // Auto-log email to CRM contact history
        try {
          const recipientEmails = Array.isArray(input.to) ? input.to : [input.to];
          for (const recipientEmail of recipientEmails) {
            const contact = await db.getCrmContactByEmail(recipientEmail);
            if (contact) {
              await db.createCrmInteraction({
                contactId: contact.id,
                channel: "email",
                interactionType: "sent",
                subject: input.subject,
                content: `Email sent: ${input.subject}`,
              });
            }
          }
        } catch (e) {
          console.warn("[CRM Email Log] Failed to log email interaction:", e);
        }

        return { success: true, messageId: result.messageId };
      }),

    // Create draft
    createDraft: protectedProcedure
      .input(z.object({
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        cc: z.union([z.string(), z.array(z.string())]).optional(),
        bcc: z.union([z.string(), z.array(z.string())]).optional(),
        replyTo: z.string().optional(),
        html: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await createGmailDraft(accessToken, input as GmailDraftOptions);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create draft' });
        }
        
        return { success: true, draftId: result.draftId };
      }),
    
    // List emails
    listMessages: protectedProcedure
      .input(z.object({
        maxResults: z.number().optional(),
        pageToken: z.string().optional(),
        labelIds: z.array(z.string()).optional(),
        q: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await listGmailMessages(accessToken, input || {});
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to list messages' });
        }
        
        return result.result;
      }),
    
    // Get message
    getMessage: protectedProcedure
      .input(z.object({ messageId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await getGmailMessage(accessToken, input.messageId);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to get message' });
        }
        
        return result.message;
      }),
    
    // Reply to message
    replyToMessage: protectedProcedure
      .input(z.object({
        threadId: z.string(),
        messageId: z.string(),
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        cc: z.union([z.string(), z.array(z.string())]).optional(),
        html: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const { threadId, messageId, ...emailOptions } = input;
        const result = await replyToGmailMessage(accessToken, threadId, messageId, emailOptions as GmailSendOptions);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send reply' });
        }
        
        return { success: true, messageId: result.messageId };
      }),
  });

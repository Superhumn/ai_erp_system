// appRouter.emailCredentials — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { definedFields } from "../_core/definedFields";
import { encrypt } from "../_core/crypto";
import { decryptPassword } from "./_shared";

// ============================================
// EMAIL CREDENTIALS & SCHEDULED SCANNING
// ============================================
export const emailCredentialsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const credentials = await db.getEmailCredentials(ctx.user.id);
      // Don't return passwords
      return credentials.map(c => ({ ...c, imapPassword: c.imapPassword ? '********' : null }));
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const credential = await db.getEmailCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { ...credential, imapPassword: credential.imapPassword ? '********' : null };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        provider: z.enum(['gmail', 'outlook', 'yahoo', 'icloud', 'custom']),
        email: z.string().email(),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        imapUsername: z.string().optional(),
        imapPassword: z.string().optional(),
        scanFolder: z.string().optional(),
        scanUnreadOnly: z.boolean().optional(),
        markAsRead: z.boolean().optional(),
        maxEmailsPerScan: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Encrypt password if provided
        let encryptedPassword = input.imapPassword;
        if (input.imapPassword) {
          encryptedPassword = encrypt(input.imapPassword);
        }

        const { id } = await db.createEmailCredential({
          ...input,
          userId: ctx.user.id,
          imapPassword: encryptedPassword,
        });

        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        imapUsername: z.string().optional(),
        imapPassword: z.string().optional(),
        scanFolder: z.string().optional(),
        scanUnreadOnly: z.boolean().optional(),
        markAsRead: z.boolean().optional(),
        maxEmailsPerScan: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getEmailCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const { id, imapPassword, ...data } = input;
        let updateData: any = data;

        // Encrypt new password if provided
        if (imapPassword) {
          updateData.imapPassword = encrypt(imapPassword);
        }

        await db.updateEmailCredential(id, updateData);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getEmailCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        await db.deleteEmailCredential(input.id);
        return { success: true };
      }),

    testConnection: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        provider: z.enum(['gmail', 'outlook', 'yahoo', 'icloud', 'custom']),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        imapUsername: z.string().optional(),
        imapPassword: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        let config: any = input;

        // If ID provided, get stored credentials
        if (input.id) {
          const credential = await db.getEmailCredentialById(input.id);
          if (!credential || credential.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }

          // Decrypt password
          if (credential.imapPassword) {
            config = { ...credential, imapPassword: decryptPassword(credential.imapPassword) };
          }
        }

        // Test connection using the inbox scanner
        const { testImapConnection } = await import('../_core/emailInboxScanner');
        const result = await testImapConnection({
          host: config.imapHost || '',
          port: config.imapPort || 993,
          secure: config.imapSecure ?? true,
          auth: {
            user: config.imapUsername || '',
            pass: config.imapPassword || '',
          },
        });

        return result;
      }),

    // Scheduled scans
    schedules: router({
      list: protectedProcedure
        .input(z.object({ credentialId: z.number().optional() }))
        .query(async ({ input, ctx }) => {
          // Get user's credentials first
          const credentials = await db.getEmailCredentials(ctx.user.id);
          const credentialIds = credentials.map(c => c.id);

          if (input.credentialId && !credentialIds.includes(input.credentialId)) {
            throw new TRPCError({ code: 'FORBIDDEN' });
          }

          return db.getScheduledScans(input.credentialId);
        }),

      create: protectedProcedure
        .input(z.object({
          credentialId: z.number(),
          intervalMinutes: z.number().min(5).default(15),
          isEnabled: z.boolean().default(true),
        }))
        .mutation(async ({ input, ctx }) => {
          const credential = await db.getEmailCredentialById(input.credentialId);
          if (!credential || credential.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }

          const { id } = await db.createScheduledScan(input);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          isEnabled: z.boolean().optional(),
          intervalMinutes: z.number().min(5).optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, intervalMinutes, ...data } = input;
          const updateData: any = { ...data };

          if (intervalMinutes) {
            updateData.intervalMinutes = intervalMinutes;
            updateData.nextRunAt = new Date(Date.now() + intervalMinutes * 60 * 1000);
          }

          const patch = definedFields(updateData);
          if (!patch) return { success: true };
          await db.updateScheduledScan(id, patch);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteScheduledScan(input.id);
          return { success: true };
        }),
    }),

    // Scan logs
    logs: router({
      list: protectedProcedure
        .input(z.object({ credentialId: z.number(), limit: z.number().optional() }))
        .query(async ({ input, ctx }) => {
          const credential = await db.getEmailCredentialById(input.credentialId);
          if (!credential || credential.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          return db.getScanLogs(input.credentialId, input.limit);
        }),
    }),
  });

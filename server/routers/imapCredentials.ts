// appRouter.imapCredentials — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { encrypt } from "../_core/crypto";
import { decryptPassword } from "./_shared";

// ============================================
// IMAP CREDENTIALS
// ============================================
export const imapCredentialsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const credentials = await db.getImapCredentials(ctx.user.id);
      // Don't return encrypted passwords
      return credentials.map(c => ({ ...c, encryptedPassword: '********' }));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        host: z.string().min(1),
        port: z.number().default(993),
        secure: z.boolean().default(true),
        email: z.string().email(),
        password: z.string().min(1),
        folder: z.string().default('INBOX'),
        unseenOnly: z.boolean().default(true),
        markAsSeen: z.boolean().default(false),
        pollingEnabled: z.boolean().default(false),
        pollingIntervalMinutes: z.number().min(5).default(15),
      }))
      .mutation(async ({ input, ctx }) => {
        // Encrypt password
        const encrypted = encrypt(input.password);

        const { id } = await db.createImapCredential({
          ...input,
          userId: ctx.user.id,
          encryptedPassword: encrypted,
        });

        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        folder: z.string().optional(),
        unseenOnly: z.boolean().optional(),
        markAsSeen: z.boolean().optional(),
        pollingEnabled: z.boolean().optional(),
        pollingIntervalMinutes: z.number().min(5).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getImapCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const { id, ...data } = input;
        await db.updateImapCredential(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getImapCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        await db.deleteImapCredential(input.id);
        return { success: true };
      }),

    // Get decrypted credentials for scanning (internal use)
    getDecrypted: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const credential = await db.getImapCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Decrypt password
        const decrypted = decryptPassword(credential.encryptedPassword);

        return {
          ...credential,
          password: decrypted,
        };
      }),
  });

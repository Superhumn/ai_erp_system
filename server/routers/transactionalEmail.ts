// appRouter.transactionalEmail — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as emailService from "../_core/emailService";
import * as db from "../db";
import { adminProcedure, createAuditLog } from "./_shared";

// ============================================
// TRANSACTIONAL EMAIL SYSTEM (SendGrid)
// ============================================
export const transactionalEmailRouter = router({
    // Get email service status
    getStatus: protectedProcedure.query(() => {
      return emailService.getStatus();
    }),

    // Get email message stats
    getStats: protectedProcedure.query(async () => {
      return db.getEmailMessageStats();
    }),

    // Template management
    templates: router({
      list: protectedProcedure.query(() => db.getTransactionalEmailTemplates()),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getTransactionalEmailTemplateById(input.id)),

      getByName: protectedProcedure
        .input(z.object({ name: z.string() }))
        .query(({ input }) => db.getTransactionalEmailTemplateByName(input.name)),

      create: adminProcedure
        .input(z.object({
          name: z.enum(['QUOTE', 'PO', 'SHIPMENT', 'ALERT', 'RFQ', 'INVOICE', 'PAYMENT_REMINDER', 'WELCOME', 'GENERAL']),
          providerTemplateId: z.string().min(1),
          description: z.string().optional(),
          variablesSchema: z.any().optional(),
          defaultSubject: z.string().optional(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createTransactionalEmailTemplate({
            ...input,
            name: input.name as any,
          } as any);
          await createAuditLog(ctx.user.id, 'create', 'transactional_email_template', result.id, input.name);
          return result;
        }),

      update: adminProcedure
        .input(z.object({
          id: z.number(),
          providerTemplateId: z.string().optional(),
          description: z.string().optional(),
          variablesSchema: z.any().optional(),
          defaultSubject: z.string().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateTransactionalEmailTemplate(id, {
            ...data,
          } as any);
          await createAuditLog(ctx.user.id, 'update', 'transactional_email_template', id);
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteTransactionalEmailTemplate(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'transactional_email_template', input.id);
          return { success: true };
        }),
    }),

    // Email messages (logs)
    messages: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          templateName: z.string().optional(),
          toEmail: z.string().optional(),
          relatedEntityType: z.string().optional(),
          relatedEntityId: z.number().optional(),
          fromDate: z.date().optional(),
          toDate: z.date().optional(),
          limit: z.number().default(100),
          offset: z.number().default(0),
        }).optional())
        .query(({ input }) => db.getEmailMessages(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const message = await db.getEmailMessageById(input.id);
          if (!message) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Email message not found' });
          }
          const events = await db.getEmailEventsByMessageId(input.id);
          return { message, events };
        }),

      getByProvider: protectedProcedure
        .input(z.object({ providerMessageId: z.string() }))
        .query(({ input }) => db.getEmailMessageByProviderMessageId(input.providerMessageId)),

      retry: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const message = await db.getEmailMessageById(input.id);
          if (!message) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Email message not found' });
          }
          if (message.status !== 'failed') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only retry failed emails' });
          }

          // Reset status to queued for retry
          await db.updateEmailMessage(input.id, {
            status: 'queued' as any,
            retryCount: 0,
            errorJson: null,
          } as any);

          await createAuditLog(ctx.user.id, 'update', 'email_message', input.id, undefined, undefined, { action: 'retry' });
          return { success: true };
        }),
    }),

    // Events (webhook events)
    events: router({
      list: protectedProcedure
        .input(z.object({
          emailMessageId: z.number().optional(),
          providerMessageId: z.string().optional(),
          limit: z.number().default(100),
        }).optional())
        .query(async ({ input }) => {
          if (input?.emailMessageId) {
            return db.getEmailEventsByMessageId(input.emailMessageId);
          }
          if (input?.providerMessageId) {
            return db.getEmailEventsByProviderMessageId(input.providerMessageId);
          }
          return db.getRecentEmailEvents(input?.limit);
        }),
    }),

    // Queue and send emails
    queueEmail: protectedProcedure
      .input(z.object({
        templateName: z.enum(['QUOTE', 'PO', 'SHIPMENT', 'ALERT', 'RFQ', 'INVOICE', 'PAYMENT_REMINDER', 'WELCOME', 'GENERAL']),
        toEmail: z.string().email(),
        toName: z.string().optional(),
        subject: z.string(),
        payload: z.record(z.string(), z.any()),
        idempotencyKey: z.string().optional(),
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.number().optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.queueEmail({
          templateName: input.templateName,
          to: { email: input.toEmail, name: input.toName },
          subject: input.subject,
          payload: input.payload,
          idempotencyKey: input.idempotencyKey,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
          triggeredBy: ctx.user.id,
          scheduledAt: input.scheduledAt,
        });

        if (result.success && result.emailMessageId && !result.isDuplicate) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, input.subject, undefined, {
            templateName: input.templateName,
            toEmail: input.toEmail,
          });
        }

        return result;
      }),

    // Send entity-specific emails
    sendQuoteEmail: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.string(), z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendQuoteEmail(input.quoteId, {
          triggeredBy: ctx.user.id,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'Quote Email', undefined, {
            quoteId: input.quoteId,
          });
        }

        return result;
      }),

    sendPOEmail: protectedProcedure
      .input(z.object({
        poId: z.number(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.string(), z.any()).optional(),
        pdfUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendPOEmail(input.poId, {
          triggeredBy: ctx.user.id,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
          pdfUrl: input.pdfUrl,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'PO Email', undefined, {
            poId: input.poId,
          });
        }

        return result;
      }),

    sendShipmentEmail: protectedProcedure
      .input(z.object({
        shipmentId: z.number(),
        recipientEmail: z.string().email().optional(),
        recipientName: z.string().optional(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.string(), z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendShipmentEmail(input.shipmentId, {
          triggeredBy: ctx.user.id,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'Shipment Email', undefined, {
            shipmentId: input.shipmentId,
          });
        }

        return result;
      }),

    sendAlertEmail: protectedProcedure
      .input(z.object({
        alertId: z.number(),
        recipientEmail: z.string().email().optional(),
        recipientName: z.string().optional(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.string(), z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendAlertEmail(input.alertId, {
          triggeredBy: ctx.user.id,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'Alert Email', undefined, {
            alertId: input.alertId,
          });
        }

        return result;
      }),

    sendRFQEmail: protectedProcedure
      .input(z.object({
        rfqId: z.number(),
        vendorId: z.number(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.string(), z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendRFQEmail(input.rfqId, input.vendorId, {
          triggeredBy: ctx.user.id,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'RFQ Email', undefined, {
            rfqId: input.rfqId,
            vendorId: input.vendorId,
          });
        }

        return result;
      }),

    // Manually trigger sending of queued emails (admin only)
    processQueue: adminProcedure
      .input(z.object({ limit: z.number().default(10) }).optional())
      .mutation(async ({ input }) => {
        const queued = await db.getQueuedEmailMessages(input?.limit || 10);
        const results: { id: number; success: boolean; error?: string }[] = [];

        for (const message of queued) {
          const result = await emailService.sendQueuedEmail(message.id);
          results.push({
            id: message.id,
            success: result.success,
            error: result.error,
          });
        }

        return {
          processed: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
        };
      }),
  });

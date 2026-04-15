import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHash, createDecipheriv } from "crypto";
import { encrypt, decrypt } from "../_core/crypto";
import { ENV } from "../_core/env";
import { sendEmail } from "../_core/email";
import * as emailService from "../_core/emailService";
import * as db from "../db";
import { sendGmailMessage, createGmailDraft, listGmailMessages, getGmailMessage, replyToGmailMessage, getGmailProfile } from "../_core/gmail";
import { getGoogleFullAccessAuthUrl } from "../_core/googleDrive";
import { testConnection } from "../ediTransportService";
import { router, protectedProcedure, adminProcedure, createAuditLog, getValidGoogleToken } from "./middleware";

// Decrypts a stored password supporting both the current AES-256-GCM format
// (iv:authTag:ciphertext) and the legacy AES-256-CBC format (plain hex ciphertext).
function decryptPassword(encryptedText: string): string {
  if (encryptedText.split(":").length === 3) {
    return decrypt(encryptedText);
  }
  // Legacy CBC fallback for passwords stored before the GCM migration.
  // Uses ENV.cookieSecret which is validated at startup (no insecure fallback).
  const key = ENV.cookieSecret;
  const decipher = createDecipheriv(
    "aes-256-cbc",
    createHash("sha256").update(key).digest().slice(0, 32),
    Buffer.alloc(16, 0),
  );
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export const emailRouter = router({
  // ============================================
  // TRANSACTIONAL EMAIL SYSTEM (SendGrid)
  // ============================================
  transactionalEmail: router({
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
            createdBy: ctx.user.id,
          });
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
            updatedBy: ctx.user.id,
          });
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
            nextRetryAt: null,
            errorJson: null,
          });

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
  }),
  // ============================================
  // GMAIL INTEGRATION
  // ============================================
  gmail: router({
    // Get connection status
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getGoogleOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, email: null };
      }
      // Check if token is expired
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      
      // Get Gmail profile if connected
      if (!isExpired) {
        const profileResult = await getGmailProfile(token.accessToken);
        return { 
          connected: true, 
          email: profileResult.profile?.emailAddress || token.googleEmail,
          messagesTotal: profileResult.profile?.messagesTotal,
          threadsTotal: profileResult.profile?.threadsTotal,
        };
      }
      
      return { 
        connected: false, 
        email: token.googleEmail,
        needsRefresh: isExpired 
      };
    }),
    
    // Get full access OAuth URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return { url: null, error: 'Google OAuth not configured' };
      }
      
      const url = getGoogleFullAccessAuthUrl(ctx.user.id, '/settings/integrations');
      return { url, error: null };
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
        
        const result = await sendGmailMessage(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send email' });
        }
        
        // Create audit log
        await createAuditLog(ctx.user.id, 'create', 'gmail_message', 0, `Sent email to ${Array.isArray(input.to) ? input.to.join(', ') : input.to}`);
        
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
        
        const result = await createGmailDraft(accessToken, input);
        
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
        const result = await replyToGmailMessage(accessToken, threadId, messageId, emailOptions);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send reply' });
        }
        
        return { success: true, messageId: result.messageId };
      }),
  }),
  // ============================================
  // EMAIL SCANNING & DOCUMENT PARSING
  // ============================================
  emailScanning: router({
    // List inbound emails with category filtering
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        category: z.string().optional(),
        priority: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInboundEmails(input);
      }),

    // Get category statistics
    getCategoryStats: protectedProcedure
      .query(async () => {
        return db.getEmailCategoryStats();
      }),

    // Get single email with attachments and parsed documents
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const email = await db.getInboundEmailById(input.id);
        if (!email) return null;
        
        const attachments = await db.getEmailAttachments(input.id);
        const documents = await db.getParsedDocuments({ emailId: input.id });
        
        return { ...email, attachments, documents };
      }),

    // Submit email for parsing (manual forward)
    submitEmail: protectedProcedure
      .input(z.object({
        fromEmail: z.string().email(),
        fromName: z.string().optional(),
        subject: z.string(),
        bodyText: z.string(),
        bodyHtml: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { parseEmailContent } = await import("../_core/emailParser");
        
        // First, quick categorize for immediate feedback
        const { quickCategorize, categorizeEmail } = await import("../_core/emailParser");
        const quickCategory = quickCategorize(input.subject, input.fromEmail);
        
        // Create inbound email record with initial category
        const { id: emailId } = await db.createInboundEmail({
          messageId: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fromEmail: input.fromEmail,
          fromName: input.fromName || null,
          toEmail: "erp@system.local",
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml || null,
          receivedAt: new Date(),
          parsingStatus: "processing",
          category: quickCategory.category as any,
          categoryConfidence: quickCategory.confidence.toString(),
          categoryKeywords: quickCategory.keywords,
          suggestedAction: quickCategory.suggestedAction || null,
          priority: quickCategory.priority,
        });

        try {
          // Parse email content with AI (includes full categorization)
          const result = await parseEmailContent(
            input.subject,
            input.bodyText,
            input.fromEmail,
            input.fromName
          );

          if (!result.success) {
            await db.updateInboundEmailStatus(emailId, "failed", result.error);
            return { emailId, success: false, error: result.error, documents: [] };
          }

          // Create parsed document records
          const createdDocs = [];
          for (const doc of result.documents) {
            // Try to match vendor
            let vendorId: number | null = null;
            const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
            if (existingVendor) {
              vendorId = existingVendor.id;
            }

            // Try to match PO
            let purchaseOrderId: number | null = null;
            if (doc.documentNumber && (doc.documentType === "invoice" || doc.documentType === "receipt")) {
              const po = await db.findPurchaseOrderByNumber(doc.documentNumber);
              if (po) purchaseOrderId = po.id;
            }

            // Try to match shipment
            let shipmentId: number | null = null;
            if (doc.trackingNumber) {
              const shipment = await db.findShipmentByTracking(doc.trackingNumber);
              if (shipment) shipmentId = shipment.id;
            }

            const { id: docId } = await db.createParsedDocument({
              emailId,
              documentType: doc.documentType as any,
              confidence: doc.confidence?.toString() || "0",
              vendorName: doc.vendorName || null,
              vendorEmail: doc.vendorEmail || null,
              vendorId,
              documentNumber: doc.documentNumber || null,
              documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
              dueDate: doc.dueDate ? new Date(doc.dueDate) : null,
              subtotal: doc.subtotal?.toString() || null,
              taxAmount: doc.taxAmount?.toString() || null,
              shippingAmount: doc.shippingAmount?.toString() || null,
              totalAmount: doc.totalAmount?.toString() || null,
              currency: doc.currency || "USD",
              trackingNumber: doc.trackingNumber || null,
              carrierName: doc.carrierName || null,
              shipmentId,
              purchaseOrderId,
              lineItems: doc.lineItems || null,
              rawExtractedData: doc as any,
            });

            // Create line items if present
            if (doc.lineItems && doc.lineItems.length > 0) {
              for (let i = 0; i < doc.lineItems.length; i++) {
                const item = doc.lineItems[i];
                await db.createParsedDocumentLineItem({
                  documentId: docId,
                  lineNumber: i + 1,
                  description: item.description || null,
                  sku: item.sku || null,
                  quantity: item.quantity?.toString() || null,
                  unit: item.unit || null,
                  unitPrice: item.unitPrice?.toString() || null,
                  totalPrice: item.totalPrice?.toString() || null,
                });
              }
            }

            createdDocs.push({ id: docId, type: doc.documentType, vendorId, purchaseOrderId, shipmentId });
          }

          // Update with AI categorization if available (more accurate than quick categorize)
          if (result.categorization) {
            await db.updateEmailCategorization(emailId, {
              category: result.categorization.category,
              categoryConfidence: result.categorization.confidence.toString(),
              categoryKeywords: result.categorization.keywords,
              suggestedAction: result.categorization.suggestedAction || null,
              priority: result.categorization.priority,
              subcategory: result.categorization.subcategory || null,
            });
          }

          await db.updateInboundEmailStatus(emailId, "parsed");

          // ── Automation #6: Auto-run email document linker ──
          try {
            const { linkParsedEmailToEntities } = await import("../emailDocumentLinker");
            const linkData: Record<string, unknown> = {
              category: result.categorization?.category,
              vendorEmail: input.fromEmail,
              fromEmail: input.fromEmail,
            };
            // Extract linking hints from first parsed document
            if (result.documents.length > 0) {
              const firstDoc = result.documents[0];
              if (firstDoc.vendorName) linkData.vendorName = firstDoc.vendorName;
              if (firstDoc.documentNumber) linkData.documentNumber = firstDoc.documentNumber;
              if (firstDoc.trackingNumber) linkData.trackingNumber = firstDoc.trackingNumber;
              if (firstDoc.totalAmount) linkData.totalAmount = firstDoc.totalAmount;
            }
            const linkResult = await linkParsedEmailToEntities(linkData as any);
            if (linkResult.linkedPurchaseOrderId || linkResult.linkedShipmentId || linkResult.linkedInvoiceId) {
              console.log(`[Email→DocumentLinker] Linked email ${emailId}: PO=${linkResult.linkedPurchaseOrderId}, Shipment=${linkResult.linkedShipmentId}, Invoice=${linkResult.linkedInvoiceId} (${linkResult.matchMethod}, ${linkResult.matchConfidence}%)`);
            }
          } catch (e) {
            console.warn("[Email→DocumentLinker] Auto-link failed:", e);
          }

          // ── Automation #1: Auto-create draft invoice from parsed email ──
          if (result.categorization?.category === "invoice" && result.documents.length > 0) {
            try {
              const invoiceDoc = result.documents.find(d => d.documentType === "invoice") || result.documents[0];
              if (invoiceDoc.totalAmount) {
                const vendorId = invoiceDoc.vendorEmail
                  ? (await db.findVendorByEmailOrName(invoiceDoc.vendorEmail, invoiceDoc.vendorName))?.id ?? null
                  : null;
                const invoiceNumber = invoiceDoc.documentNumber || `DRAFT-EMAIL-${Date.now().toString(36).toUpperCase()}`;
                const existing = await db.getInvoiceByNumber(invoiceNumber);
                if (!existing) {
                  const draftInvoice = await db.createInvoice({
                    invoiceNumber,
                    type: "bill",
                    status: "draft",
                    customerId: vendorId,
                    issueDate: invoiceDoc.documentDate ? new Date(invoiceDoc.documentDate) : new Date(),
                    dueDate: invoiceDoc.dueDate ? new Date(invoiceDoc.dueDate) : undefined,
                    subtotal: invoiceDoc.subtotal?.toString() || invoiceDoc.totalAmount?.toString() || "0",
                    taxAmount: invoiceDoc.taxAmount?.toString() || "0",
                    totalAmount: invoiceDoc.totalAmount?.toString() || "0",
                    currency: invoiceDoc.currency || "USD",
                    notes: `Auto-created from email: ${input.subject}`,
                  } as any);
                  console.log(`[Email→Invoice] Auto-created draft invoice ${invoiceNumber} (id=${draftInvoice.id}) from email ${emailId}`);
                  // Create line items if available
                  if (invoiceDoc.lineItems?.length) {
                    for (const item of invoiceDoc.lineItems) {
                      await db.createInvoiceItem({
                        invoiceId: draftInvoice.id,
                        description: item.description || "Line item",
                        quantity: item.quantity?.toString() || "1",
                        unitPrice: item.unitPrice?.toString() || "0",
                        totalAmount: item.totalPrice?.toString() || "0",
                      } as any);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("[Email→Invoice] Auto-creation failed:", e);
            }
          }

          // ── Automation #2: Shipping email → auto-update shipment status ──
          if (result.categorization?.category === "shipping_confirmation" && result.documents.length > 0) {
            try {
              const shippingDoc = result.documents.find(d => d.trackingNumber) || result.documents[0];
              if (shippingDoc.trackingNumber) {
                const shipment = await db.findShipmentByTracking(shippingDoc.trackingNumber);
                if (shipment && shipment.status !== "delivered") {
                  await db.updateShipment(shipment.id, {
                    status: "in_transit" as any,
                    carrier: shippingDoc.carrierName || shipment.carrier,
                  });
                  console.log(`[Email→Shipment] Auto-updated shipment ${shipment.id} to in_transit (tracking: ${shippingDoc.trackingNumber})`);
                }
              }
            } catch (e) {
              console.warn("[Email→Shipment] Auto-update failed:", e);
            }
          }

          // ── Automation #3: Vendor quote email → auto-create freight quote ──
          if (result.categorization?.category === "freight_quote" && result.documents.length > 0) {
            try {
              const quoteDoc = result.documents.find(d => d.totalAmount || (d as any).freightCost) || result.documents[0];
              const senderEmail = input.fromEmail;
              // Try to find a matching carrier by sender email
              const carriers = await db.getFreightCarriers();
              const matchedCarrier = carriers.find(
                (c: any) => c.email && senderEmail && c.email.toLowerCase() === senderEmail.toLowerCase()
              );
              const carrierId = matchedCarrier?.id ?? 0;

              // Check if there's an open RFQ we can link this quote to
              const openRfqs = await db.getFreightRfqs({ status: "awaiting_quotes" });
              const linkedRfq = openRfqs.length > 0 ? openRfqs[0] : null;
              const rfqId = linkedRfq?.id ?? 0;

              await db.createFreightQuote({
                rfqId,
                carrierId,
                quoteNumber: quoteDoc.documentNumber || `QTE-EMAIL-${Date.now().toString(36).toUpperCase()}`,
                status: "received",
                freightCost: quoteDoc.totalAmount?.toString() || (quoteDoc as any).freightCost?.toString() || null,
                totalCost: quoteDoc.totalAmount?.toString() || null,
                currency: quoteDoc.currency || "USD",
                transitDays: (quoteDoc as any).transitDays ?? null,
                shippingMode: (quoteDoc as any).shippingMode || null,
                receivedVia: "email",
                rawEmailContent: input.bodyText?.substring(0, 5000) || null,
                notes: `Auto-created from vendor quote email: ${input.subject}`,
              } as any);
              console.log(`[Email→Quote] Auto-created freight quote from email ${emailId} (carrier=${matchedCarrier?.name || 'unknown'}, rfq=${rfqId || 'standalone'})`);

              // If linked to an RFQ, update its status
              if (linkedRfq) {
                await db.updateFreightRfq(linkedRfq.id, { status: "quotes_received" });
              }
            } catch (e) {
              console.warn("[Email→Quote] Auto-creation failed:", e);
            }
          }

          // ── Automation #5: Copacker email extractor → auto-trigger ──
          if (result.categorization?.category === "inventory_report") {
            try {
              const { parseCopackerInventoryEmail } = await import("../copackerEmailExtractor");
              const copackerResult = await parseCopackerInventoryEmail(input.bodyText, input.subject);
              if (copackerResult.success && copackerResult.items.length > 0) {
                console.log(`[Email→Copacker] Parsed ${copackerResult.items.length} inventory items from copacker email ${emailId}`);
              }
            } catch (e) {
              console.warn("[Email→Copacker] Auto-extraction failed:", e);
            }
          }

          // Create audit log
          await db.createAuditLog({
            userId: ctx.user.id,
            action: "create",
            entityType: "inbound_email",
            entityId: emailId,
            newValues: { documentsFound: createdDocs.length, category: result.categorization?.category },
          });

          return { emailId, success: true, documents: createdDocs };
        } catch (error) {
          await db.updateInboundEmailStatus(emailId, "failed", error instanceof Error ? error.message : "Unknown error");
          return { emailId, success: false, error: "Parsing failed", documents: [] };
        }
      }),

    // Get parsed documents
    getDocuments: protectedProcedure
      .input(z.object({
        documentType: z.string().optional(),
        isReviewed: z.boolean().optional(),
        isApproved: z.boolean().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getParsedDocuments(input);
      }),

    // Get single parsed document with line items
    getDocument: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const doc = await db.getParsedDocumentById(input.id);
        if (!doc) return null;
        
        const lineItems = await db.getParsedDocumentLineItems(input.id);
        return { ...doc, lineItems };
      }),

    // Approve parsed document and optionally create records
    approveDocument: protectedProcedure
      .input(z.object({
        id: z.number(),
        createVendor: z.boolean().optional(),
        createTransaction: z.boolean().optional(),
        linkToPO: z.number().optional(),
        linkToShipment: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const doc = await db.getParsedDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

        // Create vendor if requested
        if (input.createVendor && doc.vendorName && !doc.vendorId) {
          const { id: vendorId } = await db.createVendor({
            name: doc.vendorName,
            email: doc.vendorEmail || undefined,
            status: "active",
          });
          await db.setCreatedVendor(input.id, vendorId);
        }

        // Create transaction if requested (for receipts/invoices)
        if (input.createTransaction && doc.totalAmount) {
          const { id: transactionId } = await db.createTransaction({
            type: "expense",
            totalAmount: doc.totalAmount,
            transactionNumber: `DOC-${Date.now()}`,
            description: `${doc.documentType} from ${doc.vendorName || "Unknown"} - ${doc.documentNumber || "No ref"}`,
            date: doc.documentDate || new Date(),
            status: "posted",
          });
          await db.setCreatedTransaction(input.id, transactionId);
        }

        // Link to PO if specified
        if (input.linkToPO) {
          await db.linkParsedDocumentToPO(input.id, input.linkToPO);
        }

        // Link to shipment if specified
        if (input.linkToShipment) {
          await db.linkParsedDocumentToShipment(input.id, input.linkToShipment);
        }

        // Approve the document
        await db.approveParsedDocument(input.id, ctx.user.id);

        // Create audit log
        await db.createAuditLog({
          userId: ctx.user.id,
          action: "approve",
          entityType: "parsed_document",
          entityId: input.id,
          newValues: { createVendor: input.createVendor, createTransaction: input.createTransaction },
        });

        return { success: true };
      }),

    // Reject parsed document
    rejectDocument: protectedProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.rejectParsedDocument(input.id, ctx.user.id, input.notes);
        return { success: true };
      }),

    // Get email scanning statistics
    getStats: protectedProcedure
      .query(async () => {
        return db.getEmailScanningStats();
      }),

    // Archive email
    archiveEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateInboundEmailStatus(input.id, "archived");
        return { success: true };
      }),

    // Delete email permanently
    deleteEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteInboundEmail(input.id);
        return { success: true };
      }),

    // Auto-reply rules
    getAutoReplyRules: protectedProcedure
      .input(z.object({
        isEnabled: z.boolean().optional(),
        category: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAutoReplyRules(input);
      }),

    getAutoReplyRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getAutoReplyRuleById(input.id);
      }),

    createAutoReplyRule: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        category: z.string(),
        replyTemplate: z.string().min(1),
        senderPattern: z.string().optional(),
        subjectPattern: z.string().optional(),
        bodyKeywords: z.array(z.string()).optional(),
        minConfidence: z.string().optional(),
        replySubjectPrefix: z.string().optional(),
        tone: z.enum(["professional", "friendly", "formal"]).optional(),
        includeOriginal: z.boolean().optional(),
        delayMinutes: z.number().optional(),
        autoSend: z.boolean().optional(),
        createTask: z.boolean().optional(),
        notifyOwner: z.boolean().optional(),
        priority: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createAutoReplyRule({ ...input, createdBy: ctx.user.id });
      }),

    updateAutoReplyRule: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        category: z.string().optional(),
        isEnabled: z.boolean().optional(),
        priority: z.number().optional(),
        senderPattern: z.string().optional(),
        subjectPattern: z.string().optional(),
        bodyKeywords: z.array(z.string()).optional(),
        minConfidence: z.string().optional(),
        replyTemplate: z.string().optional(),
        replySubjectPrefix: z.string().optional(),
        tone: z.enum(["professional", "friendly", "formal"]).optional(),
        includeOriginal: z.boolean().optional(),
        delayMinutes: z.number().optional(),
        autoSend: z.boolean().optional(),
        createTask: z.boolean().optional(),
        notifyOwner: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateAutoReplyRule(id, updates);
        return { success: true };
      }),

    deleteAutoReplyRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAutoReplyRule(input.id);
        return { success: true };
      }),

    // Sent emails tracking
    getSentEmails: protectedProcedure
      .input(z.object({
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSentEmails(input);
      }),

    getSentEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getSentEmailById(input.id);
      }),

    getEmailThread: protectedProcedure
      .input(z.object({ threadId: z.string() }))
      .query(async ({ input }) => {
        return db.getEmailThread(input.threadId);
      }),

    // Reparse email
    reparseEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const email = await db.getInboundEmailById(input.id);
        if (!email) throw new TRPCError({ code: "NOT_FOUND" });

        const { parseEmailContent } = await import("../_core/emailParser");
        
        await db.updateInboundEmailStatus(input.id, "processing");

        try {
          const result = await parseEmailContent(
            email.subject || "",
            email.bodyText || "",
            email.fromEmail,
            email.fromName || undefined
          );

          if (!result.success) {
            await db.updateInboundEmailStatus(input.id, "failed", result.error);
            return { success: false, error: result.error };
          }

          // Create new parsed documents
          for (const doc of result.documents) {
            let vendorId: number | null = null;
            const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
            if (existingVendor) vendorId = existingVendor.id;

            await db.createParsedDocument({
              emailId: input.id,
              documentType: doc.documentType as any,
              confidence: doc.confidence?.toString() || "0",
              vendorName: doc.vendorName || null,
              vendorEmail: doc.vendorEmail || null,
              vendorId,
              documentNumber: doc.documentNumber || null,
              documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
              totalAmount: doc.totalAmount?.toString() || null,
              currency: doc.currency || "USD",
              trackingNumber: doc.trackingNumber || null,
              carrierName: doc.carrierName || null,
              lineItems: doc.lineItems || null,
              rawExtractedData: doc as any,
            });
          }

          await db.updateInboundEmailStatus(input.id, "parsed");
          return { success: true, documentsFound: result.documents.length };
        } catch (error) {
          await db.updateInboundEmailStatus(input.id, "failed", error instanceof Error ? error.message : "Unknown error");
          return { success: false, error: "Reparse failed" };
        }
      }),

    // Process attachments with OCR
    processAttachments: protectedProcedure
      .input(z.object({ emailId: z.number() }))
      .mutation(async ({ input }) => {
        const email = await db.getInboundEmailById(input.emailId);
        if (!email) throw new TRPCError({ code: "NOT_FOUND" });

        const attachments = await db.getEmailAttachments(input.emailId);
        if (attachments.length === 0) {
          return { success: true, processed: 0, results: [] };
        }

        const { processEmailAttachments, categorizeByAttachments } = await import("../_core/attachmentOcr");
        
        const results = await processEmailAttachments(
          attachments.map(a => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            storageUrl: a.storageUrl,
          }))
        );

        // Update attachments with OCR results
        const processedResults: any[] = [];
        for (const [attachmentId, result] of Array.from(results.entries())) {
          await db.updateEmailAttachment(attachmentId, {
            extractedText: result.extractedText,
            metadata: { structuredData: result.structuredData, confidence: result.confidence },
            isProcessed: true,
          });

          // Create parsed document from attachment if high confidence
          if (result.confidence >= 0.7 && result.type !== 'unknown') {
            const data = result.structuredData;
            await db.createParsedDocument({
              emailId: input.emailId,
              attachmentId,
              documentType: result.type as any,
              confidence: result.confidence.toString(),
              vendorName: data.vendorName || null,
              vendorEmail: data.vendorEmail || null,
              documentNumber: data.documentNumber || data.invoiceNumber || null,
              documentDate: data.documentDate ? new Date(data.documentDate) : null,
              totalAmount: data.totalAmount?.toString() || null,
              currency: data.currency || 'USD',
              trackingNumber: data.trackingNumber || null,
              carrierName: data.carrier || null,
              lineItems: data.lineItems || null,
              rawExtractedData: result as any,
            });
          }

          processedResults.push({
            attachmentId,
            type: result.type,
            confidence: result.confidence,
            hasLineItems: (result.structuredData.lineItems?.length || 0) > 0,
          });
        }

        // Update email category based on attachments if not already categorized
        const attachmentCategory = categorizeByAttachments(Array.from(results.values()));
        if (attachmentCategory && (!email.category || email.category === 'general')) {
          await db.updateEmailCategory(input.emailId, {
            category: attachmentCategory.category as any,
            categoryConfidence: attachmentCategory.confidence.toString(),
          });
        }

        return {
          success: true,
          processed: results.size,
          results: processedResults,
        };
      }),

    // Check if IMAP inbox is configured
    isInboxConfigured: protectedProcedure
      .query(async () => {
        const { isImapConfigured, getImapConfig, IMAP_PRESETS } = await import("../_core/emailInboxScanner");
        return {
          configured: isImapConfigured(),
          presets: Object.keys(IMAP_PRESETS),
        };
      }),

    // Test IMAP connection
    testInboxConnection: protectedProcedure
      .input(z.object({
        host: z.string(),
        port: z.number().default(993),
        secure: z.boolean().default(true),
        user: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { testImapConnection } = await import("../_core/emailInboxScanner");
        return testImapConnection({
          host: input.host,
          port: input.port,
          secure: input.secure,
          auth: {
            user: input.user,
            pass: input.password,
          },
        });
      }),

    // Scan entire inbox and import emails
    scanInbox: protectedProcedure
      .input(z.object({
        host: z.string().optional(),
        port: z.number().optional(),
        secure: z.boolean().optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        folder: z.string().default("INBOX"),
        limit: z.number().default(50),
        unseenOnly: z.boolean().default(true),
        markAsSeen: z.boolean().default(false),
        fullAiParsing: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const { scanAndCategorizeInbox, getImapConfig } = await import("../_core/emailInboxScanner");
        
        // Get config from input or environment
        let config = getImapConfig();
        if (input.host && input.user && input.password) {
          config = {
            host: input.host,
            port: input.port || 993,
            secure: input.secure ?? true,
            auth: {
              user: input.user,
              pass: input.password,
            },
          };
        }
        
        if (!config) {
          return {
            success: false,
            error: "IMAP not configured. Please provide connection details or set environment variables.",
            imported: 0,
            skipped: 0,
            errors: [],
          };
        }

        // Scan the inbox
        const { scanResult, parsedResults } = await scanAndCategorizeInbox(config, {
          folder: input.folder,
          limit: input.limit,
          unseenOnly: input.unseenOnly,
          markAsSeen: input.markAsSeen,
          fullAiParsing: input.fullAiParsing,
        });

        if (!scanResult.success) {
          return {
            success: false,
            error: scanResult.errors.join("; "),
            imported: 0,
            skipped: 0,
            errors: scanResult.errors,
          };
        }

        // Import emails into the database
        let imported = 0;
        let skipped = 0;
        const importErrors: string[] = [];

        for (const { email, parseResult } of parsedResults) {
          try {
            // Check if email already exists by messageId
            const existing = await db.findInboundEmailByMessageId(email.messageId);
            if (existing) {
              skipped++;
              continue;
            }

            // Create inbound email record
            const { id: emailId } = await db.createInboundEmail({
              messageId: email.messageId,
              fromEmail: email.from.address,
              fromName: email.from.name || null,
              toEmail: email.to.join(", ") || "inbox",
              subject: email.subject,
              bodyText: email.bodyText,
              bodyHtml: email.bodyHtml || null,
              receivedAt: email.date,
              parsingStatus: parseResult ? "parsed" : "pending",
              category: (email.categorization?.category || "general") as any,
              categoryConfidence: email.categorization?.confidence?.toString() || null,
              categoryKeywords: email.categorization?.keywords || null,
              suggestedAction: email.categorization?.suggestedAction || null,
              priority: email.categorization?.priority || "medium",
              subcategory: email.categorization?.subcategory || null,
            });

            // If we have parsed documents, create them
            if (parseResult?.documents) {
              for (const doc of parseResult.documents) {
                let vendorId: number | null = null;
                const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
                if (existingVendor) vendorId = existingVendor.id;

                await db.createParsedDocument({
                  emailId,
                  documentType: doc.documentType as any,
                  confidence: doc.confidence?.toString() || "0",
                  vendorName: doc.vendorName || null,
                  vendorEmail: doc.vendorEmail || null,
                  vendorId,
                  documentNumber: doc.documentNumber || null,
                  documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
                  totalAmount: doc.totalAmount?.toString() || null,
                  currency: doc.currency || "USD",
                  trackingNumber: doc.trackingNumber || null,
                  carrierName: doc.carrierName || null,
                  lineItems: doc.lineItems || null,
                  rawExtractedData: doc as any,
                });
              }
            }

            // Create attachment records
            for (const attachment of email.attachments) {
              await db.createEmailAttachment({
                emailId,
                filename: attachment.filename,
                mimeType: attachment.contentType,
                size: attachment.size,
                storageUrl: null, // Attachments not downloaded in scan
              });
            }

            // ── IMAP Automation #6: Auto-run email document linker ──
            try {
              const { linkParsedEmailToEntities } = await import("../emailDocumentLinker");
              const firstDoc = parseResult?.documents?.[0];
              await linkParsedEmailToEntities({
                category: email.categorization?.category,
                vendorEmail: email.from.address,
                fromEmail: email.from.address,
                vendorName: firstDoc?.vendorName,
                documentNumber: firstDoc?.documentNumber,
                trackingNumber: firstDoc?.trackingNumber,
                totalAmount: firstDoc?.totalAmount,
              });
            } catch (e) {
              console.warn("[IMAP→DocumentLinker] Auto-link failed:", e);
            }

            // ── IMAP Automation #1: Auto-create draft invoice ──
            if (email.categorization?.category === "invoice" && parseResult?.documents?.length) {
              try {
                const invoiceDoc = parseResult.documents.find((d: any) => d.documentType === "invoice") || parseResult.documents[0];
                if (invoiceDoc.totalAmount) {
                  const invNum = invoiceDoc.documentNumber || `DRAFT-IMAP-${Date.now().toString(36).toUpperCase()}`;
                  const existingInv = await db.getInvoiceByNumber(invNum);
                  if (!existingInv) {
                    const vendorMatch = invoiceDoc.vendorEmail
                      ? (await db.findVendorByEmailOrName(invoiceDoc.vendorEmail, invoiceDoc.vendorName))?.id ?? null
                      : null;
                    await db.createInvoice({
                      invoiceNumber: invNum,
                      type: "bill",
                      status: "draft",
                      customerId: vendorMatch,
                      issueDate: invoiceDoc.documentDate ? new Date(invoiceDoc.documentDate) : new Date(),
                      subtotal: invoiceDoc.totalAmount?.toString() || "0",
                      taxAmount: "0",
                      totalAmount: invoiceDoc.totalAmount?.toString() || "0",
                      currency: invoiceDoc.currency || "USD",
                      notes: `Auto-created from IMAP email: ${email.subject}`,
                    } as any);
                    console.log(`[IMAP→Invoice] Auto-created draft invoice ${invNum} from email ${emailId}`);
                  }
                }
              } catch (e) {
                console.warn("[IMAP→Invoice] Auto-creation failed:", e);
              }
            }

            // ── IMAP Automation #2: Shipping email → auto-update shipment ──
            if (email.categorization?.category === "shipping_confirmation" && parseResult?.documents?.length) {
              try {
                const shipDoc = parseResult.documents.find((d: any) => d.trackingNumber);
                if (shipDoc?.trackingNumber) {
                  const shipment = await db.findShipmentByTracking(shipDoc.trackingNumber);
                  if (shipment && shipment.status !== "delivered") {
                    await db.updateShipment(shipment.id, { status: "in_transit" as any, carrier: shipDoc.carrierName || shipment.carrier });
                    console.log(`[IMAP→Shipment] Auto-updated shipment ${shipment.id} to in_transit`);
                  }
                }
              } catch (e) {
                console.warn("[IMAP→Shipment] Auto-update failed:", e);
              }
            }

            // ── IMAP Automation #3: Vendor quote email → auto-create freight quote ──
            if (email.categorization?.category === "freight_quote" && parseResult?.documents?.length) {
              try {
                const quoteDoc: any = parseResult.documents.find((d: any) => d.totalAmount || d.freightCost) || parseResult.documents[0];
                const senderEmail = email.from?.address;
                const carriers = await db.getFreightCarriers();
                const matchedCarrier = carriers.find(
                  (c: any) => c.email && senderEmail && c.email.toLowerCase() === senderEmail.toLowerCase()
                );
                const carrierId = matchedCarrier?.id ?? 0;
                const openRfqs = await db.getFreightRfqs({ status: "awaiting_quotes" });
                const linkedRfq = openRfqs.length > 0 ? openRfqs[0] : null;
                const rfqId = linkedRfq?.id ?? 0;

                await db.createFreightQuote({
                  rfqId,
                  carrierId,
                  quoteNumber: quoteDoc.documentNumber || `QTE-IMAP-${Date.now().toString(36).toUpperCase()}`,
                  status: "received",
                  freightCost: quoteDoc.totalAmount?.toString() || quoteDoc.freightCost?.toString() || null,
                  totalCost: quoteDoc.totalAmount?.toString() || null,
                  currency: quoteDoc.currency || "USD",
                  transitDays: quoteDoc.transitDays ?? null,
                  shippingMode: quoteDoc.shippingMode || null,
                  receivedVia: "email",
                  rawEmailContent: email.bodyText?.substring(0, 5000) || null,
                  notes: `Auto-created from IMAP vendor quote email: ${email.subject}`,
                } as any);
                console.log(`[IMAP→Quote] Auto-created freight quote from email ${emailId} (carrier=${matchedCarrier?.name || 'unknown'}, rfq=${rfqId || 'standalone'})`);

                if (linkedRfq) {
                  await db.updateFreightRfq(linkedRfq.id, { status: "quotes_received" });
                }
              } catch (e) {
                console.warn("[IMAP→Quote] Auto-creation failed:", e);
              }
            }

            // ── IMAP Automation #5: Copacker email → auto-extract inventory ──
            if (email.categorization?.category === "inventory_report") {
              try {
                const { parseCopackerInventoryEmail } = await import("../copackerEmailExtractor");
                const copackerResult = await parseCopackerInventoryEmail(email.bodyText, email.subject);
                if (copackerResult.success && copackerResult.items.length > 0) {
                  console.log(`[IMAP→Copacker] Parsed ${copackerResult.items.length} inventory items from email ${emailId}`);
                }
              } catch (e) {
                console.warn("[IMAP→Copacker] Auto-extraction failed:", e);
              }
            }

            imported++;
          } catch (error: any) {
            importErrors.push(`Failed to import ${email.messageId}: ${error.message}`);
          }
        }

        return {
          success: true,
          totalInInbox: scanResult.totalEmails,
          scanned: scanResult.newEmails,
          imported,
          skipped,
          errors: [...scanResult.errors, ...importErrors],
        };
      }),

    // Bulk categorize all uncategorized emails
    bulkCategorize: protectedProcedure
      .input(z.object({
        useAi: z.boolean().default(false),
        limit: z.number().default(100),
      }))
      .mutation(async ({ input }) => {
        const { quickCategorize, categorizeEmail } = await import("../_core/emailParser");
        
        // Get uncategorized emails
        const emails = await db.getUncategorizedEmails(input.limit);
        
        let categorized = 0;
        const errors: string[] = [];

        for (const email of emails) {
          try {
            let categorization;
            
            if (input.useAi) {
              categorization = await categorizeEmail(
                email.subject || "",
                email.bodyText || "",
                email.fromEmail,
                email.fromName || undefined
              );
            } else {
              categorization = quickCategorize(
                email.subject || "",
                email.fromEmail
              );
            }

            await db.updateEmailCategorization(email.id, {
              category: categorization.category,
              categoryConfidence: categorization.confidence.toString(),
              categoryKeywords: categorization.keywords,
              suggestedAction: categorization.suggestedAction || null,
              priority: categorization.priority,
              subcategory: categorization.subcategory || null,
            });

            categorized++;
          } catch (error: any) {
            errors.push(`Failed to categorize email ${email.id}: ${error.message}`);
          }
        }

        return {
          success: true,
          total: emails.length,
          categorized,
          errors,
        };
      }),
  }),
  // ============================================
  // IMAP CREDENTIALS
  // ============================================
  imapCredentials: router({
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
  }),
  // ============================================
  // EMAIL CREDENTIALS & SCHEDULED SCANNING
  // ============================================
  emailCredentials: router({
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

          await db.updateScheduledScan(id, updateData);
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
  }),
});

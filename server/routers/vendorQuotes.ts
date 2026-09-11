// appRouter.vendorQuotes — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import { normalizeQuotesForRfq, basisFromRfq, INCOTERM_CODES } from "../quoteNormalization";
import { ingestVendorQuoteEmail, parseVendorQuoteAttachment, parseVendorQuoteEmail } from "../vendorQuoteParser";
import { computeResponsivenessForVendors, computeVendorResponsiveness, markStaleInvitationsNoResponse, responsivenessScoreFromMetrics } from "../vendorResponsiveness";
import * as db from "../db";
import { randomBytes } from "crypto";
import { parseLlmJson } from "../llmJson";
import { isFetchableAttachmentUrl } from "../attachmentUrl";
import { opsProcedure, MAX_RFQ_VENDORS_PER_SEND, createAuditLog } from "./_shared";

// ============================================
// VENDOR QUOTE MANAGEMENT (RFQ System)
// ============================================
export const vendorQuotesRouter = router({
    // Dashboard stats
    dashboardStats: protectedProcedure.query(async () => {
      const rfqs = await db.getVendorRfqs();
      const quotes = await db.getVendorQuotes();
      return {
        totalRfqs: rfqs.length,
        activeRfqs: rfqs.filter(r => ['sent', 'partially_received'].includes(r.status)).length,
        totalQuotes: quotes.length,
        pendingQuotes: quotes.filter(q => q.status === 'pending').length,
        receivedQuotes: quotes.filter(q => q.status === 'received').length,
      };
    }),
    
    // RFQs
    rfqs: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional(), rawMaterialId: z.number().optional() }).optional())
        .query(({ input }) => db.getVendorRfqs(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getVendorRfqById(input.id)),
      create: opsProcedure
        .input(z.object({
          materialName: z.string().min(1),
          rawMaterialId: z.number().optional(),
          materialDescription: z.string().optional(),
          quantity: z.string(),
          unit: z.string(),
          specifications: z.string().optional(),
          requiredDeliveryDate: z.date().optional(),
          deliveryLocation: z.string().optional(),
          deliveryAddress: z.string().optional(),
          incoterms: z.string().optional(),
          quoteDueDate: z.date().optional(),
          validityPeriod: z.number().optional(),
          priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
          notes: z.string().optional(),
          // Comparison basis every quote on this RFQ is normalized to.
          baseCurrency: z.string().length(3).optional(),
          targetIncoterms: z.string().optional(),
          destinationCountry: z.string().optional(),
          freightAllowancePerUnit: z.string().optional(),
          freightAllowancePct: z.string().optional(),
          dutyRatePct: z.string().optional(),
          insuranceRatePct: z.string().optional(),
          amortizeToolingOverUnits: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfqNumber = await db.generateVendorRfqNumber();
          const result = await db.createVendorRfq({ ...input, rfqNumber, createdById: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'vendor_rfq', result.id, rfqNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['draft', 'sent', 'partially_received', 'all_received', 'awarded', 'cancelled', 'expired']).optional(),
          materialName: z.string().optional(),
          materialDescription: z.string().optional(),
          quantity: z.string().optional(),
          specifications: z.string().optional(),
          requiredDeliveryDate: z.date().optional(),
          quoteDueDate: z.date().optional(),
          notes: z.string().optional(),
          internalNotes: z.string().optional(),
          baseCurrency: z.string().length(3).optional(),
          targetIncoterms: z.string().optional(),
          destinationCountry: z.string().optional(),
          freightAllowancePerUnit: z.string().optional(),
          freightAllowancePct: z.string().optional(),
          dutyRatePct: z.string().optional(),
          insuranceRatePct: z.string().optional(),
          amortizeToolingOverUnits: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateVendorRfq(id, data);
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', id);
          return { success: true };
        }),
      
      // Send RFQ to vendors via AI email
      sendToVendors: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          // The array bound is only a payload guard; the real cap is on the
          // DISTINCT vendor count below, so a caller sending duplicates is not
          // rejected for a list that is within the limit once de-duplicated.
          vendorIds: z.array(z.number()).min(1).max(MAX_RFQ_VENDORS_PER_SEND * 4),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });

          const targetVendorIds = Array.from(new Set(input.vendorIds));
          // Bounded: each vendor costs an LLM call plus an email send, and a
          // runaway list would hold the request open for minutes.
          if (targetVendorIds.length > MAX_RFQ_VENDORS_PER_SEND) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `An RFQ can go to at most ${MAX_RFQ_VENDORS_PER_SEND} vendors at a time (received ${targetVendorIds.length}).`,
            });
          }

          const results = { sent: 0, failed: 0, skipped: 0, emails: [] as any[] };

          // Vendors already invited on this RFQ are skipped rather than sent a
          // duplicate RFQ, which would also reset their response clock.
          const existingInvitations = await db.getVendorRfqInvitations(input.rfqId);
          const alreadyInvited = new Set(existingInvitations.map(i => i.vendorId));

          for (const vendorId of targetVendorIds) {
            if (alreadyInvited.has(vendorId)) {
              results.skipped++;
              results.emails.push({ vendorId, status: 'skipped', error: 'Already invited on this RFQ' });
              continue;
            }
            const vendor = await db.getVendorById(vendorId);
            if (!vendor || !vendor.email) {
              results.failed++;
              results.emails.push({
                vendorId,
                vendorName: vendor?.name,
                status: 'failed',
                error: vendor ? 'No email address on this vendor' : 'Vendor not found',
              });
              continue;
            }

            // Same rule as carriers: an address nothing has confirmed is not an
            // address to send an RFQ to.
            if (vendor.contactSource === 'discovered') {
              results.skipped++;
              results.emails.push({
                vendorId,
                vendorName: vendor.name,
                status: 'blocked',
                error: 'Contact details are unverified — source them from the vendor\'s website '
                  + 'or enter them by hand before sending.',
              });
              continue;
            }

            // Create invitation record
            const invitation = await db.createVendorRfqInvitation({
              rfqId: input.rfqId,
              vendorId,
              status: 'pending',
              invitedAt: new Date(),
            });
            
            // Generate AI email content
            const emailPrompt = `Generate a professional Request for Quote (RFQ) email to a vendor for the following material:

RFQ Number: ${rfq.rfqNumber}
Material: ${rfq.materialName}
Description: ${rfq.materialDescription || 'N/A'}
Quantity Required: ${rfq.quantity} ${rfq.unit}
Specifications: ${rfq.specifications || 'Standard specifications'}
Required Delivery Date: ${rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}
Delivery Location: ${rfq.deliveryLocation || 'To be confirmed'}
Incoterms: ${rfq.incoterms || 'FOB'}
Priority: ${rfq.priority || 'Normal'}

Please request:
1. Unit price and total price
2. Lead time / delivery schedule
3. Minimum order quantity
4. Payment terms
5. Quote validity period

Request a response by ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : '5 business days'}.

Format the email professionally.`;

            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are a procurement specialist drafting RFQ emails to vendors. Be professional, clear, and include all relevant material details.' },
                { role: 'user', content: emailPrompt },
              ],
            });
            
            const rawEmailBody = response.choices[0]?.message?.content;
            const emailBody = typeof rawEmailBody === 'string' ? rawEmailBody : 'Unable to generate email content.';
            
            const emailSubject = `Request for Quote: ${rfq.rfqNumber} - ${rfq.materialName}`;
            let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
            let deliveryError: string | undefined;
            
            // Try to send via SendGrid if configured
            if (isEmailConfigured()) {
              const sendResult = await sendEmail({
                to: vendor.email,
                subject: emailSubject,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              
              if (sendResult.success) {
                emailStatus = 'sent';
                await db.updateVendorRfqInvitation(invitation.id, { status: 'sent' });
              } else {
                emailStatus = 'failed';
                deliveryError = sendResult.error;
              }
            }
            
            // Save the email record
            const emailResult = await db.createVendorRfqEmail({
              rfqId: input.rfqId,
              vendorId,
              direction: 'outbound',
              emailType: 'rfq_request',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
              toEmail: vendor.email,
              subject: emailSubject,
              body: emailBody,
              aiGenerated: true,
              sendStatus: emailStatus,
              sentAt: emailStatus === 'sent' ? new Date() : undefined,
            });
            
            if (emailStatus === 'sent') {
              results.sent++;
            } else {
              results.failed++;
            }
            results.emails.push({ 
              vendorId, 
              vendorName: vendor.name, 
              emailId: emailResult.id,
              status: emailStatus,
              error: deliveryError,
            });
          }
          
          // Update RFQ status
          await db.updateVendorRfq(input.rfqId, { status: 'sent' });
          const emailConfigured = isEmailConfigured();
          const auditMessage = emailConfigured 
            ? `RFQ emails sent to ${results.sent} vendors` 
            : `RFQ email drafts created for ${results.sent + results.failed} vendors (SendGrid not configured)`;
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', input.rfqId, auditMessage);
          
          return { ...results, emailConfigured };
        }),
      
      // Send follow-up reminder
      sendReminder: opsProcedure
        .input(z.object({ rfqId: z.number(), vendorId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });
          
          const vendor = await db.getVendorById(input.vendorId);
          if (!vendor || !vendor.email) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found or has no email' });
          
          const emailPrompt = `Generate a polite follow-up email for an RFQ that hasn't received a response:

RFQ Number: ${rfq.rfqNumber}
Material: ${rfq.materialName}
Quantity: ${rfq.quantity} ${rfq.unit}
Original Due Date: ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : 'N/A'}

Ask if they received the original request and if they can provide a quote.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a procurement specialist sending a polite follow-up email.' },
              { role: 'user', content: emailPrompt },
            ],
          });
          
          const emailBody = typeof response.choices[0]?.message?.content === 'string' 
            ? response.choices[0].message.content 
            : 'Unable to generate email content.';
          
          const emailSubject = `Follow-up: RFQ ${rfq.rfqNumber} - ${rfq.materialName}`;
          let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
          
          if (isEmailConfigured()) {
            const sendResult = await sendEmail({
              to: vendor.email,
              subject: emailSubject,
              text: emailBody,
              html: formatEmailHtml(emailBody),
            });
            emailStatus = sendResult.success ? 'sent' : 'failed';
          }
          
          await db.createVendorRfqEmail({
            rfqId: input.rfqId,
            vendorId: input.vendorId,
            direction: 'outbound',
            emailType: 'follow_up',
            fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
            toEmail: vendor.email,
            subject: emailSubject,
            body: emailBody,
            aiGenerated: true,
            sendStatus: emailStatus,
            sentAt: emailStatus === 'sent' ? new Date() : undefined,
          });
          
          // Update invitation reminder count
          const invitations = await db.getVendorRfqInvitations(input.rfqId);
          const invitation = invitations.find(i => i.vendorId === input.vendorId);
          if (invitation) {
            await db.updateVendorRfqInvitation(invitation.id, {
              reminderSentAt: new Date(),
              reminderCount: (invitation.reminderCount || 0) + 1,
            });
          }
          
          return { success: true, emailStatus };
        }),
      
      // Get invitations for an RFQ
      getInvitations: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getVendorRfqInvitations(input.rfqId)),
    }),
    
    // Quotes
    quotes: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional(), vendorId: z.number().optional(), status: z.string().optional() }).optional())
        .query(({ input }) => db.getVendorQuotes(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getVendorQuoteById(input.id)),
      getWithVendorInfo: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getVendorQuotesWithVendorInfo(input.rfqId)),
      create: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          vendorId: z.number(),
          quoteNumber: z.string().optional(),
          unitPrice: z.string().optional(),
          quantity: z.string().optional(),
          totalPrice: z.string().optional(),
          currency: z.string().optional(),
          shippingCost: z.string().optional(),
          handlingFee: z.string().optional(),
          taxAmount: z.string().optional(),
          otherCharges: z.string().optional(),
          totalWithCharges: z.string().optional(),
          leadTimeDays: z.number().optional(),
          estimatedDeliveryDate: z.date().optional(),
          minimumOrderQty: z.string().optional(),
          validUntil: z.date().optional(),
          paymentTerms: z.string().optional(),
          receivedVia: z.enum(['email', 'portal', 'phone', 'manual']).optional(),
          notes: z.string().optional(),
          // Terms the vendor quoted on, needed to level bids onto one basis.
          incoterms: z.enum(INCOTERM_CODES).optional(),
          namedPlace: z.string().optional(),
          insuranceCost: z.string().optional(),
          customsDutyAmount: z.string().optional(),
          toolingCost: z.string().optional(),
          toolingAmortizationUnits: z.string().optional(),
          toolingIsRefundable: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createVendorQuote({ ...input, status: 'received' });
          
          // Update invitation status
          const invitations = await db.getVendorRfqInvitations(input.rfqId);
          const invitation = invitations.find(i => i.vendorId === input.vendorId);
          if (invitation) {
            await db.updateVendorRfqInvitation(invitation.id, { status: 'responded', respondedAt: new Date() });
          }
          
          // Check if all invited vendors have responded
          const updatedInvitations = await db.getVendorRfqInvitations(input.rfqId);
          const allResponded = updatedInvitations.every(i => ['responded', 'declined', 'no_response'].includes(i.status));
          if (allResponded && updatedInvitations.length > 0) {
            await db.updateVendorRfq(input.rfqId, { status: 'all_received' });
          } else {
            await db.updateVendorRfq(input.rfqId, { status: 'partially_received' });
          }
          
          // Re-level the RFQ on the common basis (FX, Incoterm gaps, MOQ,
          // tooling amortization) so the new bid is immediately comparable.
          // `overallRank` keeps its legacy price-only meaning for callers that
          // still read it; `normalizedRank` is the landed-cost ranking.
          const allQuotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          const sortedQuotes = allQuotes
            .filter(q => q.status === 'received')
            .sort((a, b) => parseFloat(a.totalPrice || '999999') - parseFloat(b.totalPrice || '999999'));
          for (let i = 0; i < sortedQuotes.length; i++) {
            await db.updateVendorQuote(sortedQuotes[i].id, { overallRank: i + 1 });
          }

          let normalization: Awaited<ReturnType<typeof normalizeQuotesForRfq>> | null = null;
          try {
            normalization = await normalizeQuotesForRfq(input.rfqId);
          } catch (e) {
            console.warn('[VendorQuotes] Normalization after quote entry failed:', e);
          }

          await createAuditLog(ctx.user.id, 'create', 'vendor_quote', result.id, `Quote from vendor ${input.vendorId}`);
          return {
            ...result,
            normalized: normalization?.results.find(r => r.quoteId === result.id) ?? null,
          };
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'received', 'under_review', 'accepted', 'rejected', 'expired', 'converted_to_po']).optional(),
          unitPrice: z.string().optional(),
          quantity: z.string().optional(),
          totalPrice: z.string().optional(),
          currency: z.string().length(3).optional(),
          shippingCost: z.string().optional(),
          handlingFee: z.string().optional(),
          taxAmount: z.string().optional(),
          otherCharges: z.string().optional(),
          insuranceCost: z.string().optional(),
          customsDutyAmount: z.string().optional(),
          incoterms: z.enum(INCOTERM_CODES).optional(),
          namedPlace: z.string().optional(),
          minimumOrderQty: z.string().optional(),
          toolingCost: z.string().optional(),
          toolingAmortizationUnits: z.string().optional(),
          toolingIsRefundable: z.boolean().optional(),
          leadTimeDays: z.number().optional(),
          validUntil: z.date().optional(),
          paymentTerms: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateVendorQuote(id, data);
          // Any change to price, currency, Incoterm, MOQ or tooling moves the
          // landed cost, so the whole RFQ is re-leveled rather than left stale.
          const quote = await db.getVendorQuoteById(id);
          if (quote?.rfqId) {
            try {
              await normalizeQuotesForRfq(quote.rfqId);
            } catch (e) {
              console.warn('[VendorQuotes] Normalization after quote update failed:', e);
            }
          }
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', id);
          return { success: true };
        }),
      
      // Accept quote and optionally convert to PO
      accept: opsProcedure
        .input(z.object({ id: z.number(), createPO: z.boolean().optional() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getVendorQuoteById(input.id);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          // Mark quote as accepted
          await db.updateVendorQuote(input.id, { status: 'accepted' });
          
          // Reject other quotes for this RFQ
          const otherQuotes = await db.getVendorQuotes({ rfqId: quote.rfqId });
          for (const q of otherQuotes) {
            if (q.id !== input.id && q.status === 'received') {
              await db.updateVendorQuote(q.id, { status: 'rejected' });
            }
          }
          
          // Update RFQ status
          await db.updateVendorRfq(quote.rfqId, { status: 'awarded' });
          
          // Send award notification email
          const vendor = await db.getVendorById(quote.vendorId);
          const rfq = await db.getVendorRfqById(quote.rfqId);
          if (vendor?.email && rfq && isEmailConfigured()) {
            const emailBody = `Dear ${vendor.name},\n\nWe are pleased to inform you that your quote for ${rfq.materialName} (RFQ: ${rfq.rfqNumber}) has been accepted.\n\nWe will be in touch shortly with a formal Purchase Order.\n\nThank you for your competitive pricing.\n\nBest regards`;
            await sendEmail({
              to: vendor.email,
              subject: `Quote Accepted: ${rfq.rfqNumber} - ${rfq.materialName}`,
              text: emailBody,
              html: formatEmailHtml(emailBody),
            });
            await db.createVendorRfqEmail({
              rfqId: quote.rfqId,
              vendorId: quote.vendorId,
              quoteId: input.id,
              direction: 'outbound',
              emailType: 'award_notification',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
              toEmail: vendor.email,
              subject: `Quote Accepted: ${rfq.rfqNumber}`,
              body: emailBody,
              aiGenerated: false,
              sendStatus: 'sent',
              sentAt: new Date(),
            });
          }
          
          let poId: number | undefined;
          
          // Create PO if requested
          if (input.createPO && rfq) {
            const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex').toUpperCase()}`;
            const poResult = await db.createPurchaseOrder({
              poNumber,
              vendorId: quote.vendorId,
              status: 'draft',
              orderDate: new Date(),
              subtotal: quote.totalPrice || '0',
              totalAmount: quote.totalWithCharges || quote.totalPrice || '0',
              notes: `Created from accepted quote ${quote.quoteNumber || quote.id} for RFQ ${rfq.rfqNumber}`,
            });
            poId = poResult.id;
            
            // Add line item if raw material is linked
            if (rfq.rawMaterialId) {
              await db.createPurchaseOrderItem({
                purchaseOrderId: poResult.id,
                productId: null,
                description: rfq.materialName,
                quantity: quote.quantity || rfq.quantity || '1',
                unitPrice: quote.unitPrice || '0',
                totalAmount: quote.totalPrice || '0',
              });
            }
            
            // Update quote with PO reference
            await db.updateVendorQuote(input.id, { 
              status: 'converted_to_po',
              convertedToPOId: poResult.id,
              convertedAt: new Date(),
            });
            
            await createAuditLog(ctx.user.id, 'create', 'purchase_order', poResult.id, `Created from vendor quote ${input.id}`);
          }
          
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', input.id, 'Quote accepted');
          return { success: true, poId };
        }),
      
      // Reject quote
      reject: opsProcedure
        .input(z.object({ id: z.number(), reason: z.string().optional(), sendNotification: z.boolean().optional() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getVendorQuoteById(input.id);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          await db.updateVendorQuote(input.id, { status: 'rejected', notes: input.reason });
          
          // Send rejection notification if requested
          if (input.sendNotification) {
            const vendor = await db.getVendorById(quote.vendorId);
            const rfq = await db.getVendorRfqById(quote.rfqId);
            if (vendor?.email && rfq && isEmailConfigured()) {
              const emailBody = `Dear ${vendor.name},\n\nThank you for submitting your quote for ${rfq.materialName} (RFQ: ${rfq.rfqNumber}).\n\nAfter careful consideration, we have decided to proceed with another supplier for this order.${input.reason ? `\n\nReason: ${input.reason}` : ''}\n\nWe appreciate your time and look forward to future opportunities.\n\nBest regards`;
              await sendEmail({
                to: vendor.email,
                subject: `Quote Update: ${rfq.rfqNumber} - ${rfq.materialName}`,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              await db.createVendorRfqEmail({
                rfqId: quote.rfqId,
                vendorId: quote.vendorId,
                quoteId: input.id,
                direction: 'outbound',
                emailType: 'rejection_notification',
                fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
                toEmail: vendor.email,
                subject: `Quote Update: ${rfq.rfqNumber}`,
                body: emailBody,
                aiGenerated: false,
                sendStatus: 'sent',
                sentAt: new Date(),
              });
            }
          }
          
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', input.id, 'Quote rejected');
          return { success: true };
        }),
      
      // Get best quote for an RFQ
      getBest: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getBestVendorQuote(input.rfqId)),
      
      // AI analyze and rank quotes
      analyzeAndRank: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          // Rank quotes by price
          const allQuotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          const sortedQuotes = allQuotes
            .filter(q => q.status === 'received')
            .sort((a, b) => parseFloat(a.totalPrice || '999999') - parseFloat(b.totalPrice || '999999'));
          for (let i = 0; i < sortedQuotes.length; i++) {
            await db.updateVendorQuote(sortedQuotes[i].id, { overallRank: i + 1 });
          }
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', input.rfqId, 'AI analyzed and ranked quotes');
          return { success: true };
        }),

      // AI bid leveling: normalize quotes to a common scope baseline, detect
      // scope deviations vs the RFQ requirements, and re-rank on leveled cost.
      levelBids: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });

          const allQuotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          const quotes = allQuotes.filter(q => ['received', 'under_review'].includes(q.status));
          if (quotes.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No received quotes to level for this RFQ' });
          }

          // Batch-load vendors (avoid an N+1 per-quote lookup).
          const uniqueVendorIds = Array.from(new Set(quotes.map(q => q.vendorId)));
          const vendorList = await db.getVendorsByIds(uniqueVendorIds);
          const vendorNames = new Map<number, string>(uniqueVendorIds.map(id => [id, `Vendor ${id}`]));
          for (const v of vendorList) vendorNames.set(v.id, v.name || `Vendor ${v.id}`);

          // Level the money deterministically FIRST. The model narrates scope
          // deviations on top of these numbers; it does not compute them, so an
          // award recommendation always traces back to arithmetic we can show.
          const normalization = await normalizeQuotesForRfq(input.rfqId);
          const normalizedById = new Map(normalization.results.map(r => [r.quoteId, r]));
          const basis = normalization.basis;

          const requirementBlock = `RFQ ${rfq.rfqNumber}
Material: ${rfq.materialName}${rfq.materialDescription ? ` — ${rfq.materialDescription}` : ''}
Required quantity: ${rfq.quantity} ${rfq.unit}
Specifications: ${rfq.specifications || 'Standard'}
Required delivery date: ${rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}
Delivery location: ${rfq.deliveryLocation || 'TBD'}
Incoterms requested: ${rfq.incoterms || 'Not specified'}

COMPARISON BASIS (already applied to the landed costs below):
Base currency: ${basis.baseCurrency}
Leveled to Incoterm: ${basis.targetIncoterm}
Freight allowance: ${basis.freightAllowancePerUnit != null ? `${basis.freightAllowancePerUnit}/unit` : basis.freightAllowancePct != null ? `${basis.freightAllowancePct}% of goods` : 'not configured'}
Duty rate: ${basis.dutyRatePct != null ? `${basis.dutyRatePct}%` : 'not configured'}
Insurance rate: ${basis.insuranceRatePct != null ? `${basis.insuranceRatePct}%` : 'not configured'}
Tooling amortized over: ${basis.amortizeToolingOverUnits != null ? `${basis.amortizeToolingOverUnits} units` : 'this order only'}`;

          const quoteBlocks = quotes.map(q => `Quote id ${q.id} — ${vendorNames.get(q.vendorId)}
  Unit price: ${q.unitPrice ?? 'n/a'} ${q.currency || 'USD'}
  Quantity quoted: ${q.quantity ?? 'n/a'}
  Total price: ${q.totalPrice ?? 'n/a'}
  Shipping: ${q.shippingCost ?? '0'}, Handling: ${q.handlingFee ?? '0'}, Tax: ${q.taxAmount ?? '0'}, Other: ${q.otherCharges ?? '0'}
  Total with charges: ${q.totalWithCharges ?? 'n/a'}
  Lead time: ${q.leadTimeDays ?? 'n/a'} days
  Minimum order qty: ${q.minimumOrderQty ?? 'n/a'}
  Payment terms: ${q.paymentTerms || 'n/a'}
  Valid until: ${q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'n/a'}
  Vendor notes: ${q.notes || 'none'}
  --- computed landed cost (authoritative, do not recompute) ---
${(() => {
    const n = normalizedById.get(q.id);
    if (!n) return '  Not normalized.';
    const lines = [
      `  Incoterm quoted: ${n.incoterms.quoted ?? 'not stated'}${n.incoterms.namedPlace ? ` ${n.incoterms.namedPlace}` : ''} (leveled to ${n.incoterms.target})`,
      `  Billable quantity: ${n.billableQuantity}${n.moqShortfallUnits > 0 ? ` (includes ${n.moqShortfallUnits} MOQ surplus units)` : ''}`,
      `  Tooling per unit: ${n.toolingPerUnit}`,
      n.fx ? `  FX: 1 ${n.quoteCurrency} = ${n.fx.rate} ${n.baseCurrency} (${n.fx.source}, as of ${n.fx.asOf.toISOString().slice(0, 10)})` : `  FX: none needed or unavailable`,
      n.comparable
        ? `  LANDED TOTAL: ${n.landedTotalCost} ${n.baseCurrency} | LANDED UNIT: ${n.landedUnitCost} ${n.baseCurrency}`
        : `  NOT COMPARABLE — excluded from the cost ranking`,
      `  Cost breakdown: ${n.breakdown.map(b => `${b.label}=${b.amount}`).join('; ')}`,
    ];
    if (n.warnings.length) {
      lines.push(`  Computation warnings: ${n.warnings.map(w => `[${w.code}] ${w.message}`).join(' ')}`);
    }
    return lines.join('\n');
  })()}`).join('\n\n');

          const prompt = `You are a procurement analyst performing BID LEVELING for a single-material RFQ.
Bid leveling means adjusting each vendor's quote to a common scope baseline so prices are compared on equal terms, surfacing hidden assumptions and scope gaps.

RFQ REQUIREMENTS:
${requirementBlock}

VENDOR QUOTES:
${quoteBlocks}

The landed costs above are already computed deterministically (FX conversion at a dated rate, Incoterm gap allowances, MOQ reconciliation, tooling amortization). Do NOT recompute or second-guess them.

For EACH quote:
1. Set "leveledTotalCost" to exactly the LANDED TOTAL shown for that quote. If a quote is marked NOT COMPARABLE, set it to null.
2. Identify scopeDeviations: each is { requirement, finding, severity } where requirement is the specific RFQ requirement (e.g. "delivery date", "incoterms", "quantity", "specifications", "payment terms"), finding describes how this quote diverges, and severity is "low" | "medium" | "high". Return an empty array if fully compliant.
3. Write a one-to-two sentence rationale that explains what drove this quote's landed cost away from its headline price (Incoterm gaps, MOQ surplus, tooling, FX) and flags any computation warning a buyer must act on.
4. Give a score 0-100 (higher = better leveled value, balancing landed cost, lead time, compliance and the risk implied by the warnings).

Then rank all quotes by best leveled value (1 = best; quotes marked NOT COMPARABLE rank last), recommend one quoteId to award, and write a short award-recommendation summary a procurement manager could defend to an auditor. Never recommend a NOT COMPARABLE quote — say what is missing instead.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a procurement bid-leveling analyst. Always respond with valid JSON matching the schema. Be conservative and explicit about assumptions.' },
              { role: 'user', content: prompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'bid_leveling',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    quotes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          quoteId: { type: 'number' },
                          leveledTotalCost: { type: 'number' },
                          leveledRank: { type: 'number' },
                          score: { type: 'number' },
                          rationale: { type: 'string' },
                          scopeDeviations: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                requirement: { type: 'string' },
                                finding: { type: 'string' },
                                severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                              },
                              required: ['requirement', 'finding', 'severity'],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ['quoteId', 'leveledTotalCost', 'leveledRank', 'score', 'rationale', 'scopeDeviations'],
                        additionalProperties: false,
                      },
                    },
                    recommendedQuoteId: { type: 'number' },
                    summary: { type: 'string' },
                  },
                  required: ['quotes', 'recommendedQuoteId', 'summary'],
                  additionalProperties: false,
                },
              },
            },
          });

          // Tolerant recovery: the model sometimes prefixes the fenced block with a
          // sentence, which a single fence-strip would turn into a failed mutation.
          const parsed = parseLlmJson(response.choices[0]?.message?.content);
          if (parsed === null) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to parse bid-leveling response' });
          }

          // `response_format: json_schema` is only a prompt hint here (see
          // server/_core/llm.ts) — nothing enforces the shape — so validate at
          // runtime. The overall structure must match; per-quote field fuzz the
          // model may emit (bad severity casing, missing numbers) falls back
          // rather than failing the whole leveling pass.
          const deviationSchema = z.object({
            requirement: z.string().catch(''),
            finding: z.string().catch(''),
            severity: z
              .preprocess(v => (typeof v === 'string' ? v.toLowerCase() : v), z.enum(['low', 'medium', 'high']))
              .catch('medium'),
          });
          const leveledQuoteSchema = z.object({
            quoteId: z.number(),
            leveledTotalCost: z.number().nullable().catch(null),
            leveledRank: z.number().nullable().catch(null),
            score: z.number().nullable().catch(null),
            rationale: z.string().nullable().catch(null),
            scopeDeviations: z.array(deviationSchema).catch([]),
          });
          const responseSchema = z.object({
            quotes: z.array(leveledQuoteSchema),
            recommendedQuoteId: z.number().nullable().catch(null),
            summary: z.string(),
          });
          const validation = responseSchema.safeParse(parsed);
          if (!validation.success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Bid-leveling response did not match the expected shape',
            });
          }
          const leveled = validation.data;

          const now = new Date();
          const validIds = new Set(quotes.map(q => q.id));
          for (const item of leveled.quotes) {
            if (!validIds.has(item.quoteId)) continue;
            // Where normalization produced a verdict it is authoritative — including
            // its verdict that a quote is NOT comparable, which must clear both the
            // cost and the rank rather than falling back to the model's guess.
            // The model's numbers are used only for a quote normalization never saw.
            const computed = normalizedById.get(item.quoteId);
            const leveledTotalCost = computed
              ? (computed.comparable && computed.landedTotalCost != null
                  ? computed.landedTotalCost.toFixed(2)
                  : null)
              : (item.leveledTotalCost != null ? item.leveledTotalCost.toFixed(2) : null);
            await db.updateVendorQuote(item.quoteId, {
              leveledTotalCost,
              leveledRank: computed ? computed.rank : item.leveledRank,
              scopeDeviations: JSON.stringify(item.scopeDeviations),
              leveledNotes: item.rationale,
              leveledAt: now,
              // Only set aiScore when the model returned a number, so a missing
              // score leaves the existing column value untouched.
              ...(item.score != null ? { aiScore: Math.round(item.score) } : {}),
            });
          }

          await db.updateVendorRfq(input.rfqId, {
            levelingSummary: leveled.summary || null,
            leveledAt: now,
          });

          // Only surface a recommendation that maps to a real quote on this RFQ
          // AND to one that survived normalization; ignore a hallucinated id or
          // a recommendation for a quote we could not put on the common basis.
          const recommendedQuoteId =
            leveled.recommendedQuoteId != null &&
            validIds.has(leveled.recommendedQuoteId) &&
            normalizedById.get(leveled.recommendedQuoteId)?.comparable !== false
              ? leveled.recommendedQuoteId
              : normalization.bestQuoteId;

          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', input.rfqId, `AI bid leveling across ${quotes.length} quotes`);
          return {
            success: true,
            leveledCount: quotes.length,
            recommendedQuoteId,
            summary: leveled.summary,
            basis: normalization.basis,
            comparableCount: normalization.comparableCount,
            excludedCount: normalization.excludedCount,
          };
        }),

      // Deterministic normalization only — no LLM. Puts every received quote on
      // the RFQ's comparison basis and ranks by landed cost.
      normalize: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const result = await normalizeQuotesForRfq(input.rfqId);
          await createAuditLog(
            ctx.user.id,
            'update',
            'vendor_rfq',
            input.rfqId,
            `Normalized ${result.results.length} quotes to ${result.basis.baseCurrency} / ${result.basis.targetIncoterm}`,
          );
          return result;
        }),

      // Side-by-side comparison payload for the UI: stored quote rows joined to
      // freshly computed landed costs, so the table never shows a stale rank.
      comparison: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(async ({ input }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });

          const quotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          if (quotes.length === 0) {
            return { rfq, basis: basisFromRfq(rfq as any), rows: [], comparableCount: 0, excludedCount: 0 };
          }

          // Persist:false keeps a read-only query from writing.
          const normalization = await normalizeQuotesForRfq(input.rfqId, { persist: false });
          const normalizedById = new Map(normalization.results.map(r => [r.quoteId, r]));

          const vendorIds = Array.from(new Set(quotes.map(q => q.vendorId)));
          const vendorList = await db.getVendorsByIds(vendorIds);
          const vendorById = new Map(vendorList.map(v => [v.id, v]));

          const rows = quotes.map(q => ({
            quote: q,
            vendor: vendorById.get(q.vendorId) ?? null,
            normalized: normalizedById.get(q.id) ?? null,
          }));
          rows.sort((a, b) => {
            const ra = a.normalized?.rank ?? Number.MAX_SAFE_INTEGER;
            const rb = b.normalized?.rank ?? Number.MAX_SAFE_INTEGER;
            return ra - rb;
          });

          return {
            rfq,
            basis: normalization.basis,
            rows,
            comparableCount: normalization.comparableCount,
            excludedCount: normalization.excludedCount,
          };
        }),
    }),

    // Emails
    emails: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional(), vendorId: z.number().optional() }).optional())
        .query(({ input }) => db.getVendorRfqEmails(input)),

      // Parse an inbound vendor reply (body and/or an attached quote sheet) into
      // a structured quote, match it to the vendor and the open RFQ, and level it.
      parseIncoming: opsProcedure
        .input(z.object({
          fromEmail: z.string().email(),
          fromName: z.string().optional(),
          subject: z.string(),
          body: z.string(),
          htmlBody: z.string().optional(),
          receivedAt: z.date().optional(),
          attachment: z.object({
            fileUrl: z.string().refine(isFetchableAttachmentUrl, {
              message: 'Attachment URL must be an uploaded storage URL.',
            }),
            fileName: z.string(),
          }).optional(),
          // Supply these to override matching when the buyer already knows them.
          vendorId: z.number().optional(),
          rfqId: z.number().optional(),
          externalMessageId: z.string().optional(),
          threadId: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await ingestVendorQuoteEmail(input);
          if (result.quoteId) {
            await createAuditLog(
              ctx.user.id,
              'create',
              'vendor_quote',
              result.quoteId,
              `Parsed from vendor email: ${input.subject}`,
            );
          }
          return result;
        }),

      // Extract a quote from a document without writing anything — lets a buyer
      // review the extraction before it lands on the RFQ.
      previewAttachment: opsProcedure
        .input(z.object({
          fileUrl: z.string().url(),
          fileName: z.string(),
          context: z.string().optional(),
        }))
        .mutation(({ input }) => parseVendorQuoteAttachment(input)),

      previewEmail: opsProcedure
        .input(z.object({
          subject: z.string(),
          body: z.string(),
          fromEmail: z.string().email().optional(),
          fromName: z.string().optional(),
        }))
        .mutation(({ input }) => parseVendorQuoteEmail(input)),
    }),

    // Measured vendor responsiveness on RFQs (no LLM, no defaults).
    responsiveness: router({
      byVendor: protectedProcedure
        .input(z.object({
          vendorId: z.number(),
          sinceDays: z.number().min(1).max(1095).optional(),
        }))
        .query(({ input }) =>
          computeVendorResponsiveness(input.vendorId, {
            since: input.sinceDays
              ? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000)
              : undefined,
          }),
        ),

      leaderboard: protectedProcedure
        .input(z.object({ sinceDays: z.number().min(1).max(1095).optional() }).optional())
        .query(async ({ input }) => {
          const vendorList = await db.getVendors();
          const since = input?.sinceDays
            ? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000)
            : undefined;
          const metrics = await computeResponsivenessForVendors(vendorList.map(v => v.id), { since });
          return vendorList
            .map(v => {
              const m = metrics.get(v.id);
              // `m` already carries vendorId.
              return m ? { vendorName: v.name, ...m, scoring: responsivenessScoreFromMetrics(m) } : null;
            })
            .filter((r): r is NonNullable<typeof r> => r !== null && r.invited > 0)
            .sort((a, b) => (b.scoring.score ?? -1) - (a.scoring.score ?? -1));
        }),

      // Close out invitations that went past their due date with no reply, so
      // silent vendors register as unresponsive instead of sitting as "sent".
      closeStaleInvitations: opsProcedure
        .input(z.object({ graceDays: z.number().min(0).max(90).optional() }).optional())
        .mutation(({ input }) => markStaleInvitationsNoResponse({ graceDays: input?.graceDays })),
    }),
  });

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { router, protectedProcedure, opsProcedure, createAuditLog } from "./middleware";

export const freightRouter = router({
  // ============================================
  // FREIGHT MANAGEMENT
  // ============================================
  freight: router({
    // Dashboard stats
    dashboardStats: protectedProcedure.query(() => db.getFreightDashboardStats()),
    
    // Carriers
    carriers: router({
      list: protectedProcedure
        .input(z.object({ type: z.string().optional(), isActive: z.boolean().optional() }).optional())
        .query(({ input }) => db.getFreightCarriers(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightCarrierById(input.id)),
      create: opsProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(['ocean', 'air', 'ground', 'rail', 'multimodal']),
          contactName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          country: z.string().optional(),
          website: z.string().optional(),
          notes: z.string().optional(),
          isPreferred: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createFreightCarrier(input);
          await createAuditLog(ctx.user.id, 'create', 'freight_carrier', result.id, input.name);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          type: z.enum(['ocean', 'air', 'ground', 'rail', 'multimodal']).optional(),
          contactName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          country: z.string().optional(),
          website: z.string().optional(),
          notes: z.string().optional(),
          isPreferred: z.boolean().optional(),
          isActive: z.boolean().optional(),
          rating: z.number().min(1).max(5).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightCarrier(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_carrier', id);
          return { success: true };
        }),
    }),
    
    // RFQs
    rfqs: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional() }).optional())
        .query(({ input }) => db.getFreightRfqs(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightRfqById(input.id)),
      create: opsProcedure
        .input(z.object({
          title: z.string().min(1),
          originCountry: z.string().optional(),
          originCity: z.string().optional(),
          originAddress: z.string().optional(),
          destinationCountry: z.string().optional(),
          destinationCity: z.string().optional(),
          destinationAddress: z.string().optional(),
          cargoDescription: z.string().optional(),
          cargoType: z.enum(['general', 'hazardous', 'refrigerated', 'oversized', 'fragile', 'liquid', 'bulk']).optional(),
          totalWeight: z.string().optional(),
          totalVolume: z.string().optional(),
          numberOfPackages: z.number().optional(),
          hsCode: z.string().optional(),
          declaredValue: z.string().optional(),
          currency: z.string().optional(),
          preferredMode: z.enum(['ocean_fcl', 'ocean_lcl', 'air', 'express', 'ground', 'rail', 'any']).optional(),
          incoterms: z.string().optional(),
          requiredPickupDate: z.date().optional(),
          requiredDeliveryDate: z.date().optional(),
          insuranceRequired: z.boolean().optional(),
          customsClearanceRequired: z.boolean().optional(),
          purchaseOrderId: z.number().optional(),
          vendorId: z.number().optional(),
          notes: z.string().optional(),
          quoteDueDate: z.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createFreightRfq({ ...input, createdById: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'freight_rfq', result.id, result.rfqNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().optional(),
          status: z.enum(['draft', 'sent', 'awaiting_quotes', 'quotes_received', 'awarded', 'cancelled']).optional(),
          originCountry: z.string().optional(),
          originCity: z.string().optional(),
          originAddress: z.string().optional(),
          destinationCountry: z.string().optional(),
          destinationCity: z.string().optional(),
          destinationAddress: z.string().optional(),
          cargoDescription: z.string().optional(),
          totalWeight: z.string().optional(),
          totalVolume: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightRfq(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_rfq', id);
          return { success: true };
        }),
      
      // Send RFQ to carriers via AI email
      sendToCarriers: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          carrierIds: z.array(z.number()),
          includeSupplierDocs: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getFreightRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });
          
          // Get supplier documents if PO is linked
          let supplierDocs: any[] = [];
          let freightInfo: any = null;
          if (rfq.purchaseOrderId && input.includeSupplierDocs) {
            supplierDocs = await db.getSupplierDocuments({ purchaseOrderId: rfq.purchaseOrderId });
            freightInfo = await db.getSupplierFreightInfo(rfq.purchaseOrderId);
          }
          
          const results = { sent: 0, failed: 0, emails: [] as any[] };
          
          for (const carrierId of input.carrierIds) {
            const carrier = await db.getFreightCarrierById(carrierId);
            if (!carrier || !carrier.email) {
              results.failed++;
              continue;
            }
            
            // Build supplier documentation info for email
            let supplierDocsInfo = '';
            if (freightInfo) {
              supplierDocsInfo = `\n\nSHIPMENT DETAILS FROM SUPPLIER:\n`;
              supplierDocsInfo += `Total Packages: ${freightInfo.totalPackages || 'TBD'}\n`;
              supplierDocsInfo += `Gross Weight: ${freightInfo.totalGrossWeight || 'TBD'} ${freightInfo.weightUnit || 'kg'}\n`;
              supplierDocsInfo += `Net Weight: ${freightInfo.totalNetWeight || 'TBD'} ${freightInfo.weightUnit || 'kg'}\n`;
              supplierDocsInfo += `Volume: ${freightInfo.totalVolume || 'TBD'} ${freightInfo.volumeUnit || 'CBM'}\n`;
              if (freightInfo.packageDimensions) {
                try {
                  const dims = JSON.parse(freightInfo.packageDimensions);
                  supplierDocsInfo += `Package Dimensions: ${dims.map((d: any) => `${d.length}x${d.width}x${d.height}cm (${d.quantity} pcs)`).join(', ')}\n`;
                } catch {}
              }
              if (freightInfo.hsCodes) {
                try {
                  const codes = JSON.parse(freightInfo.hsCodes);
                  supplierDocsInfo += `HS Codes: ${codes.map((c: any) => c.code).join(', ')}\n`;
                } catch {}
              }
              if (freightInfo.hasDangerousGoods) {
                supplierDocsInfo += `DANGEROUS GOODS: Class ${freightInfo.dangerousGoodsClass}, UN ${freightInfo.unNumber}\n`;
              }
              if (freightInfo.specialInstructions) {
                supplierDocsInfo += `Special Instructions: ${freightInfo.specialInstructions}\n`;
              }
            }
            
            let attachmentsInfo = '';
            if (supplierDocs.length > 0) {
              attachmentsInfo = `\n\nATTACHED DOCUMENTATION:\n`;
              supplierDocs.forEach((doc: any) => {
                attachmentsInfo += `- ${doc.documentType.replace(/_/g, ' ').toUpperCase()}: ${doc.fileName}\n`;
              });
            }
            
            // Generate AI email content
            const emailPrompt = `Generate a professional freight quote request email for the following shipment:

RFQ Number: ${rfq.rfqNumber}
Title: ${rfq.title}
Origin: ${rfq.originCity || ''}, ${rfq.originCountry || ''}
Destination: ${rfq.destinationCity || ''}, ${rfq.destinationCountry || ''}
Cargo: ${rfq.cargoDescription || 'General cargo'}
Weight: ${rfq.totalWeight || freightInfo?.totalGrossWeight || 'TBD'} ${freightInfo?.weightUnit || 'kg'}
Volume: ${rfq.totalVolume || freightInfo?.totalVolume || 'TBD'} ${freightInfo?.volumeUnit || 'CBM'}
Packages: ${rfq.numberOfPackages || freightInfo?.totalPackages || 'TBD'}
Preferred Mode: ${rfq.preferredMode || 'Any'}
Incoterms: ${rfq.incoterms || freightInfo?.incoterms || 'TBD'}
Required Pickup: ${rfq.requiredPickupDate ? new Date(rfq.requiredPickupDate).toLocaleDateString() : freightInfo?.preferredShipDate ? new Date(freightInfo.preferredShipDate).toLocaleDateString() : 'Flexible'}
Required Delivery: ${rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}
Insurance Required: ${rfq.insuranceRequired ? 'Yes' : 'No'}
Customs Clearance Required: ${rfq.customsClearanceRequired ? 'Yes' : 'No'}${supplierDocsInfo}${attachmentsInfo}

Please provide:
1. Freight cost breakdown
2. Transit time
3. Routing
4. Quote validity period

Format the email professionally and request a response by ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : '5 business days'}.`;

            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are a logistics coordinator drafting freight quote request emails. Be professional, clear, and include all relevant shipment details.' },
                { role: 'user', content: emailPrompt },
              ],
            });
            
            const rawEmailBody = response.choices[0]?.message?.content;
            const emailBody = typeof rawEmailBody === 'string' ? rawEmailBody : 'Unable to generate email content.';
            
            const emailSubject = `Request for Quote: ${rfq.rfqNumber} - ${rfq.title}`;
            let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
            let deliveryError: string | undefined;
            
            // Try to send via SendGrid if configured
            if (isEmailConfigured()) {
              const sendResult = await sendEmail({
                to: carrier.email,
                subject: emailSubject,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              
              if (sendResult.success) {
                emailStatus = 'sent';
              } else {
                emailStatus = 'failed';
                deliveryError = sendResult.error;
              }
            }
            
            // Save the email record
            const emailResult = await db.createFreightEmail({
              rfqId: input.rfqId,
              carrierId,
              direction: 'outbound',
              emailType: 'rfq_request',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'logistics@company.com',
              toEmail: carrier.email,
              subject: emailSubject,
              body: emailBody,
              aiGenerated: true,
              status: emailStatus,
            });
            
            if (emailStatus === 'sent') {
              results.sent++;
            } else {
              results.failed++;
            }
            results.emails.push({ 
              carrierId, 
              carrierName: carrier.name, 
              emailId: emailResult.id,
              status: emailStatus,
              error: deliveryError,
            });
          }
          
          // Update RFQ status
          await db.updateFreightRfq(input.rfqId, { status: 'sent' });
          const emailConfigured = isEmailConfigured();
          const auditMessage = emailConfigured 
            ? `Emails sent to ${results.sent} carriers` 
            : `Email drafts created for ${results.sent + results.failed} carriers (SendGrid not configured)`;
          await createAuditLog(ctx.user.id, 'update', 'freight_rfq', input.rfqId, auditMessage);
          
          return { ...results, emailConfigured };
        }),
    }),
    
    // Quotes
    quotes: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional() }).optional())
        .query(({ input }) => db.getFreightQuotes(input?.rfqId)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightQuoteById(input.id)),
      create: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          carrierId: z.number(),
          quoteNumber: z.string().optional(),
          freightCost: z.string().optional(),
          fuelSurcharge: z.string().optional(),
          originCharges: z.string().optional(),
          destinationCharges: z.string().optional(),
          customsFees: z.string().optional(),
          insuranceCost: z.string().optional(),
          otherCharges: z.string().optional(),
          totalCost: z.string().optional(),
          currency: z.string().optional(),
          transitDays: z.number().optional(),
          shippingMode: z.string().optional(),
          routeDescription: z.string().optional(),
          validUntil: z.date().optional(),
          notes: z.string().optional(),
          receivedVia: z.enum(['email', 'portal', 'phone', 'manual']).optional(),
          rawEmailContent: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createFreightQuote({ ...input, status: 'received' });
          await createAuditLog(ctx.user.id, 'create', 'freight_quote', result.id);
          
          // Update RFQ status
          await db.updateFreightRfq(input.rfqId, { status: 'quotes_received' });
          
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'received', 'under_review', 'accepted', 'rejected', 'expired']).optional(),
          aiScore: z.number().optional(),
          aiAnalysis: z.string().optional(),
          aiRecommendation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightQuote(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_quote', id);
          return { success: true };
        }),
      
      // AI analyze and compare quotes
      analyzeQuotes: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const quotes = await db.getFreightQuotes(input.rfqId);
          const rfq = await db.getFreightRfqById(input.rfqId);
          
          if (!quotes.length) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No quotes to analyze' });
          }
          
          // Get carrier details for each quote
          const quotesWithCarriers = await Promise.all(
            quotes.map(async (q) => {
              const carrier = await db.getFreightCarrierById(q.carrierId);
              return { ...q, carrierName: carrier?.name, carrierRating: carrier?.rating };
            })
          );
          
          const analysisPrompt = `Analyze and compare these freight quotes for the following shipment:

Shipment Details:
- Route: ${rfq?.originCity}, ${rfq?.originCountry} → ${rfq?.destinationCity}, ${rfq?.destinationCountry}
- Cargo: ${rfq?.cargoDescription}
- Weight: ${rfq?.totalWeight} kg
- Volume: ${rfq?.totalVolume} CBM
- Required Delivery: ${rfq?.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}

Quotes Received:
${quotesWithCarriers.map((q, i) => `
Quote ${i + 1} - ${q.carrierName} (Rating: ${q.carrierRating || 'N/A'}/5):
- Total Cost: ${q.currency || 'USD'} ${q.totalCost}
- Transit Days: ${q.transitDays || 'N/A'}
- Shipping Mode: ${q.shippingMode || 'N/A'}
- Route: ${q.routeDescription || 'N/A'}
- Valid Until: ${q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'N/A'}
- Breakdown: Freight: ${q.freightCost}, Fuel: ${q.fuelSurcharge}, Origin: ${q.originCharges}, Dest: ${q.destinationCharges}, Customs: ${q.customsFees}`).join('\n')}

Provide:
1. A score (1-100) for each quote based on cost, transit time, reliability, and value
2. Pros and cons for each quote
3. A clear recommendation with reasoning
4. Any red flags or concerns

Format your response as JSON with the structure:
{
  "quotes": [
    { "carrierId": number, "score": number, "pros": [string], "cons": [string] }
  ],
  "recommendation": { "carrierId": number, "reasoning": string },
  "summary": string
}`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a freight logistics expert analyzing shipping quotes. Provide detailed, data-driven analysis.' },
              { role: 'user', content: analysisPrompt },
            ],
          });
          
          const rawAnalysis = response.choices[0]?.message?.content;
          const analysisText = typeof rawAnalysis === 'string' ? rawAnalysis : '{}';
          
          // Try to parse JSON from the response
          let analysis;
          try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, analysisText];
            analysis = JSON.parse(jsonMatch[1] || analysisText);
          } catch {
            analysis = { summary: analysisText, quotes: [], recommendation: null };
          }
          
          // Update quotes with AI scores
          for (const quoteAnalysis of analysis.quotes || []) {
            if (quoteAnalysis.carrierId) {
              const quote = quotes.find(q => q.carrierId === quoteAnalysis.carrierId);
              if (quote) {
                await db.updateFreightQuote(quote.id, {
                  aiScore: quoteAnalysis.score,
                  aiAnalysis: JSON.stringify({ pros: quoteAnalysis.pros, cons: quoteAnalysis.cons }),
                  aiRecommendation: analysis.recommendation?.carrierId === quoteAnalysis.carrierId ? 'Recommended' : undefined,
                });
              }
            }
          }
          
          await createAuditLog(ctx.user.id, 'view', 'freight_quote_analysis', input.rfqId);
          
          return analysis;
        }),
      
      // Accept a quote and create booking
      accept: opsProcedure
        .input(z.object({ quoteId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getFreightQuoteById(input.quoteId);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          // Update quote status
          await db.updateFreightQuote(input.quoteId, { status: 'accepted' });
          
          // Reject other quotes for this RFQ
          const otherQuotes = await db.getFreightQuotes(quote.rfqId);
          for (const q of otherQuotes) {
            if (q.id !== input.quoteId && q.status !== 'rejected') {
              await db.updateFreightQuote(q.id, { status: 'rejected' });
            }
          }
          
          // Create booking
          const booking = await db.createFreightBooking({
            quoteId: input.quoteId,
            rfqId: quote.rfqId,
            carrierId: quote.carrierId,
            status: 'pending',
            agreedCost: quote.totalCost,
            currency: quote.currency || 'USD',
          });
          
          // Update RFQ status
          await db.updateFreightRfq(quote.rfqId, { status: 'awarded' });
          
          await createAuditLog(ctx.user.id, 'approve', 'freight_quote', input.quoteId, `Booking ${booking.bookingNumber} created`);
          
          return { booking };
        }),
    }),
    
    // Emails
    emails: router({
      list: protectedProcedure
        .input(z.object({
          rfqId: z.number().optional(),
          carrierId: z.number().optional(),
          direction: z.enum(['outbound', 'inbound']).optional(),
        }).optional())
        .query(({ input }) => db.getFreightEmails(input)),
      
      // Parse incoming email with AI
      parseIncoming: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          carrierId: z.number(),
          fromEmail: z.string(),
          subject: z.string(),
          body: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Use AI to extract quote data from email
          const parsePrompt = `Extract freight quote information from this email:

From: ${input.fromEmail}
Subject: ${input.subject}

Body:
${input.body}

Extract and return as JSON:
{
  "quoteNumber": string or null,
  "freightCost": number or null,
  "fuelSurcharge": number or null,
  "originCharges": number or null,
  "destinationCharges": number or null,
  "customsFees": number or null,
  "totalCost": number or null,
  "currency": string (default "USD"),
  "transitDays": number or null,
  "shippingMode": string or null,
  "routeDescription": string or null,
  "validUntil": string (ISO date) or null,
  "notes": string or null
}`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a logistics data extraction expert. Extract structured quote data from freight emails accurately.' },
              { role: 'user', content: parsePrompt },
            ],
          });
          
          const rawExtracted = response.choices[0]?.message?.content;
          const extractedText = typeof rawExtracted === 'string' ? rawExtracted : '{}';
          
          let extractedData;
          try {
            const jsonMatch = extractedText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, extractedText];
            extractedData = JSON.parse(jsonMatch[1] || extractedText);
          } catch {
            extractedData = {};
          }
          
          // Save the email
          const emailResult = await db.createFreightEmail({
            rfqId: input.rfqId,
            carrierId: input.carrierId,
            direction: 'inbound',
            emailType: 'quote_response',
            fromEmail: input.fromEmail,
            toEmail: 'logistics@company.com',
            subject: input.subject,
            body: input.body,
            aiParsed: true,
            aiExtractedData: JSON.stringify(extractedData),
            status: 'read',
          });
          
          // If we extracted valid quote data, create a quote
          if (extractedData.totalCost) {
            const quoteResult = await db.createFreightQuote({
              rfqId: input.rfqId,
              carrierId: input.carrierId,
              quoteNumber: extractedData.quoteNumber,
              freightCost: extractedData.freightCost?.toString(),
              fuelSurcharge: extractedData.fuelSurcharge?.toString(),
              originCharges: extractedData.originCharges?.toString(),
              destinationCharges: extractedData.destinationCharges?.toString(),
              customsFees: extractedData.customsFees?.toString(),
              totalCost: extractedData.totalCost?.toString(),
              currency: extractedData.currency || 'USD',
              transitDays: extractedData.transitDays,
              shippingMode: extractedData.shippingMode,
              routeDescription: extractedData.routeDescription,
              validUntil: extractedData.validUntil ? new Date(extractedData.validUntil) : undefined,
              notes: extractedData.notes,
              receivedVia: 'email',
              rawEmailContent: input.body,
              status: 'received',
            });
            
            return { email: emailResult, quote: quoteResult, extractedData };
          }
          
          return { email: emailResult, quote: null, extractedData };
        }),
    }),
    
    // Bookings
    bookings: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional() }).optional())
        .query(({ input }) => db.getFreightBookings(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightBookingById(input.id)),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'confirmed', 'in_transit', 'arrived', 'delivered', 'cancelled']).optional(),
          trackingNumber: z.string().optional(),
          containerNumber: z.string().optional(),
          vesselName: z.string().optional(),
          voyageNumber: z.string().optional(),
          pickupDate: z.date().optional(),
          departureDate: z.date().optional(),
          arrivalDate: z.date().optional(),
          deliveryDate: z.date().optional(),
          actualCost: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightBooking(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_booking', id);
          return { success: true };
        }),
    }),
  }),
  // ============================================
  // CUSTOMS CLEARANCE
  // ============================================
  customs: router({
    clearances: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional(), type: z.enum(['import', 'export']).optional() }).optional())
        .query(({ input }) => db.getCustomsClearances(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCustomsClearanceById(input.id)),
      create: opsProcedure
        .input(z.object({
          shipmentId: z.number().optional(),
          rfqId: z.number().optional(),
          type: z.enum(['import', 'export']),
          customsOffice: z.string().optional(),
          portOfEntry: z.string().optional(),
          country: z.string().optional(),
          customsBrokerId: z.number().optional(),
          brokerReference: z.string().optional(),
          expectedClearanceDate: z.date().optional(),
          hsCode: z.string().optional(),
          countryOfOrigin: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createCustomsClearance(input);
          await createAuditLog(ctx.user.id, 'create', 'customs_clearance', result.id, result.clearanceNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending_documents', 'documents_submitted', 'under_review', 'additional_info_required', 'cleared', 'held', 'rejected']).optional(),
          submissionDate: z.date().optional(),
          expectedClearanceDate: z.date().optional(),
          actualClearanceDate: z.date().optional(),
          dutyAmount: z.string().optional(),
          taxAmount: z.string().optional(),
          otherFees: z.string().optional(),
          totalAmount: z.string().optional(),
          notes: z.string().optional(),
          warehouseId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, warehouseId, ...data } = input;

          if (data.status === 'cleared') {
            const clearance = await db.getCustomsClearanceById(id);
            if (clearance?.shipmentId) {
              if (!warehouseId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'warehouseId is required when clearing customs with inventory update' });
              }
              const shipment = await db.getShipmentById(clearance.shipmentId);
              if (shipment?.purchaseOrderId) {
                const poItems = await db.getPurchaseOrderItems(shipment.purchaseOrderId);
                for (const item of poItems) {
                  if (!item.productId) continue;
                  const allInventory = await db.getInventory();
                  const existing = allInventory.find(
                    (inv: any) => inv.productId === item.productId && inv.warehouseId === warehouseId
                  );
                  const qty = item.quantity ?? '0';
                  if (existing) {
                    await db.updateInventory(existing.id, {
                      quantity: String(Number(existing.quantity) + Number(qty)),
                    });
                  } else {
                    await db.createInventory({
                      productId: item.productId,
                      warehouseId,
                      quantity: qty,
                      companyId: (shipment as any).companyId,
                    });
                  }
                  await db.createInventoryTransaction({
                    transactionType: 'receive',
                    productId: item.productId,
                    toWarehouseId: warehouseId,
                    quantity: qty,
                    referenceType: 'shipment',
                    referenceId: clearance.shipmentId,
                    performedBy: ctx.user.id,
                  } as any);
                  await db.updatePurchaseOrderItem(item.id, { receivedQuantity: qty });
                }
                await db.updateShipment(clearance.shipmentId, { status: 'delivered' });
              }
            }
          }

          await db.updateCustomsClearance(id, data);
          await createAuditLog(ctx.user.id, 'update', 'customs_clearance', id);
          return { success: true };
        }),
      
      // AI summary of clearance status
      getSummary: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const clearance = await db.getCustomsClearanceById(input.id);
          if (!clearance) return null;
          
          const documents = await db.getCustomsDocuments(input.id);
          
          const summaryPrompt = `Summarize the customs clearance status:

Clearance Number: ${clearance.clearanceNumber}
Type: ${clearance.type}
Status: ${clearance.status}
Port: ${clearance.portOfEntry || 'N/A'}
Country: ${clearance.country || 'N/A'}
HS Code: ${clearance.hsCode || 'N/A'}
Country of Origin: ${clearance.countryOfOrigin || 'N/A'}

Documents (${documents.length} total):
${documents.map(d => `- ${d.documentType}: ${d.status}`).join('\n')}

Duties/Taxes:
- Duty: ${clearance.dutyAmount || 'TBD'}
- Tax: ${clearance.taxAmount || 'TBD'}
- Other: ${clearance.otherFees || 'TBD'}
- Total: ${clearance.totalAmount || 'TBD'}

Provide a brief status summary, any missing documents, and next steps.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a customs clearance specialist. Provide clear, actionable status summaries.' },
              { role: 'user', content: summaryPrompt },
            ],
          });
          
          const rawSummary = response.choices[0]?.message?.content;
          return {
            clearance,
            documents,
            aiSummary: typeof rawSummary === 'string' ? rawSummary : 'Unable to generate summary.',
          };
        }),
    }),
    
    documents: router({
      list: protectedProcedure
        .input(z.object({ clearanceId: z.number() }))
        .query(({ input }) => db.getCustomsDocuments(input.clearanceId)),
      create: opsProcedure
        .input(z.object({
          clearanceId: z.number(),
          documentType: z.enum([
            'commercial_invoice', 'packing_list', 'bill_of_lading', 'airway_bill',
            'certificate_of_origin', 'customs_declaration', 'import_license', 'export_license',
            'insurance_certificate', 'inspection_certificate', 'phytosanitary_certificate',
            'fumigation_certificate', 'dangerous_goods_declaration', 'other'
          ]),
          name: z.string(),
          fileUrl: z.string().optional(),
          fileKey: z.string().optional(),
          mimeType: z.string().optional(),
          fileSize: z.number().optional(),
          expiryDate: z.date().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createCustomsDocument({ ...input, status: input.fileUrl ? 'uploaded' : 'pending' });
          await createAuditLog(ctx.user.id, 'create', 'customs_document', result.id, input.name);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'uploaded', 'verified', 'rejected', 'expired']).optional(),
          fileUrl: z.string().optional(),
          fileKey: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          if (data.status === 'verified') {
            (data as any).verifiedAt = new Date();
            (data as any).verifiedById = ctx.user.id;
          }
          await db.updateCustomsDocument(id, data);
          await createAuditLog(ctx.user.id, 'update', 'customs_document', id);
          return { success: true };
        }),
      
      // Upload document file
      upload: opsProcedure
        .input(z.object({
          clearanceId: z.number(),
          documentType: z.enum([
            'commercial_invoice', 'packing_list', 'bill_of_lading', 'airway_bill',
            'certificate_of_origin', 'customs_declaration', 'import_license', 'export_license',
            'insurance_certificate', 'inspection_certificate', 'phytosanitary_certificate',
            'fumigation_certificate', 'dangerous_goods_declaration', 'other'
          ]),
          name: z.string(),
          fileData: z.string(), // Base64 encoded
          mimeType: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const buffer = Buffer.from(input.fileData, 'base64');
          const fileKey = `customs/${input.clearanceId}/${nanoid()}-${input.name}`;
          
          const { url } = await storagePut(fileKey, buffer, input.mimeType);
          
          const result = await db.createCustomsDocument({
            clearanceId: input.clearanceId,
            documentType: input.documentType,
            name: input.name,
            fileUrl: url,
            fileKey,
            mimeType: input.mimeType,
            fileSize: buffer.length,
            status: 'uploaded',
          });
          
          await createAuditLog(ctx.user.id, 'create', 'customs_document', result.id, input.name);
          
          return { id: result.id, url };
        }),
     }),
  }),
});

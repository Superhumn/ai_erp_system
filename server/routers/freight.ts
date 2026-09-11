// appRouter.freight — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import { trackShipment, getFreightRates, getShippingLines, getVesselSchedules } from "../searatesService";
import { estimateOceanFreight } from "@shared/oceanFreightRates";
import { normalizeFreightQuotesForRfq, SERVICE_SCOPES } from "../freightQuoteNormalization";
import { parseFreightQuoteEmail, parseFreightQuoteAttachment, mergeFreightExtractions, quoteValuesFromExtraction } from "../freightQuoteParser";
import { getCompanyWebSources, sourceCompanyContacts, sourceCompanyContactsBatch } from "../companyContactSourcing";
import * as db from "../db";
import { parseLlmJson } from "../llmJson";
import { isFetchableAttachmentUrl } from "../attachmentUrl";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// FREIGHT MANAGEMENT
// ============================================
export const freightRouter = router({
    // Dashboard stats
    dashboardStats: protectedProcedure.query(() => db.getFreightDashboardStats()),

    // SeaRates: Live container/BL tracking
    trackShipment: protectedProcedure
      .input(z.object({
        number: z.string().min(1),
        type: z.enum(["CT", "BL", "BK"]).optional(),
        sealine: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return trackShipment(input.number, { type: input.type, sealine: input.sealine, route: true });
      }),

    // SeaRates: Get freight rate quotes
    getQuotes: protectedProcedure
      .input(z.object({
        fromCity: z.string(),
        toCity: z.string(),
        fromCountry: z.string(),
        toCountry: z.string(),
        weight: z.number().optional(),
        volume: z.number().optional(),
        containerType: z.enum(["20ST", "40ST", "40HQ", "20RF", "40RF"]).optional(),
        mode: z.enum(["fcl", "lcl", "air"]).optional(),
      }))
      .mutation(async ({ input }) => {
        return getFreightRates(input);
      }),

    // Ocean freight matrix: indicative pricing off the Superhumn rate matrix,
    // no carrier API call. The matrix itself lives in @shared/oceanFreightRates
    // so the client can render the same numbers without a round trip.
    rateEstimate: router({
      estimate: protectedProcedure
        .input(z.object({
          originCountry: z.string().trim().min(1),
          destination: z.string().trim().min(1),
          loadPort: z.string().trim().min(1).optional(),
          mode: z.enum(["fcl20", "fcl40", "lcl"]),
          containers: z.number().int().min(1).max(100).optional(),
          volumeCbm: z.number().min(0).optional(),
          weightKg: z.number().min(0).optional(),
          cargoValueUsd: z.number().min(0).optional(),
          rateScenario: z.number().min(0.1).max(5).optional(),
          shipDate: z.string().optional(),
          includeDrayage: z.boolean().optional(),
          includeInsurance: z.boolean().optional(),
          applyPeakSeason: z.boolean().optional(),
        }))
        .query(({ input }) => estimateOceanFreight(input)),
    }),

    // SeaRates: List supported shipping lines
    shippingLines: protectedProcedure.query(async () => {
      try { return await getShippingLines(); } catch { return { lines: [] }; }
    }),

    // SeaRates: Vessel sailing schedules
    vesselSchedules: protectedProcedure
      .input(z.object({
        origin: z.string().min(2),
        destination: z.string().min(2),
        fromDate: z.string().optional(),
        weeks: z.number().min(1).max(6).optional(),
        cargoType: z.enum(["GC", "REEF", "LCL", "RORO"]).optional(),
        directOnly: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        return getVesselSchedules(input);
      }),
    
    // Carriers
    /**
     * Suggest carriers to consider for a shipment.
     *
     * The model names companies and their websites — that is a recall task it is
     * good at. It is deliberately NOT asked for an email address, a phone number
     * or a rating: those would be invented, and an invented address is one that
     * gets an RFQ sent to a stranger. Contact details come from the carrier's own
     * website afterwards (`carriers.addDiscovered`), and until they do the record
     * stays `contactSource: 'discovered'`, which `rfqs.sendToCarriers` refuses to
     * mail.
     */
    discoverCarriers: protectedProcedure
      .input(z.object({
        origin: z.string().optional(),
        destination: z.string().optional(),
        cargoType: z.string().optional(),
        shippingMode: z.enum(['ocean', 'air', 'ground', 'rail', 'multimodal']).optional(),
        specialRequirements: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const prompt = `You are a freight logistics expert. Suggest 8 real freight carriers/forwarders for this shipment:
${input.origin ? `Origin: ${input.origin}` : ''}
${input.destination ? `Destination: ${input.destination}` : ''}
${input.cargoType ? `Cargo: ${input.cargoType}` : ''}
${input.shippingMode ? `Mode: ${input.shippingMode}` : 'Any mode'}
${input.specialRequirements ? `Requirements: ${input.specialRequirements}` : ''}

Return a JSON array of carrier objects with these fields ONLY:
- name: company name (real companies only)
- type: "ocean"|"air"|"ground"|"rail"|"multimodal"
- country: HQ country
- website: the company's real primary website domain (e.g. "maersk.com"). Omit this field entirely if you are not confident of the real domain.
- notes: brief description of their specialty and why they're a good fit

Do NOT return an email address, phone number or rating. If you do not know a
company's real website, omit the website field rather than guessing one.

ONLY return the JSON array, no other text.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a freight logistics expert. Return only valid JSON arrays." },
            { role: "user", content: prompt },
          ],
        });

        const content = response.choices?.[0]?.message?.content || "[]";
        try {
          const text = typeof content === 'string' ? content : String(content);
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
          // Strip anything the model volunteered beyond the fields we asked for,
          // so a stray "email" can never reach the client and be saved.
          const carriers = (Array.isArray(parsed) ? parsed : []).slice(0, 10).map((c: any) => ({
            name: typeof c?.name === 'string' ? c.name.trim() : '',
            type: ['ocean', 'air', 'ground', 'rail', 'multimodal'].includes(c?.type) ? c.type : 'multimodal',
            country: typeof c?.country === 'string' ? c.country.trim() : undefined,
            website: typeof c?.website === 'string' ? c.website.trim() : undefined,
            notes: typeof c?.notes === 'string' ? c.notes.trim() : undefined,
          })).filter((c: any) => c.name);
          return { carriers };
        } catch {
          return { carriers: [] };
        }
      }),

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
          // A person typing a contact detail is a real source, so an edit that
          // supplies one lifts the record out of `discovered`. It does not claim
          // website verification — that is only set by an own-domain page read.
          const patch: Record<string, any> = { ...data };
          if (data.email || data.phone) {
            const existing = await db.getFreightCarrierById(id);
            if (existing && existing.contactSource === 'discovered') {
              patch.contactSource = 'manual';
            }
          }
          await db.updateFreightCarrier(id, patch);
          await createAuditLog(ctx.user.id, 'update', 'freight_carrier', id);
          return { success: true };
        }),

      /**
       * Save a carrier the model suggested.
       *
       * Stored as `contactSource: 'discovered'` — a name and a website, nothing
       * more — and then its own website is read for contact details. If that read
       * turns up an email on the carrier's own domain the record is promoted to
       * `website` and can be sent RFQs; otherwise it stays unverified and
       * `rfqs.sendToCarriers` will refuse it until a person fills the details in.
       */
      addDiscovered: opsProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(['ocean', 'air', 'ground', 'rail', 'multimodal']),
          country: z.string().optional(),
          website: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const created = await db.createFreightCarrier({
            name: input.name,
            type: input.type,
            country: input.country,
            website: input.website,
            notes: input.notes,
            contactSource: 'discovered',
          });
          await createAuditLog(ctx.user.id, 'create', 'freight_carrier', created.id, input.name);

          if (!input.website) {
            return {
              id: created.id,
              sourcing: null,
              verified: false,
              message: 'Saved without contact details. Add a website to source them, or enter them by hand.',
            };
          }

          const sourcing = await sourceCompanyContacts({
            entityType: 'freight_carrier',
            entityId: created.id,
            requestedBy: ctx.user.id,
          });
          return {
            id: created.id,
            sourcing,
            verified: sourcing.verified,
            message: sourcing.verified
              ? `Contact details read from ${sourcing.source?.fetchedUrl ?? input.website}.`
              : 'No contact address found on the carrier\'s own site — enter one by hand before sending an RFQ.',
          };
        }),

      /**
       * Read this carrier's own website and fill in contact details from it.
       * Same rule as vendors: own-domain pages only, own-domain email verifies.
       */
      sourceFromWebsite: opsProcedure
        .input(z.object({
          carrierId: z.number(),
          website: z.string().optional(),
          overwriteExisting: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const carrier = await db.getFreightCarrierById(input.carrierId);
          if (!carrier) throw new TRPCError({ code: 'NOT_FOUND', message: 'Carrier not found' });
          const result = await sourceCompanyContacts({
            entityType: 'freight_carrier',
            entityId: input.carrierId,
            website: input.website,
            overwriteExisting: input.overwriteExisting,
            requestedBy: ctx.user.id,
          });
          await createAuditLog(
            ctx.user.id, 'update', 'freight_carrier', input.carrierId, carrier.name, null,
            { contactSourcing: result.status, verified: result.verified, applied: result.applied },
          );
          return result;
        }),

      /** Every attempt to read this carrier's website, newest first. */
      webSources: protectedProcedure
        .input(z.object({ carrierId: z.number(), limit: z.number().min(1).max(100).optional() }))
        .query(({ input }) => getCompanyWebSources('freight_carrier', input.carrierId, input.limit)),

      sourceFromWebsiteBatch: opsProcedure
        .input(z.object({
          carrierIds: z.array(z.number()).min(1).max(25),
          overwriteExisting: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const summary = await sourceCompanyContactsBatch(
            Array.from(new Set(input.carrierIds)).map(entityId => ({
              entityType: 'freight_carrier' as const, entityId,
            })),
            { overwriteExisting: input.overwriteExisting, requestedBy: ctx.user.id },
          );
          await createAuditLog(
            ctx.user.id, 'update', 'freight_carrier', 0,
            `Sourced contacts from ${input.carrierIds.length} carrier websites (${summary.verifiedCount} verified)`,
          );
          return summary;
        }),

      // ── CRM link, mirroring vendors.autoLinkContact / linkContact ──
      autoLinkContact: opsProcedure
        .input(z.object({ carrierId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const carrier = await db.getFreightCarrierById(input.carrierId);
          if (!carrier) throw new TRPCError({ code: 'NOT_FOUND', message: 'Carrier not found' });
          if (carrier.contactId) {
            const contact = await db.getCrmContactById(carrier.contactId);
            if (contact) return { contact, autoLinked: false };
          }
          const match = await db.findCrmContactForCarrier({
            email: carrier.email,
            phone: carrier.phone,
          });
          if (!match) return { contact: null, autoLinked: false };
          await db.linkFreightCarrierContact(input.carrierId, match.id);
          await createAuditLog(
            ctx.user.id, 'update', 'freight_carrier', input.carrierId, carrier.name, null,
            { contactId: match.id, autoLinked: true },
          );
          return { contact: match, autoLinked: true };
        }),

      linkContact: opsProcedure
        .input(z.object({ carrierId: z.number(), contactId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const carrier = await db.getFreightCarrierById(input.carrierId);
          if (!carrier) throw new TRPCError({ code: 'NOT_FOUND', message: 'Carrier not found' });
          await db.linkFreightCarrierContact(input.carrierId, input.contactId);
          await createAuditLog(
            ctx.user.id, 'update', 'freight_carrier', input.carrierId, carrier.name, null,
            { contactId: input.contactId },
          );
          return { success: true };
        }),

      unlinkContact: opsProcedure
        .input(z.object({ carrierId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const carrier = await db.getFreightCarrierById(input.carrierId);
          if (!carrier) throw new TRPCError({ code: 'NOT_FOUND', message: 'Carrier not found' });
          await db.unlinkFreightCarrierContact(input.carrierId);
          await createAuditLog(
            ctx.user.id, 'update', 'freight_carrier', input.carrierId, carrier.name, null,
            { contactId: null },
          );
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
          // Comparison basis for normalizing quotes on this RFQ
          baseCurrency: z.string().length(3).optional(),
          targetServiceScope: z.enum(SERVICE_SCOPES).optional(),
          dimFactorKgPerCbm: z.string().optional(),
          originHaulageAllowance: z.string().optional(),
          destinationHaulageAllowance: z.string().optional(),
          customsClearanceAllowance: z.string().optional(),
          insuranceRatePct: z.string().optional(),
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
          // Comparison basis for normalizing quotes on this RFQ
          baseCurrency: z.string().length(3).optional(),
          targetServiceScope: z.enum(SERVICE_SCOPES).optional(),
          dimFactorKgPerCbm: z.string().optional(),
          originHaulageAllowance: z.string().optional(),
          destinationHaulageAllowance: z.string().optional(),
          customsClearanceAllowance: z.string().optional(),
          insuranceRatePct: z.string().optional(),
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
          
          const results = { sent: 0, failed: 0, blocked: 0, emails: [] as any[] };
          
          for (const carrierId of input.carrierIds) {
            const carrier = await db.getFreightCarrierById(carrierId);
            if (!carrier || !carrier.email) {
              results.failed++;
              results.emails.push({
                carrierId,
                carrierName: carrier?.name,
                status: 'failed',
                error: carrier ? 'No email address on this carrier' : 'Carrier not found',
              });
              continue;
            }

            // An address a model proposed is not an address. Until the carrier's
            // own website (or a person) confirms it, sending an RFQ here means
            // mailing our shipment details to whoever happens to own that
            // mailbox. Refuse, and say what unblocks it.
            if (carrier.contactSource === 'discovered') {
              results.blocked++;
              results.emails.push({
                carrierId,
                carrierName: carrier.name,
                status: 'blocked',
                error: 'Contact details are unverified — they came from a suggestion, not from the carrier. '
                  + 'Source them from the carrier\'s website or enter them by hand before sending.',
              });
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
          
          // Update RFQ status — but not if every carrier was refused, in which
          // case nothing was sent and the RFQ is still waiting to go out.
          if (results.sent > 0 || results.failed > 0) {
            await db.updateFreightRfq(input.rfqId, { status: 'sent' });
          }
          const emailConfigured = isEmailConfigured();
          const blockedNote = results.blocked > 0 ? `; ${results.blocked} blocked as unverified` : '';
          const auditMessage = (emailConfigured 
            ? `Emails sent to ${results.sent} carriers` 
            : `Email drafts created for ${results.sent + results.failed} carriers (SendGrid not configured)`) + blockedNote;
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
          // Commercial terms needed to level this quote against the others
          serviceScope: z.enum(SERVICE_SCOPES).optional(),
          rateBasis: z.enum(['per_kg', 'per_cbm', 'per_revenue_ton', 'per_container', 'flat']).optional(),
          chargeableWeightKg: z.string().optional(),
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
          serviceScope: z.enum(SERVICE_SCOPES).optional(),
          rateBasis: z.enum(['per_kg', 'per_cbm', 'per_revenue_ton', 'per_container', 'flat']).optional(),
          chargeableWeightKg: z.string().optional(),
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
      // Deterministic normalization only — no LLM. Lets the UI re-level after a
      // rate or allowance changes without paying for an analysis pass.
      normalizeQuotes: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const normalized = await normalizeFreightQuotesForRfq(input.rfqId);
          if (normalized.results.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No quotes to normalize' });
          }
          await createAuditLog(ctx.user.id, 'update', 'freight_quote_normalization', input.rfqId);
          return {
            normalizedCount: normalized.results.length,
            comparableCount: normalized.comparableCount,
            excludedCount: normalized.excludedCount,
            bestQuoteId: normalized.bestQuoteId,
            basis: normalized.basis,
            results: normalized.results,
          };
        }),

      analyzeQuotes: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getFreightRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'Freight RFQ not found' });

          const quotes = await db.getFreightQuotes(input.rfqId);
          if (!quotes.length) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No quotes to analyze' });
          }

          // Compute landed costs first. The model narrates these numbers; it does
          // not produce them — same contract as vendor-quote bid leveling.
          const normalized = await normalizeFreightQuotesForRfq(input.rfqId);
          const normalizedById = new Map(normalized.results.map(r => [r.quoteId, r]));

          const carrierIds = [...new Set(quotes.map((q) => q.carrierId).filter((id): id is number => id != null))];
          const carrierById = new Map((await db.getFreightCarriersByIds(carrierIds)).map((c) => [c.id, c]));

          const basis = normalized.basis;
          const shipmentBlock = `Route: ${rfq.originCity || '?'}, ${rfq.originCountry || '?'} -> ${rfq.destinationCity || '?'}, ${rfq.destinationCountry || '?'}
Cargo: ${rfq.cargoDescription || 'n/a'}
Gross weight: ${rfq.totalWeight ?? 'n/a'} kg | Volume: ${rfq.totalVolume ?? 'n/a'} CBM
Declared value: ${rfq.declaredValue ?? 'n/a'} ${basis.baseCurrency}
Preferred mode: ${rfq.preferredMode || 'any'} | Incoterms: ${rfq.incoterms || 'not specified'}
Required delivery: ${rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}
Comparison basis: leveled to ${basis.targetScope}, priced in ${basis.baseCurrency}${basis.dimFactor ? `, volumetric divisor ${basis.dimFactor} kg/CBM` : ', no volumetric divisor for this mode'}
Insurance required: ${basis.insuranceRequired ? 'yes' : 'no'} | Customs clearance required: ${basis.customsClearanceRequired ? 'yes' : 'no'}`;

          const quoteBlocks = quotes.map(q => {
            const carrier = carrierById.get(q.carrierId);
            const n = normalizedById.get(q.id);
            const head = `Quote id ${q.id} — ${carrier?.name || `Carrier #${q.carrierId}`} (rating: ${carrier?.rating ?? 'n/a'}/5)
  Quoted total: ${q.totalCost ?? 'n/a'} ${q.currency || 'USD'}
  Components: freight ${q.freightCost ?? '0'}, fuel ${q.fuelSurcharge ?? '0'}, origin ${q.originCharges ?? '0'}, destination ${q.destinationCharges ?? '0'}, customs ${q.customsFees ?? '0'}, insurance ${q.insuranceCost ?? '0'}, other ${q.otherCharges ?? '0'}
  Transit: ${q.transitDays ?? 'n/a'} days | Mode: ${q.shippingMode || 'n/a'} | Route: ${q.routeDescription || 'n/a'}
  Valid until: ${q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'n/a'}
  --- computed landed cost (authoritative, do not recompute) ---`;
            if (!n) return `${head}\n  Not normalized.`;
            const lines = [
              `  Service scope quoted: ${n.scope.quoted ?? 'not stated'} (leveled to ${n.scope.target})`,
              n.chargeableWeight.chargeableKg !== null
                ? `  Chargeable weight: ${n.chargeableWeight.chargeableKg} kg (governed by ${n.chargeableWeight.governedBy}; actual ${n.chargeableWeight.actualKg ?? 'n/a'} kg, volumetric ${n.chargeableWeight.volumetricKg ?? 'n/a'} kg)`
                : `  Chargeable weight: not derivable`,
              n.fx
                ? `  FX: 1 ${n.quoteCurrency} = ${n.fx.rate} ${n.baseCurrency} (${n.fx.source}, as of ${n.fx.asOf.toISOString().slice(0, 10)})`
                : `  FX: none needed or unavailable`,
              n.comparable
                ? `  LANDED TOTAL: ${n.landedTotalCost} ${n.baseCurrency}${n.costPerChargeableKg !== null ? ` | PER CHARGEABLE KG: ${n.costPerChargeableKg} ${n.baseCurrency}` : ''}`
                : `  NOT COMPARABLE — excluded from the cost ranking`,
              `  Cost breakdown: ${n.breakdown.map(b => `${b.label}=${b.amount}`).join('; ')}`,
            ];
            if (n.warnings.length) {
              lines.push(`  Computation warnings: ${n.warnings.map(w => `[${w.code}] ${w.message}`).join(' ')}`);
            }
            return `${head}\n${lines.join('\n')}`;
          }).join('\n\n');

          const analysisPrompt = `You are a logistics analyst comparing carrier quotes for one shipment.

SHIPMENT:
${shipmentBlock}

CARRIER QUOTES:
${quoteBlocks}

The landed costs above are already computed deterministically (FX at a dated rate, service-scope gap allowances, chargeable-weight reconciliation, insurance and customs allowances). Do NOT recompute or second-guess them.

For EACH quote give:
1. "score" 0-100 — higher is better value, balancing landed cost, transit time, carrier rating, and the risk implied by the computation warnings. A quote marked NOT COMPARABLE must score below every comparable quote.
2. "pros" and "cons" — short concrete points. Where a computation warning exists (an unpriced scope gap, volumetric re-rating, a total that disagrees with its components), it belongs in "cons" stated plainly.
3. "rationale" — one to two sentences on what drove this quote's landed cost away from its headline total.

Then recommend one quoteId and write a summary an operations manager could defend. Never recommend a NOT COMPARABLE quote — say what is missing instead.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a freight logistics analyst. Always respond with valid JSON matching the schema. Be conservative and explicit about assumptions.' },
              { role: 'user', content: analysisPrompt },
            ],
          });

          // Tolerant recovery: the model sometimes prefixes the fenced block with a
          // sentence, which a single fence-strip would turn into a failed mutation.
          const parsed = parseLlmJson(response.choices[0]?.message?.content);
          if (parsed === null) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to parse freight quote analysis response' });
          }

          // Nothing enforces the response shape (see server/_core/llm.ts), so
          // validate at runtime. Per-quote fuzz falls back rather than failing
          // the whole pass; the computed landed costs are already persisted.
          const analyzedQuoteSchema = z.object({
            quoteId: z.number(),
            score: z.number().nullable().catch(null),
            pros: z.array(z.string()).catch([]),
            cons: z.array(z.string()).catch([]),
            rationale: z.string().nullable().catch(null),
          });
          const responseSchema = z.object({
            quotes: z.array(analyzedQuoteSchema),
            recommendedQuoteId: z.number().nullable().catch(null),
            summary: z.string().catch(''),
          });
          const validation = responseSchema.safeParse(parsed);
          if (!validation.success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Freight quote analysis response did not match the expected shape',
            });
          }
          const analysis = validation.data;

          // Only surface a recommendation that maps to a real quote on this RFQ
          // AND to one that survived normalization. Fall back to the computed
          // cheapest rather than leaving the buyer with nothing.
          const validIds = new Set(quotes.map(q => q.id));
          const modelPick =
            analysis.recommendedQuoteId != null &&
            validIds.has(analysis.recommendedQuoteId) &&
            normalizedById.get(analysis.recommendedQuoteId)?.comparable !== false
              ? analysis.recommendedQuoteId
              : null;
          const recommendedQuoteId = modelPick ?? normalized.bestQuoteId;

          // Key by quote id, not carrier id: one carrier can quote a lane twice
          // (a revised bid, or two service levels) and the previous carrier-keyed
          // write applied one analysis to whichever row matched first.
          for (const item of analysis.quotes) {
            if (!validIds.has(item.quoteId)) continue;
            await db.updateFreightQuote(item.quoteId, {
              aiAnalysis: JSON.stringify({ pros: item.pros, cons: item.cons, rationale: item.rationale }),
              aiRecommendation: item.quoteId === recommendedQuoteId ? 'Recommended' : null,
              ...(item.score != null ? { aiScore: Math.round(item.score) } : {}),
            });
          }

          await createAuditLog(ctx.user.id, 'view', 'freight_quote_analysis', input.rfqId);

          return {
            summary: analysis.summary,
            recommendedQuoteId,
            recommendationSource: modelPick ? ('model' as const) : ('computed' as const),
            comparableCount: normalized.comparableCount,
            excludedCount: normalized.excludedCount,
            basis: normalized.basis,
            quotes: analysis.quotes.map(item => ({
              ...item,
              normalized: normalizedById.get(item.quoteId) ?? null,
            })),
          };
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
          // Carriers quote lanes on rate sheets far more often than in the body,
          // so the attachment is the binding document when both are present.
          attachments: z.array(z.object({
            // Fetched server-side, so it must be a data: URL or our own storage —
            // never an arbitrary host. Defence in depth: buildDocumentMessageContent
            // re-checks before fetching. See server/attachmentUrl.ts.
            fileUrl: z.string().refine(isFetchableAttachmentUrl, {
              message: 'Attachment URL must be an uploaded storage URL.',
            }),
            fileName: z.string(),
          })).max(5).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const extractions = [
            await parseFreightQuoteEmail({
              subject: input.subject,
              body: input.body,
              fromEmail: input.fromEmail,
            }),
          ];

          for (const attachment of input.attachments ?? []) {
            try {
              extractions.push(await parseFreightQuoteAttachment(attachment));
            } catch (e) {
              // A failed attachment must not lose the body extraction we already have.
              console.warn(`[Freight→Quote] Attachment parse failed for ${attachment.fileName}:`, e);
            }
          }

          const extracted = mergeFreightExtractions(...extractions);

          const emailResult = await db.createFreightEmail({
            rfqId: input.rfqId,
            carrierId: input.carrierId,
            direction: 'inbound',
            emailType: extracted.responseType === 'decline' ? 'other' : 'quote_response',
            fromEmail: input.fromEmail,
            toEmail: 'logistics@company.com',
            subject: input.subject,
            body: input.body,
            aiParsed: true,
            aiExtractedData: JSON.stringify(extracted),
            status: 'read',
          });

          // A quote needs a price to be a quote. Accept either the carrier's own
          // total or a base freight figure — normalization sums the components
          // and will flag a total that disagrees with them.
          const hasPrice = extracted.totalCost !== null || extracted.freightCost !== null;
          if (!extracted.isQuote || !hasPrice) {
            return {
              email: emailResult,
              quote: null,
              extractedData: extracted,
              normalized: null,
              reason: extracted.responseType === 'decline'
                ? 'Carrier declined to quote'
                : 'No usable pricing found in this message',
            };
          }

          const quoteResult = await db.createFreightQuote(
            quoteValuesFromExtraction(extracted, {
              rfqId: input.rfqId,
              carrierId: input.carrierId,
              rawEmailContent: input.body,
            }) as any,
          );

          await db.updateFreightRfq(input.rfqId, { status: 'quotes_received' });

          // Level the new quote against the others straight away, so the
          // comparison view is correct without a separate manual step.
          let normalized = null;
          try {
            normalized = await normalizeFreightQuotesForRfq(input.rfqId);
          } catch (e) {
            console.warn('[Freight→Quote] Normalization after parse failed:', e);
          }

          await createAuditLog(ctx.user.id, 'create', 'freight_quote', quoteResult.id);

          return {
            email: emailResult,
            quote: quoteResult,
            extractedData: extracted,
            normalized: normalized
              ? {
                  comparableCount: normalized.comparableCount,
                  excludedCount: normalized.excludedCount,
                  bestQuoteId: normalized.bestQuoteId,
                  thisQuote: normalized.results.find(r => r.quoteId === quoteResult.id) ?? null,
                }
              : null,
          };
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
  });

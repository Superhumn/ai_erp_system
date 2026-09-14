// appRouter.freightQuotes — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// STANDALONE FREIGHT QUOTES (simplified quoting)
// ============================================
export const freightQuotesRouter = router({
    list: protectedProcedure
      .input(z.object({
        shipmentId: z.number().optional(),
        purchaseOrderId: z.number().optional(),
        status: z.enum(['requested', 'received', 'selected', 'expired', 'declined']).optional(),
      }).optional())
      .query(({ input }) => db.getFreightQuotesStandalone(input)),
    create: opsProcedure
      .input(z.object({
        shipmentId: z.number().optional(),
        purchaseOrderId: z.number().optional(),
        carrierName: z.string().min(1),
        carrierEmail: z.string().email().optional(),
        carrierPhone: z.string().optional(),
        origin: z.string().min(1),
        destination: z.string().min(1),
        weight: z.string().optional(),
        dimensions: z.string().optional(),
        containerType: z.enum(['LTL', 'FTL', 'FCL', 'LCL']).optional(),
        incoterms: z.enum(['FOB', 'CIF', 'EXW', 'DDP', 'DAP']).optional(),
        quotedPrice: z.string().optional(),
        currency: z.string().optional(),
        transitDays: z.number().optional(),
        validUntil: z.date().optional(),
        status: z.enum(['requested', 'received', 'selected', 'expired', 'declined']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createFreightQuoteStandalone(input);
        await createAuditLog(ctx.user.id, 'create', 'freight_quote_standalone', result.id, input.carrierName);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        carrierName: z.string().optional(),
        carrierEmail: z.string().email().optional(),
        carrierPhone: z.string().optional(),
        origin: z.string().optional(),
        destination: z.string().optional(),
        weight: z.string().optional(),
        dimensions: z.string().optional(),
        containerType: z.enum(['LTL', 'FTL', 'FCL', 'LCL']).optional(),
        incoterms: z.enum(['FOB', 'CIF', 'EXW', 'DDP', 'DAP']).optional(),
        quotedPrice: z.string().optional(),
        currency: z.string().optional(),
        transitDays: z.number().optional(),
        validUntil: z.date().optional(),
        status: z.enum(['requested', 'received', 'selected', 'expired', 'declined']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateFreightQuoteStandalone(id, data);
        await createAuditLog(ctx.user.id, 'update', 'freight_quote_standalone', id);
        return { success: true };
      }),
    sendRfq: opsProcedure
      .input(z.object({
        carriers: z.array(z.object({
          name: z.string(),
          email: z.string().email(),
        })),
        origin: z.string(),
        destination: z.string(),
        weight: z.string().optional(),
        dimensions: z.string().optional(),
        containerType: z.enum(['LTL', 'FTL', 'FCL', 'LCL']).optional(),
        incoterms: z.enum(['FOB', 'CIF', 'EXW', 'DDP', 'DAP']).optional(),
        shipmentId: z.number().optional(),
        purchaseOrderId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const results = { sent: 0, failed: 0, quoteIds: [] as number[] };

        for (const carrier of input.carriers) {
          // Create a quote record in "requested" status
          const quote = await db.createFreightQuoteStandalone({
            shipmentId: input.shipmentId,
            purchaseOrderId: input.purchaseOrderId,
            carrierName: carrier.name,
            carrierEmail: carrier.email,
            origin: input.origin,
            destination: input.destination,
            weight: input.weight,
            dimensions: input.dimensions,
            containerType: input.containerType,
            incoterms: input.incoterms,
            notes: input.notes,
            status: 'requested',
          });
          results.quoteIds.push(quote.id);

          // Send RFQ email via SendGrid
          if (isEmailConfigured()) {
            const emailBody = `Dear ${carrier.name},\n\nWe are requesting a freight quote for the following shipment:\n\nOrigin: ${input.origin}\nDestination: ${input.destination}\nWeight: ${input.weight || 'TBD'}\nDimensions: ${input.dimensions || 'TBD'}\nContainer Type: ${input.containerType || 'TBD'}\nIncoterms: ${input.incoterms || 'TBD'}\n${input.notes ? `\nAdditional Notes: ${input.notes}` : ''}\n\nPlease provide your best rate, transit time, and quote validity.\n\nThank you.`;
            const sendResult = await sendEmail({
              to: carrier.email,
              subject: `Request for Freight Quote - ${input.origin} to ${input.destination}`,
              text: emailBody,
              html: formatEmailHtml(emailBody),
            });
            if (sendResult.success) {
              results.sent++;
            } else {
              results.failed++;
            }
          } else {
            results.failed++;
          }
        }

        await createAuditLog(ctx.user.id, 'create', 'freight_rfq_standalone', 0, `RFQ sent to ${input.carriers.length} carriers`);
        return { ...results, emailConfigured: isEmailConfigured() };
      }),
    compare: protectedProcedure
      .input(z.object({ shipmentId: z.number() }))
      .query(({ input }) => db.getFreightQuotesStandaloneByShipment(input.shipmentId)),
  });

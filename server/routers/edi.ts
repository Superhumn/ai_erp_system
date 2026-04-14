import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { processInboundEdi, convertEdi850ToOrder, generateOutboundEdi } from "../ediService";
import { testConnection, deliverOutbound, generateAndDeliver, pollSftpForInbound, pollAllPartners } from "../ediTransportService";
import { router, protectedProcedure, adminProcedure, opsProcedure, createAuditLog } from "./middleware";

export const ediRouter = router({
  // ============================================
  // EDI MODULE - Retail Customer Connections
  // ============================================
  edi: router({
    // Dashboard stats
    dashboardStats: protectedProcedure.query(() => db.getEdiDashboardStats()),

    // Trading Partners
    partners: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional(), partnerType: z.string().optional() }).optional())
        .query(({ input }) => db.getEdiTradingPartners(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getEdiTradingPartnerById(input.id)),
      create: opsProcedure
        .input(z.object({
          name: z.string().min(1),
          customerId: z.number().optional(),
          partnerType: z.enum(["retailer", "distributor", "wholesaler", "marketplace", "3pl"]).optional(),
          isaId: z.string().min(1).max(15),
          isaQualifier: z.string().max(2).optional(),
          gsId: z.string().min(1).max(15),
          connectionType: z.enum(["as2", "sftp", "van", "api", "email"]).optional(),
          connectionHost: z.string().optional(),
          connectionPort: z.number().optional(),
          connectionUsername: z.string().optional(),
          connectionPassword: z.string().optional(),
          as2Id: z.string().optional(),
          as2Url: z.string().optional(),
          supportedDocuments: z.string().optional(),
          requiresFunctionalAck: z.boolean().optional(),
          ackTimeoutHours: z.number().optional(),
          testMode: z.boolean().optional(),
          ediContactName: z.string().optional(),
          ediContactEmail: z.string().optional(),
          ediContactPhone: z.string().optional(),
          status: z.enum(["active", "inactive", "testing", "onboarding"]).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createEdiTradingPartner(input);
          await createAuditLog(ctx.user.id, 'create', 'edi_trading_partner', result.id, input.name);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          customerId: z.number().optional(),
          partnerType: z.enum(["retailer", "distributor", "wholesaler", "marketplace", "3pl"]).optional(),
          isaId: z.string().optional(),
          isaQualifier: z.string().optional(),
          gsId: z.string().optional(),
          connectionType: z.enum(["as2", "sftp", "van", "api", "email"]).optional(),
          connectionHost: z.string().optional(),
          connectionPort: z.number().optional(),
          connectionUsername: z.string().optional(),
          connectionPassword: z.string().optional(),
          as2Id: z.string().optional(),
          as2Url: z.string().optional(),
          supportedDocuments: z.string().optional(),
          requiresFunctionalAck: z.boolean().optional(),
          ackTimeoutHours: z.number().optional(),
          testMode: z.boolean().optional(),
          ediContactName: z.string().optional(),
          ediContactEmail: z.string().optional(),
          ediContactPhone: z.string().optional(),
          status: z.enum(["active", "inactive", "testing", "onboarding"]).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateEdiTradingPartner(id, data);
          await createAuditLog(ctx.user.id, 'update', 'edi_trading_partner', id);
          return { success: true };
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteEdiTradingPartner(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'edi_trading_partner', input.id);
          return { success: true };
        }),
    }),

    // Document Maps
    documentMaps: router({
      list: protectedProcedure
        .input(z.object({ tradingPartnerId: z.number().optional() }).optional())
        .query(({ input }) => db.getEdiDocumentMaps(input?.tradingPartnerId)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getEdiDocumentMapById(input.id)),
      create: opsProcedure
        .input(z.object({
          tradingPartnerId: z.number(),
          transactionSetCode: z.string().min(1),
          direction: z.enum(["inbound", "outbound"]),
          version: z.string().optional(),
          mappingRules: z.string(),
          validationRules: z.string().optional(),
          transformTemplate: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createEdiDocumentMap(input);
          await createAuditLog(ctx.user.id, 'create', 'edi_document_map', result.id);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          mappingRules: z.string().optional(),
          validationRules: z.string().optional(),
          transformTemplate: z.string().optional(),
          isActive: z.boolean().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateEdiDocumentMap(id, data);
          await createAuditLog(ctx.user.id, 'update', 'edi_document_map', id);
          return { success: true };
        }),
    }),

    // Transactions
    transactions: router({
      list: protectedProcedure
        .input(z.object({
          tradingPartnerId: z.number().optional(),
          transactionSetCode: z.string().optional(),
          direction: z.string().optional(),
          status: z.string().optional(),
          limit: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getEdiTransactions(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getEdiTransactionById(input.id)),
      getWithItems: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getEdiTransactionWithItems(input.id)),
      // Process inbound EDI document
      processInbound: opsProcedure
        .input(z.object({
          tradingPartnerId: z.number(),
          rawContent: z.string().min(1),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await processInboundEdi(input.rawContent, input.tradingPartnerId);
          await createAuditLog(ctx.user.id, 'create', 'edi_transaction', result.transactionId, `Inbound EDI`);
          return result;
        }),
      // Convert 850 PO to internal order
      convertToOrder: opsProcedure
        .input(z.object({ transactionId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const result = await convertEdi850ToOrder(input.transactionId);
          await createAuditLog(ctx.user.id, 'create', 'order', result.orderId, `From EDI 850`);
          return result;
        }),
      // Generate outbound EDI document
      generateOutbound: opsProcedure
        .input(z.object({
          tradingPartnerId: z.number(),
          transactionSetCode: z.enum(["855", "810", "856"]),
          sourceData: z.string(), // JSON string of the source data
          controlNumber: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const sourceData = JSON.parse(input.sourceData);
          const result = await generateOutboundEdi(input.tradingPartnerId, input.transactionSetCode, sourceData, input.controlNumber);
          await createAuditLog(ctx.user.id, 'create', 'edi_transaction', result.transactionId, `Outbound ${input.transactionSetCode}`);
          return result;
        }),
      // Reprocess a failed transaction
      reprocess: opsProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const txn = await db.getEdiTransactionById(input.id);
          if (!txn) throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
          if (!txn.rawContent) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No raw content to reprocess' });

          const result = await processInboundEdi(txn.rawContent, txn.tradingPartnerId);
          await createAuditLog(ctx.user.id, 'update', 'edi_transaction', result.transactionId, 'Reprocessed');
          return result;
        }),
    }),

    // Product Crosswalks
    crosswalks: router({
      list: protectedProcedure
        .input(z.object({ tradingPartnerId: z.number().optional() }).optional())
        .query(({ input }) => db.getEdiProductCrosswalks(input?.tradingPartnerId)),
      create: opsProcedure
        .input(z.object({
          tradingPartnerId: z.number(),
          productId: z.number(),
          buyerPartNumber: z.string().optional(),
          vendorPartNumber: z.string().optional(),
          upc: z.string().optional(),
          buyerDescription: z.string().optional(),
          unitOfMeasure: z.string().optional(),
          packSize: z.number().optional(),
          innerPackSize: z.number().optional(),
          caseUpc: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createEdiProductCrosswalk(input);
          await createAuditLog(ctx.user.id, 'create', 'edi_product_crosswalk', result.id);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          buyerPartNumber: z.string().optional(),
          vendorPartNumber: z.string().optional(),
          upc: z.string().optional(),
          buyerDescription: z.string().optional(),
          unitOfMeasure: z.string().optional(),
          packSize: z.number().optional(),
          innerPackSize: z.number().optional(),
          caseUpc: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateEdiProductCrosswalk(id, data);
          await createAuditLog(ctx.user.id, 'update', 'edi_product_crosswalk', id);
          return { success: true };
        }),
      delete: opsProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteEdiProductCrosswalk(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'edi_product_crosswalk', input.id);
          return { success: true };
        }),
    }),

    // Ship-To Locations
    shipToLocations: router({
      list: protectedProcedure
        .input(z.object({ tradingPartnerId: z.number().optional() }).optional())
        .query(({ input }) => db.getEdiShipToLocations(input?.tradingPartnerId)),
      create: opsProcedure
        .input(z.object({
          tradingPartnerId: z.number(),
          locationCode: z.string().min(1),
          locationType: z.enum(["store", "distribution_center", "warehouse", "cross_dock"]).optional(),
          name: z.string().min(1),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          postalCode: z.string().optional(),
          country: z.string().optional(),
          gln: z.string().optional(),
          duns: z.string().optional(),
          contactName: z.string().optional(),
          contactPhone: z.string().optional(),
          receivingHours: z.string().optional(),
          specialInstructions: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createEdiShipToLocation(input);
          await createAuditLog(ctx.user.id, 'create', 'edi_ship_to_location', result.id, input.name);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          locationCode: z.string().optional(),
          locationType: z.enum(["store", "distribution_center", "warehouse", "cross_dock"]).optional(),
          name: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          postalCode: z.string().optional(),
          country: z.string().optional(),
          gln: z.string().optional(),
          duns: z.string().optional(),
          contactName: z.string().optional(),
          contactPhone: z.string().optional(),
          receivingHours: z.string().optional(),
          specialInstructions: z.string().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateEdiShipToLocation(id, data);
          await createAuditLog(ctx.user.id, 'update', 'edi_ship_to_location', id);
          return { success: true };
        }),
    }),

    // Transport & Connectivity
    transport: router({
      testConnection: opsProcedure
        .input(z.object({ partnerId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const result = await testConnection(input.partnerId);
          await createAuditLog(ctx.user.id, 'update', 'edi_trading_partner', input.partnerId, `Connection test: ${result.success ? 'success' : 'failed'}`);
          return result;
        }),
      deliverOutbound: opsProcedure
        .input(z.object({
          partnerId: z.number(),
          transactionSetCode: z.enum(["855", "810", "856"]),
          sourceData: z.string(),
          controlNumber: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const sourceData = JSON.parse(input.sourceData);
          const result = await generateAndDeliver(input.partnerId, input.transactionSetCode, sourceData, input.controlNumber);
          await createAuditLog(ctx.user.id, 'create', 'edi_transaction', result.transactionId, `Generated & delivered ${input.transactionSetCode}`);
          return result;
        }),
      pollPartner: opsProcedure
        .input(z.object({ partnerId: z.number(), remoteDir: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
          const result = await pollSftpForInbound(input.partnerId, input.remoteDir);
          await createAuditLog(ctx.user.id, 'update', 'edi_trading_partner', input.partnerId, `Polled: ${result.filesFound} files found, ${result.filesProcessed} processed`);
          return result;
        }),
      pollAll: adminProcedure
        .mutation(async ({ ctx }) => {
          const results = await pollAllPartners();
          const totalFound = results.reduce((sum, r) => sum + r.filesFound, 0);
          const totalProcessed = results.reduce((sum, r) => sum + r.filesProcessed, 0);
          await createAuditLog(ctx.user.id, 'update', 'edi_trading_partner', 0, `Poll all: ${totalFound} files found, ${totalProcessed} processed`);
          return { partners: results.length, totalFound, totalProcessed, results };
        }),
    }),

    // EDI Settings (company-wide config)
    settings: router({
      get: protectedProcedure.query(() => db.getEdiSettings()),
      upsert: adminProcedure
        .input(z.object({
          companyId: z.number().optional(),
          isaId: z.string().min(1).max(15),
          isaQualifier: z.string().max(2).optional(),
          gsApplicationCode: z.string().min(1).max(15),
          companyName: z.string().optional(),
          ackTimeoutMinutes: z.number().optional(),
          autoSend997: z.boolean().optional(),
          defaultTestMode: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.upsertEdiSettings(input);
          await createAuditLog(ctx.user.id, 'update', 'edi_settings', result.id, 'Updated EDI settings');
          return result;
        }),
    }),

    // Control Numbers
    controlNumbers: router({
      getNext: opsProcedure
        .input(z.object({
          tradingPartnerId: z.number(),
          type: z.enum(["isa", "gs", "st"]),
        }))
        .mutation(async ({ input }) => {
          const controlNumber = await db.getNextControlNumber(input.tradingPartnerId, input.type);
          return { controlNumber };
        }),
    }),

    // Compliance Scorecards
    compliance: router({
      list: protectedProcedure
        .input(z.object({ tradingPartnerId: z.number().optional() }).optional())
        .query(({ input }) => db.getEdiComplianceScorecards(input?.tradingPartnerId)),
      create: opsProcedure
        .input(z.object({
          tradingPartnerId: z.number(),
          periodStart: z.date(),
          periodEnd: z.date(),
          totalTransactions: z.number().optional(),
          successfulTransactions: z.number().optional(),
          failedTransactions: z.number().optional(),
          avgProcessingTimeSeconds: z.number().optional(),
          onTimeAckPercentage: z.string().optional(),
          onTimeShipPercentage: z.string().optional(),
          fillRatePercentage: z.string().optional(),
          asnAccuracyPercentage: z.string().optional(),
          chargebackCount: z.number().optional(),
          chargebackAmount: z.string().optional(),
          overallScore: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createEdiComplianceScorecard(input);
          await createAuditLog(ctx.user.id, 'create', 'edi_compliance_scorecard', result.id);
          return result;
        }),
    }),
  }),
});

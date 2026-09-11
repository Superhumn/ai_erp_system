// appRouter.vendorNegotiations — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { analyzeNegotiationOpportunity, initiateNegotiation, addNegotiationRound, generateNegotiationDraft } from "../vendorNegotiationService";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// AUTOMATED VENDOR NEGOTIATIONS
// ============================================
export const vendorNegotiationsRouter = router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        vendorId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
        assignedTo: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getVendorNegotiations(input)),
    get: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const negotiation = await db.getVendorNegotiationById(input.id);
        const rounds = negotiation ? await db.getNegotiationRounds(input.id) : [];
        return { negotiation, rounds };
      }),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        vendorId: z.number(),
        title: z.string(),
        type: z.enum(["price_reduction", "volume_discount", "payment_terms", "lead_time", "contract_renewal", "new_contract"]),
        productIds: z.array(z.number()).optional(),
        rawMaterialIds: z.array(z.number()).optional(),
        currentUnitPrice: z.number().optional(),
        currentPaymentTerms: z.number().optional(),
        currentLeadTimeDays: z.number().optional(),
        currentMinOrderAmount: z.number().optional(),
        currentAnnualVolume: z.number().optional(),
        autoAnalyze: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await initiateNegotiation({ ...input, initiatedBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'vendorNegotiation', result.id);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "analyzing", "ready", "in_progress", "counter_offered", "accepted", "rejected", "expired"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        targetUnitPrice: z.coerce.number().optional(),
        targetPaymentTerms: z.number().optional(),
        targetLeadTimeDays: z.number().optional(),
        targetMinOrderAmount: z.coerce.number().optional(),
        targetAnnualVolume: z.coerce.number().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateVendorNegotiation(id, data as any);
        await createAuditLog(ctx.user.id, 'update', 'vendorNegotiation', id);
        return { success: true };
      }),
    analyze: opsProcedure
      .input(z.object({
        vendorId: z.number(),
        productIds: z.array(z.number()).optional(),
        negotiationType: z.string(),
      }))
      .mutation(({ input }) => analyzeNegotiationOpportunity(input)),
    addRound: opsProcedure
      .input(z.object({
        negotiationId: z.number(),
        direction: z.enum(["outbound", "inbound"]),
        messageType: z.enum(["initial_offer", "counter_offer", "acceptance", "rejection", "info_request", "final_offer"]),
        proposedUnitPrice: z.number().optional(),
        proposedPaymentTerms: z.number().optional(),
        proposedLeadTimeDays: z.number().optional(),
        proposedMinOrderAmount: z.number().optional(),
        proposedVolume: z.number().optional(),
        messageContent: z.string().optional(),
        generateAiDraft: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await addNegotiationRound({ ...input, sentBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'negotiationRound', result.id);
        return result;
      }),
    generateDraft: opsProcedure
      .input(z.object({
        negotiationId: z.number(),
        roundNumber: z.number(),
        messageType: z.enum(["initial_offer", "counter_offer", "final_offer", "acceptance", "rejection"]),
      }))
      .mutation(({ input }) => generateNegotiationDraft(input)),
    rounds: opsProcedure
      .input(z.object({ negotiationId: z.number() }))
      .query(({ input }) => db.getNegotiationRounds(input.negotiationId)),
    stats: opsProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getVendorNegotiationStats(input?.companyId)),
  });

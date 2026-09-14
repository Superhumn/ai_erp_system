// appRouter.contracts — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { legalProcedure, createAuditLog, generateNumber } from "./_shared";

// ============================================
// LEGAL - CONTRACTS
// ============================================
export const contractsRouter = router({
    list: legalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getContracts(input)),
    get: legalProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getContractWithKeyDates(input.id)),
    create: legalProcedure
      .input(z.object({
        title: z.string().min(1),
        companyId: z.number().optional(),
        type: z.enum(['customer', 'vendor', 'employment', 'nda', 'partnership', 'lease', 'service', 'other']),
        partyType: z.enum(['customer', 'vendor', 'employee', 'other']).optional(),
        partyId: z.number().optional(),
        partyName: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        renewalDate: z.date().optional(),
        autoRenewal: z.boolean().optional(),
        value: z.string().optional(),
        currency: z.string().optional(),
        description: z.string().optional(),
        terms: z.string().optional(),
        keyDates: z.array(z.object({
          dateType: z.string(),
          date: z.date(),
          description: z.string().optional(),
          reminderDays: z.number().optional(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { keyDates, ...contractData } = input;
        const contractNumber = generateNumber('CON');
        const result = await db.createContract({ ...contractData, contractNumber, createdBy: ctx.user.id });
        
        if (keyDates && keyDates.length > 0) {
          for (const kd of keyDates) {
            await db.createContractKeyDate({ ...kd, contractId: result.id });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'contract', result.id, contractNumber);
        return result;
      }),
    update: legalProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        status: z.enum(['draft', 'pending_review', 'pending_signature', 'active', 'expired', 'terminated', 'renewed']).optional(),
        endDate: z.date().optional(),
        renewalDate: z.date().optional(),
        value: z.string().optional(),
        description: z.string().optional(),
        terms: z.string().optional(),
        documentUrl: z.string().optional(),
        signedDocumentUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldContract = await db.getContractById(id);
        await db.updateContract(id, data);
        await createAuditLog(ctx.user.id, 'update', 'contract', id, oldContract?.contractNumber, oldContract, data);
        return { success: true };
      }),
    approve: legalProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateContract(input.id, { status: 'active', approvedBy: ctx.user.id, approvedAt: new Date() });
        await createAuditLog(ctx.user.id, 'approve', 'contract', input.id);
        return { success: true };
      }),
    addKeyDate: legalProcedure
      .input(z.object({
        contractId: z.number(),
        dateType: z.string(),
        date: z.date(),
        description: z.string().optional(),
        reminderDays: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createContractKeyDate(input);
        await createAuditLog(ctx.user.id, 'create', 'contractKeyDate', result.id);
        return result;
      }),
  });

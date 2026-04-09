import { z } from "zod";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { router, protectedProcedure, legalProcedure, createAuditLog, generateNumber } from "./middleware";

export const legalRouter = router({
  // ============================================
  // LEGAL - CONTRACTS
  // ============================================
  contracts: router({
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
  }),
  // ============================================
  // LEGAL - DISPUTES
  // ============================================
  disputes: router({
    list: legalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getDisputes(input)),
    get: legalProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getDisputeById(input.id)),
    create: legalProcedure
      .input(z.object({
        title: z.string().min(1),
        companyId: z.number().optional(),
        type: z.enum(['customer', 'vendor', 'employee', 'legal', 'regulatory', 'other']),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        partyType: z.enum(['customer', 'vendor', 'employee', 'other']).optional(),
        partyId: z.number().optional(),
        partyName: z.string().optional(),
        contractId: z.number().optional(),
        description: z.string().optional(),
        estimatedValue: z.string().optional(),
        currency: z.string().optional(),
        filedDate: z.date().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const disputeNumber = generateNumber('DIS');
        const result = await db.createDispute({ ...input, disputeNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'dispute', result.id, disputeNumber);
        return result;
      }),
    update: legalProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['open', 'investigating', 'negotiating', 'resolved', 'escalated', 'closed']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        resolution: z.string().optional(),
        actualValue: z.string().optional(),
        resolvedDate: z.date().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldDispute = await db.getDisputeById(id);
        await db.updateDispute(id, data);
        await createAuditLog(ctx.user.id, 'update', 'dispute', id, oldDispute?.disputeNumber, oldDispute, data);
        return { success: true };
      }),
  }),
  // ============================================
  // LEGAL - DOCUMENTS
  // ============================================
  documents: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getDocuments(input)),
    upload: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        type: z.enum(['contract', 'invoice', 'receipt', 'report', 'legal', 'hr', 'other']),
        category: z.string().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
        fileData: z.string(), // base64 encoded
        mimeType: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { fileData, mimeType: inputMimeType, ...docData } = input;
        const mimeType = inputMimeType || 'application/octet-stream';

        // Decode base64 and upload to S3
        const buffer = Buffer.from(fileData, 'base64');
        const fileKey = `documents/${ctx.user.id}/${nanoid()}-${input.name}`;
        const { url } = await storagePut(fileKey, buffer, mimeType);

        const result = await db.createDocument({
          ...docData,
          fileUrl: url,
          fileKey,
          fileSize: buffer.length,
          mimeType,
          uploadedBy: ctx.user.id,
        });
        
        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);
        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDocument(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'document', input.id);
        return { success: true };
      }),
  }),
});

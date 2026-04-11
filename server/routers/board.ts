import { z } from "zod";
import * as db from "../db";
import { router, protectedProcedure, createAuditLog } from "./middleware";

export const boardRouter = router({
  // ============================================
  // BOARD RESOLUTIONS
  // ============================================
  boardResolutions: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getBoardResolutions(input)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const resolution = await db.getBoardResolutionById(input.id);
        if (!resolution) return undefined;
        const signatures = await db.getBoardSignatures(input.id);
        return { ...resolution, signatures };
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        title: z.string().min(1),
        type: z.enum(["equity_grant", "officer_appointment", "fundraising", "budget_approval", "contract", "policy_change", "compensation", "option_pool", "share_class", "other"]),
        description: z.string().optional(),
        documentUrl: z.string().optional(),
        requiredSignatures: z.number().optional(),
        dueDate: z.date().optional(),
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createBoardResolution({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'boardResolution', result.id, input.title);
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        type: z.enum(["equity_grant", "officer_appointment", "fundraising", "budget_approval", "contract", "policy_change", "compensation", "option_pool", "share_class", "other"]).optional(),
        description: z.string().optional(),
        documentUrl: z.string().optional(),
        status: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "signed", "archived"]).optional(),
        requiredSignatures: z.number().optional(),
        dueDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateBoardResolution(id, data);
        await createAuditLog(ctx.user.id, 'update', 'boardResolution', id);
        return { success: true };
      }),

    submit: protectedProcedure
      .input(z.object({
        id: z.number(),
        signers: z.array(z.object({
          signerId: z.number(),
          signerName: z.string(),
          signerEmail: z.string().optional(),
          signerRole: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        // Update resolution status
        await db.updateBoardResolution(input.id, {
          status: "submitted",
          submittedAt: new Date(),
          requiredSignatures: input.signers.length,
          completedSignatures: 0,
        });

        // Create signature records for all signers
        for (const signer of input.signers) {
          await db.createBoardSignature({
            resolutionId: input.id,
            signerId: signer.signerId,
            signerName: signer.signerName,
            signerEmail: signer.signerEmail,
            signerRole: signer.signerRole,
            status: "pending",
          });
        }

        await createAuditLog(ctx.user.id, 'update', 'boardResolution', input.id, 'Submitted for signatures');
        return { success: true };
      }),
  }),

  // ============================================
  // BOARD SIGNATURES
  // ============================================
  boardSignatures: router({
    list: protectedProcedure
      .input(z.object({ resolutionId: z.number() }))
      .query(({ input }) => db.getBoardSignatures(input.resolutionId)),

    sign: protectedProcedure
      .input(z.object({
        id: z.number(),
        signatureData: z.string().optional(),
        ipAddress: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const signature = await db.getBoardSignatureById(input.id);
        if (!signature) throw new Error("Signature not found");

        // Update signature
        await db.updateBoardSignature(input.id, {
          status: "signed",
          signedAt: new Date(),
          signatureData: input.signatureData,
          ipAddress: input.ipAddress,
        });

        // Increment completed signatures on resolution
        const resolution = await db.getBoardResolutionById(signature.resolutionId);
        if (resolution) {
          const newCompleted = (resolution.completedSignatures || 0) + 1;
          const allSigned = newCompleted >= (resolution.requiredSignatures || 1);
          await db.updateBoardResolution(signature.resolutionId, {
            completedSignatures: newCompleted,
            ...(allSigned ? { status: "signed", approvedAt: new Date() } : {}),
          });
        }

        await createAuditLog(ctx.user.id, 'approve', 'boardSignature', input.id);
        return { success: true };
      }),

    decline: protectedProcedure
      .input(z.object({
        id: z.number(),
        declineReason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.updateBoardSignature(input.id, {
          status: "declined",
          declinedAt: new Date(),
          declineReason: input.declineReason,
        });

        // Update resolution status to rejected
        const signature = await db.getBoardSignatureById(input.id);
        if (signature) {
          await db.updateBoardResolution(signature.resolutionId, {
            status: "rejected",
          });
        }

        await createAuditLog(ctx.user.id, 'reject', 'boardSignature', input.id);
        return { success: true };
      }),
  }),
});

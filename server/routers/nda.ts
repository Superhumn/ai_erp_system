// appRouter.nda — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";

// ============================================
// NDA E-SIGNATURES
// ============================================
export const ndaRouter = router({
    // Get NDA documents for a data room
    documents: router({
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getNdaDocuments(input.dataRoomId);
        }),

      getActive: publicProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getActiveNdaDocument(input.dataRoomId);
        }),

      upload: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          name: z.string(),
          version: z.string().optional(),
          fileContent: z.string(),
          mimeType: z.string().optional(),
          fileSize: z.number().optional(),
          pageCount: z.number().optional(),
          requiresSignature: z.boolean().optional(),
          allowTypedSignature: z.boolean().optional(),
          allowDrawnSignature: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { fileContent, ...rest } = input;
          const buffer = Buffer.from(fileContent, 'base64');
          const key = `nda/${input.dataRoomId}/${Date.now()}-${input.name.replace(/[/\\]/g, '_')}`;
          const mimeType = input.mimeType || 'application/pdf';
          const { url } = await storagePut(key, buffer, mimeType);
          const { id } = await db.createNdaDocument({
            ...rest,
            storageKey: key,
            storageUrl: url,
            uploadedBy: ctx.user.id,
          });
          return { id, url };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          version: z.string().optional(),
          isActive: z.boolean().optional(),
          requiresSignature: z.boolean().optional(),
          allowTypedSignature: z.boolean().optional(),
          allowDrawnSignature: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateNdaDocument(id, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteNdaDocument(input.id);
          return { success: true };
        }),
    }),

    // Signatures
    signatures: router({
      list: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          status: z.string().optional(),
        }))
        .query(async ({ input }) => {
          return db.getNdaSignatures(input.dataRoomId, { status: input.status });
        }),

      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return db.getNdaSignatureById(input.id);
        }),

      // Check if visitor has signed NDA (public)
      checkSigned: publicProcedure
        .input(z.object({
          dataRoomId: z.number(),
          email: z.string().email(),
        }))
        .query(async ({ input }) => {
          const signature = await db.getVisitorNdaSignature(input.dataRoomId, input.email);
          return {
            signed: !!signature,
            signedAt: signature?.signedAt,
            signatureId: signature?.id,
          };
        }),

      // Sign NDA (public - for visitors)
      sign: publicProcedure
        .input(z.object({
          ndaDocumentId: z.number(),
          dataRoomId: z.number(),
          visitorId: z.number().optional(),
          linkId: z.number().optional(),
          signerName: z.string().min(1),
          signerEmail: z.string().email(),
          signerTitle: z.string().optional(),
          signerCompany: z.string().optional(),
          signatureType: z.enum(['typed', 'drawn']),
          signatureData: z.string().max(2_000_000), // ~1.43 MB decoded (2 MB base64 chars × 3/4)
          consentCheckbox: z.literal(true),
        }))
        .mutation(async ({ input, ctx }) => {
          // Get the NDA document
          const ndaDoc = await db.getNdaDocumentById(input.ndaDocumentId);
          if (!ndaDoc) throw new TRPCError({ code: 'NOT_FOUND', message: 'NDA document not found' });
          if (ndaDoc.dataRoomId !== input.dataRoomId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'NDA document does not belong to this data room' });

          // Get IP address from request
          const ipAddress = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req.socket.remoteAddress || 'unknown';
          const userAgent = ctx.req.headers['user-agent'] || '';

          // Store signature image if drawn
          let signatureImageUrl: string | undefined;
          if (input.signatureType === 'drawn' && input.signatureData.startsWith('data:image')) {
            const { storagePut } = await import('../storage');
            const base64Data = input.signatureData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const key = `signatures/${input.dataRoomId}/${Date.now()}-${input.signerEmail.replace('@', '_')}.png`;
            const { url } = await storagePut(key, buffer, 'image/png');
            signatureImageUrl = url;
          }

          // Create the signature record
          const { id } = await db.createNdaSignature({
            ndaDocumentId: input.ndaDocumentId,
            dataRoomId: input.dataRoomId,
            visitorId: input.visitorId,
            linkId: input.linkId,
            signerName: input.signerName,
            signerEmail: input.signerEmail,
            signerTitle: input.signerTitle,
            signerCompany: input.signerCompany,
            signatureType: input.signatureType,
            signatureData: input.signatureType === 'typed' ? input.signerName : input.signatureData,
            signatureImageUrl,
            ipAddress,
            userAgent,
            consentCheckbox: input.consentCheckbox,
          });

          // Create audit log
          await db.createNdaAuditLog({
            signatureId: id,
            action: 'completed_signature',
            ipAddress,
            userAgent,
            details: { signatureType: input.signatureType },
          });

          // Update visitor NDA status and link signature
          if (input.visitorId) {
            await db.updateDataRoomVisitor(input.visitorId, {
              ndaAcceptedAt: new Date(),
              ndaIpAddress: ipAddress,
            });
            // Link visitor to their NDA signature
            await db.linkVisitorToNdaSignature(input.visitorId, id);
          }

          // Send signed NDA copy to visitor via email
          try {
            const { sendEmail } = await import('../_core/email');
            const room = await db.getDataRoomById(input.dataRoomId);
            const roomName = room?.name || 'Data Room';
            
            await sendEmail({
              to: input.signerEmail,
              subject: `Your Signed NDA for ${roomName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>NDA Signed Successfully</h2>
                  <p>Dear ${input.signerName},</p>
                  <p>Thank you for signing the Non-Disclosure Agreement for <strong>${roomName}</strong>.</p>
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Signature Details</h3>
                    <p><strong>Document:</strong> ${ndaDoc.name}</p>
                    <p><strong>Signed By:</strong> ${input.signerName}</p>
                    ${input.signerTitle ? `<p><strong>Title:</strong> ${input.signerTitle}</p>` : ''}
                    ${input.signerCompany ? `<p><strong>Company:</strong> ${input.signerCompany}</p>` : ''}
                    <p><strong>Email:</strong> ${input.signerEmail}</p>
                    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>IP Address:</strong> ${ipAddress}</p>
                    <p><strong>Signature ID:</strong> ${id}</p>
                  </div>
                  ${signatureImageUrl ? `<p><strong>Your Signature:</strong></p><img src="${signatureImageUrl}" alt="Signature" style="max-width: 300px; border: 1px solid #ddd; padding: 10px;" />` : ''}
                  <p style="color: #666; font-size: 12px;">This email serves as your confirmation of signing. Please keep it for your records.</p>
                  <p style="color: #666; font-size: 12px;">If you have any questions, please contact the data room administrator.</p>
                </div>
              `,
            });
          } catch (emailError) {
            console.error('Failed to send NDA confirmation email:', emailError);
            // Don't fail the signature if email fails
          }

          return { id, success: true };
        }),

      // Revoke signature (admin only)
      revoke: protectedProcedure
        .input(z.object({
          id: z.number(),
          reason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          await db.updateNdaSignature(input.id, {
            status: 'revoked',
            revokedAt: new Date(),
            revokedReason: input.reason,
          });

          // Create audit log
          await db.createNdaAuditLog({
            signatureId: input.id,
            action: 'signature_revoked',
            details: { reason: input.reason, revokedBy: ctx.user.id },
          });

          return { success: true };
        }),

      // Get audit log for a signature
      auditLog: protectedProcedure
        .input(z.object({ signatureId: z.number() }))
        .query(async ({ input }) => {
          return db.getNdaAuditLogs(input.signatureId);
        }),
    }),
  });

// appRouter.supplierPortal — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";

// ============================================
// SUPPLIER PORTAL (PUBLIC)
// ============================================
export const supplierPortalRouter = router({
    getSession: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session) return null;
        if (new Date(session.expiresAt) < new Date()) {
          await db.updateSupplierPortalSession(session.id, { status: 'expired' });
          return null;
        }
        const po = await db.getPurchaseOrderWithItems(session.purchaseOrderId);
        return { ...session, purchaseOrder: po };
      }),
    getDocuments: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') return [];
        return db.getSupplierDocuments({ portalSessionId: session.id });
      }),
    getFreightInfo: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') return null;
        return db.getSupplierFreightInfo(session.purchaseOrderId);
      }),
    uploadDocument: publicProcedure
      .input(z.object({
        token: z.string(),
        documentType: z.string(),
        fileName: z.string(),
        fileData: z.string(), // base64
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        // Upload to S3
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `supplier-docs/${session.purchaseOrderId}/${input.documentType}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType || 'application/octet-stream');
        // Save to database
        return db.createSupplierDocument({
          portalSessionId: session.id,
          purchaseOrderId: session.purchaseOrderId,
          vendorId: session.vendorId,
          documentType: input.documentType,
          fileName: input.fileName,
          fileUrl: url,
          fileSize: buffer.length,
          mimeType: input.mimeType,
        });
      }),
    saveFreightInfo: publicProcedure
      .input(z.object({
        token: z.string(),
        totalPackages: z.number().optional(),
        totalGrossWeight: z.string().optional(),
        totalNetWeight: z.string().optional(),
        weightUnit: z.string().optional(),
        totalVolume: z.string().optional(),
        volumeUnit: z.string().optional(),
        packageDimensions: z.string().optional(),
        hsCodes: z.string().optional(),
        preferredShipDate: z.date().optional(),
        preferredCarrier: z.string().optional(),
        incoterms: z.string().optional(),
        specialInstructions: z.string().optional(),
        hasDangerousGoods: z.boolean().optional(),
        dangerousGoodsClass: z.string().optional(),
        unNumber: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        const { token, ...data } = input;
        const existing = await db.getSupplierFreightInfo(session.purchaseOrderId);
        if (existing) {
          await db.updateSupplierFreightInfo(existing.id, data);
          return { success: true, id: existing.id };
        } else {
          const result = await db.createSupplierFreightInfo({
            portalSessionId: session.id,
            purchaseOrderId: session.purchaseOrderId,
            vendorId: session.vendorId,
            ...data,
          });
          return { success: true, id: result.id };
        }
      }),
    completeSubmission: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        await db.updateSupplierPortalSession(session.id, { status: 'completed', completedAt: new Date() });
        // Update PO status
        await db.updatePurchaseOrder(session.purchaseOrderId, { status: 'confirmed' });
        return { success: true };
      }),
  });

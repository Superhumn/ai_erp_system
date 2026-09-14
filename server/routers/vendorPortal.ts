// appRouter.vendorPortal — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { vendorProcedure, createAuditLog } from "./_shared";

// Vendor Portal - restricted views for vendors
export const vendorPortalRouter = router({
    // Get purchase orders for vendor
    getPurchaseOrders: vendorProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
        const allPOs = await db.getPurchaseOrders();
        return allPOs.filter(po => po.vendorId === ctx.user.linkedVendorId);
      }
      return db.getPurchaseOrders();
    }),

    // Get vendor's own info
    getVendorInfo: vendorProcedure.query(async ({ ctx }) => {
      if (!ctx.user.linkedVendorId) {
        return null;
      }
      return db.getVendorById(ctx.user.linkedVendorId);
    }),

    // Update PO status (vendor can mark as confirmed, partial, received)
    updatePOStatus: vendorProcedure
      .input(z.object({
        poId: z.number(),
        status: z.enum(['confirmed', 'partial', 'received']),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify vendor has access to this PO
        if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
          const allPOs = await db.getPurchaseOrders();
          const po = allPOs.find(p => p.id === input.poId);
          if (!po || po.vendorId !== ctx.user.linkedVendorId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this purchase order' });
          }
        }

        await db.updatePurchaseOrder(input.poId, { 
          status: input.status,
          notes: input.notes,
        });
        await createAuditLog(ctx.user.id, 'update', 'purchase_order', input.poId);
        return { success: true };
      }),

    // Get shipments for vendor
    getShipments: vendorProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
        const allShipments = await db.getShipments();
        // Filter shipments related to vendor's POs
        const vendorPOs = await db.getPurchaseOrders();
        const vendorPOIds = vendorPOs
          .filter(po => po.vendorId === ctx.user.linkedVendorId)
          .map(po => po.id);
        return allShipments.filter(s => s.purchaseOrderId && vendorPOIds.includes(s.purchaseOrderId));
      }
      return db.getShipments();
    }),

    // Upload document for vendor's shipment/PO
    uploadDocument: vendorProcedure
      .input(z.object({
        relatedEntityType: z.enum(['purchase_order', 'shipment']),
        relatedEntityId: z.number(),
        documentType: z.enum(['invoice', 'receipt', 'contract', 'legal', 'report', 'hr', 'other']),
        name: z.string(),
        fileData: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify vendor has access
        if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
          if (input.relatedEntityType === 'purchase_order') {
            const allPOs = await db.getPurchaseOrders();
            const po = allPOs.find(p => p.id === input.relatedEntityId);
            if (!po || po.vendorId !== ctx.user.linkedVendorId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this purchase order' });
            }
          }
        }

        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `vendor/${ctx.user.linkedVendorId || 'unknown'}/${input.relatedEntityType}/${input.relatedEntityId}/${nanoid()}-${input.name}`;
        
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        const result = await db.createDocument({
          name: input.name,
          type: input.documentType,
          category: input.relatedEntityType === 'purchase_order' ? 'legal' : 'other',
          fileUrl: url,
          fileKey,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          referenceType: input.relatedEntityType,
          referenceId: input.relatedEntityId,
        });

        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);
        
        return { id: result.id, url };
      }),

    // Get customs clearances accessible to vendor (filtered by their POs/shipments)
    getCustomsClearances: vendorProcedure.query(async ({ ctx }) => {
      const allClearances = await db.getCustomsClearances();
      if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
        const allPOs = await db.getPurchaseOrders();
        const vendorPOIds = new Set(allPOs.filter(po => po.vendorId === ctx.user.linkedVendorId).map(po => po.id));
        const allShipments = await db.getShipments();
        const vendorShipmentIds = new Set(allShipments.filter(s => s.purchaseOrderId && vendorPOIds.has(s.purchaseOrderId)).map(s => s.id));
        return allClearances.filter(c => c.shipmentId != null && vendorShipmentIds.has(c.shipmentId));
      }
      return allClearances;
    }),


    getCustomsDocuments: vendorProcedure
      .input(z.object({ clearanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
          const clearance = await db.getCustomsClearanceById(input.clearanceId);
          if (!clearance?.shipmentId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
          const shipment = await db.getShipmentById(clearance.shipmentId);
          if (!shipment?.purchaseOrderId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
          const po = await db.getPurchaseOrderById(shipment.purchaseOrderId);
          if (!po || po.vendorId !== ctx.user.linkedVendorId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
        }
        return db.getCustomsDocuments(input.clearanceId);
      }),

    uploadCustomsDocument: vendorProcedure
      .input(z.object({
        clearanceId: z.number(),
        documentType: z.string(),
        name: z.string(),
        fileData: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import('../storage');
        const { nanoid } = await import('nanoid');
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `vendor/${ctx.user.linkedVendorId || 'unknown'}/customs/${input.clearanceId}/${nanoid()}-${input.name}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const result = await db.createDocument({
          name: input.name,
          type: input.documentType as any,
          category: 'legal',
          fileUrl: url,
          fileKey,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          referenceType: 'customs_clearance',
          referenceId: input.clearanceId,
        });
        return { id: result.id, url };
      }),
  });

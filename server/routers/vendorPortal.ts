// appRouter.vendorPortal — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { vendorProcedure, createAuditLog } from "./_shared";

type VendorPortalUser = { role: string; linkedVendorId: number | null };

// A vendor-role user with no linked vendor must never fall through to the
// unfiltered (admin/ops) branch. Returns true when vendor filtering applies.
function isVendorUser(user: VendorPortalUser): boolean {
  return user.role === 'vendor';
}

function assertVendorLinked(user: VendorPortalUser): void {
  if (isVendorUser(user) && !user.linkedVendorId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Your account is not linked to a vendor' });
  }
}

// Resolve the vendor that owns a PO / shipment / customs clearance, or null when the
// chain is broken (missing row or unlinked shipment).
async function vendorIdForPurchaseOrder(poId: number): Promise<number | null> {
  const po = await db.getPurchaseOrderById(poId);
  return po ? po.vendorId : null;
}

async function vendorIdForShipment(shipmentId: number): Promise<number | null> {
  const shipment = await db.getShipmentById(shipmentId);
  if (!shipment?.purchaseOrderId) return null;
  return vendorIdForPurchaseOrder(shipment.purchaseOrderId);
}

async function vendorIdForClearance(clearanceId: number): Promise<number | null> {
  const clearance = await db.getCustomsClearanceById(clearanceId);
  if (!clearance?.shipmentId) return null;
  return vendorIdForShipment(clearance.shipmentId);
}

// Vendor Portal - restricted views for vendors
export const vendorPortalRouter = router({
    // Get purchase orders for vendor
    getPurchaseOrders: vendorProcedure.query(async ({ ctx }) => {
      if (isVendorUser(ctx.user)) {
        if (!ctx.user.linkedVendorId) return [];
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
        assertVendorLinked(ctx.user);
        // Verify vendor has access to this PO
        if (isVendorUser(ctx.user)) {
          const ownerVendorId = await vendorIdForPurchaseOrder(input.poId);
          if (ownerVendorId == null || ownerVendorId !== ctx.user.linkedVendorId) {
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
      if (isVendorUser(ctx.user)) {
        if (!ctx.user.linkedVendorId) return [];
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
        assertVendorLinked(ctx.user);
        // Verify vendor owns the PO, or the PO behind the shipment.
        if (isVendorUser(ctx.user)) {
          const ownerVendorId = input.relatedEntityType === 'purchase_order'
            ? await vendorIdForPurchaseOrder(input.relatedEntityId)
            : await vendorIdForShipment(input.relatedEntityId);
          if (ownerVendorId == null || ownerVendorId !== ctx.user.linkedVendorId) {
            const label = input.relatedEntityType === 'purchase_order' ? 'purchase order' : 'shipment';
            throw new TRPCError({ code: 'FORBIDDEN', message: `You do not have access to this ${label}` });
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
      if (isVendorUser(ctx.user) && !ctx.user.linkedVendorId) return [];
      const allClearances = await db.getCustomsClearances();
      if (isVendorUser(ctx.user)) {
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
        assertVendorLinked(ctx.user);
        if (isVendorUser(ctx.user)) {
          const ownerVendorId = await vendorIdForClearance(input.clearanceId);
          if (ownerVendorId == null || ownerVendorId !== ctx.user.linkedVendorId) {
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
        assertVendorLinked(ctx.user);
        // Same clearance -> shipment -> PO -> vendor ownership chain as getCustomsDocuments.
        if (isVendorUser(ctx.user)) {
          const ownerVendorId = await vendorIdForClearance(input.clearanceId);
          if (ownerVendorId == null || ownerVendorId !== ctx.user.linkedVendorId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
        }
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

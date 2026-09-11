// appRouter.rawMaterials — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// Raw Materials
export const rawMaterialsRouter = router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        category: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRawMaterials(input);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRawMaterialById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        sku: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string(),
        unitCost: z.string().optional(),
        currency: z.string().optional(),
        minOrderQty: z.string().optional(),
        leadTimeDays: z.number().optional(),
        preferredVendorId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.createRawMaterial(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        sku: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
        unitCost: z.string().optional(),
        currency: z.string().optional(),
        minOrderQty: z.string().optional(),
        leadTimeDays: z.number().optional(),
        preferredVendorId: z.number().optional(),
        status: z.enum(['active', 'inactive', 'discontinued']).optional(),
        receivingStatus: z.enum(['none', 'ordered', 'in_transit', 'received', 'inspected']).optional(),
        quantityOnOrder: z.string().optional(),
        quantityInTransit: z.string().optional(),
        quantityReceived: z.string().optional(),
        expectedDeliveryDate: z.date().optional(),
        lastReceivedDate: z.date().optional(),
        lastReceivedQty: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateRawMaterial(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteRawMaterial(input.id);
        return { success: true };
      }),

    // Get preferred vendor for a material based on PO history
    getPreferredVendor: protectedProcedure
      .input(z.object({ 
        materialName: z.string().optional(),
        materialId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        // First, find the material
        let material = null;
        if (input.materialId) {
          material = await db.getRawMaterialById(input.materialId);
        } else if (input.materialName) {
          const allMaterials = await db.getRawMaterials();
          material = allMaterials.find(m => 
            m.name?.toLowerCase().includes(input.materialName!.toLowerCase()) ||
            m.sku?.toLowerCase() === input.materialName!.toLowerCase()
          ) || null;
        }
        
        if (!material) {
          return { material: null, preferredVendor: null, recentPOs: [], suggestion: null };
        }
        
        // Check if material has a preferred vendor set
        let preferredVendor = null;
        if (material.preferredVendorId) {
          preferredVendor = await db.getVendorById(material.preferredVendorId);
        }
        
        // Get recent POs for this material to find most used vendor
        const allPOs = await db.getPurchaseOrders({});

        // Single query to get all PO items with matching description (avoids N+1 per-PO loop)
        const allPOItems = await db.getAllPurchaseOrderItems();

        // Find PO items that reference this material (using description match)
        const materialPOItems = allPOItems.filter(item =>
          item.description?.toLowerCase().includes(material!.name?.toLowerCase() || '')
        );
        
        // Count vendors by frequency and recency
        const vendorStats: Record<number, { count: number; lastDate: Date | null; totalValue: number }> = {};
        
        for (const item of materialPOItems) {
          const po = allPOs.find(p => p.id === item.purchaseOrderId);
          if (po && po.vendorId) {
            if (!vendorStats[po.vendorId]) {
              vendorStats[po.vendorId] = { count: 0, lastDate: null, totalValue: 0 };
            }
            vendorStats[po.vendorId].count++;
            vendorStats[po.vendorId].totalValue += parseFloat(item.totalAmount || '0');
            const poDate = po.orderDate ? new Date(po.orderDate) : null;
            if (poDate && (!vendorStats[po.vendorId].lastDate || poDate > vendorStats[po.vendorId].lastDate!)) {
              vendorStats[po.vendorId].lastDate = poDate;
            }
          }
        }
        
        // Find the best vendor (most frequent, with recency as tiebreaker)
        let suggestedVendorId: number | null = null;
        let maxScore = 0;
        
        for (const [vendorId, stats] of Object.entries(vendorStats)) {
          // Score = count * 10 + recency bonus (up to 5 points for orders in last 90 days)
          const recencyBonus = stats.lastDate 
            ? Math.max(0, 5 - Math.floor((Date.now() - stats.lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30)))
            : 0;
          const score = stats.count * 10 + recencyBonus;
          
          if (score > maxScore) {
            maxScore = score;
            suggestedVendorId = parseInt(vendorId);
          }
        }
        
        // Get suggested vendor details
        let suggestedVendor = null;
        if (suggestedVendorId) {
          suggestedVendor = await db.getVendorById(suggestedVendorId);
        }
        
        // Get last purchase price
        const lastPOItem = materialPOItems
          .sort((a, b) => {
            const poA = allPOs.find(p => p.id === a.purchaseOrderId);
            const poB = allPOs.find(p => p.id === b.purchaseOrderId);
            const dateA = poA?.orderDate ? new Date(poA.orderDate).getTime() : 0;
            const dateB = poB?.orderDate ? new Date(poB.orderDate).getTime() : 0;
            return dateB - dateA;
          })[0];
        
        return {
          material: {
            id: material.id,
            name: material.name,
            sku: material.sku,
            unit: material.unit,
            unitCost: material.unitCost,
          },
          preferredVendor: preferredVendor ? {
            id: preferredVendor.id,
            name: preferredVendor.name,
            email: preferredVendor.email,
          } : null,
          suggestedVendor: suggestedVendor ? {
            id: suggestedVendor.id,
            name: suggestedVendor.name,
            email: suggestedVendor.email,
            poCount: vendorStats[suggestedVendor.id]?.count || 0,
            lastOrderDate: vendorStats[suggestedVendor.id]?.lastDate || null,
          } : null,
          lastPurchasePrice: lastPOItem?.unitPrice || material.unitCost || null,
          recentPOCount: materialPOItems.length,
        };
      }),
  });

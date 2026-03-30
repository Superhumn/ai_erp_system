import { z } from "zod";
import * as db from "../db";
import { router, protectedProcedure, createAuditLog } from "./middleware";

export const manufacturingRouter = router({
  // ============================================
  // BILL OF MATERIALS (BOM) MODULE
  // ============================================
  bom: router({
    // List all BOMs
    list: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getBillOfMaterials(input);
      }),

    // Get single BOM with components
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const bom = await db.getBomById(input.id);
        if (!bom) return null;
        const components = await db.getBomComponents(input.id);
        const history = await db.getBomVersionHistory(input.id);
        // Get product info
        const product = await db.getProductById(bom.productId);
        return { ...bom, components, history, product };
      }),

    // Create new BOM
    create: protectedProcedure
      .input(z.object({
        productId: z.number(),
        name: z.string(),
        version: z.string().optional(),
        batchSize: z.string().optional(),
        batchUnit: z.string().optional(),
        laborCost: z.string().optional(),
        overheadCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createBom({
          ...input,
          createdBy: ctx.user.id,
          status: 'draft',
        });
        // Create version history entry
        await db.createBomVersionHistory({
          bomId: result.id,
          version: input.version || '1.0',
          changeType: 'created',
          changeDescription: 'Initial creation',
          changedBy: ctx.user.id,
        });
        return result;
      }),

    // Update BOM
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        version: z.string().optional(),
        status: z.enum(['draft', 'active', 'obsolete']).optional(),
        batchSize: z.string().optional(),
        batchUnit: z.string().optional(),
        laborCost: z.string().optional(),
        overheadCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const oldBom = await db.getBomById(id);
        await db.updateBom(id, data);
        
        // Track status changes
        if (input.status && oldBom?.status !== input.status) {
          await db.createBomVersionHistory({
            bomId: id,
            version: input.version || oldBom?.version || '1.0',
            changeType: input.status === 'active' ? 'activated' : input.status === 'obsolete' ? 'obsoleted' : 'updated',
            changeDescription: `Status changed from ${oldBom?.status} to ${input.status}`,
            changedBy: ctx.user.id,
          });
        }
        return { success: true };
      }),

    // Delete BOM
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteBom(input.id);
        return { success: true };
      }),

    // Calculate costs
    calculateCosts: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.calculateBomCosts(input.id);
      }),

    // Add component
    addComponent: protectedProcedure
      .input(z.object({
        bomId: z.number(),
        componentType: z.enum(['product', 'raw_material', 'packaging', 'labor']),
        productId: z.number().optional(),
        rawMaterialId: z.number().optional(),
        name: z.string(),
        sku: z.string().optional(),
        quantity: z.string(),
        unit: z.string(),
        wastagePercent: z.string().optional(),
        unitCost: z.string().optional(),
        leadTimeDays: z.number().optional(),
        isOptional: z.boolean().optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await db.createBomComponent(input);
        // Recalculate BOM costs
        await db.calculateBomCosts(input.bomId);
        return result;
      }),

    // Update component
    updateComponent: protectedProcedure
      .input(z.object({
        id: z.number(),
        bomId: z.number(),
        name: z.string().optional(),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        wastagePercent: z.string().optional(),
        unitCost: z.string().optional(),
        leadTimeDays: z.number().optional(),
        isOptional: z.boolean().optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, bomId, ...data } = input;
        await db.updateBomComponent(id, data);
        // Recalculate BOM costs
        await db.calculateBomCosts(bomId);
        return { success: true };
      }),

    // Delete component
    deleteComponent: protectedProcedure
      .input(z.object({ id: z.number(), bomId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteBomComponent(input.id);
        // Recalculate BOM costs
        await db.calculateBomCosts(input.bomId);
        return { success: true };
      }),
  }),
  // Raw Materials
  rawMaterials: router({
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
        
        // Get all PO items by fetching items for each PO
        const allPOItems: Array<{
          id: number;
          purchaseOrderId: number;
          description: string;
          unitPrice: string;
          totalAmount: string;
        }> = [];
        
        for (const po of allPOs) {
          const items = await db.getPurchaseOrderItems(po.id);
          allPOItems.push(...items);
        }
        
        // Find PO items that reference this material (using purchaseOrderId and description)
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
        
        // Get recent POs for context
        const recentPOs = allPOs
          .filter(po => materialPOItems.some(item => item.purchaseOrderId === po.id))
          .sort((a, b) => {
            const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
            const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
            return dateB - dateA;
          })
          .slice(0, 5);
        
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
  }),
  // Work Orders
  workOrders: router({
    list: protectedProcedure.query(async () => {
      return db.getWorkOrders();
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getWorkOrderById(input.id);
      }),
    create: protectedProcedure
      .input(z.object({
        bomId: z.number(),
        productId: z.number(),
        warehouseId: z.number().optional(),
        quantity: z.string(),
        unit: z.string().default('EA'),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
        scheduledStartDate: z.date().optional(),
        scheduledEndDate: z.date().optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWorkOrder({ ...input, createdBy: ctx.user?.id });
        // Auto-generate material requirements from BOM
        await db.generateWorkOrderMaterialsFromBom(result.id, input.bomId, parseFloat(input.quantity));
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
        quantity: z.string().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        scheduledStartDate: z.date().optional(),
        scheduledEndDate: z.date().optional(),
        actualStartDate: z.date().optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateWorkOrder(id, data);
        return { success: true };
      }),
    getMaterials: protectedProcedure
      .input(z.object({ workOrderId: z.number() }))
      .query(async ({ input }) => {
        return db.getWorkOrderMaterials(input.workOrderId);
      }),
    startProduction: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateWorkOrder(input.id, { status: 'in_progress', actualStartDate: new Date() });
        return { success: true };
      }),
    completeProduction: protectedProcedure
      .input(z.object({ 
        id: z.number(), 
        completedQuantity: z.string(),
        warehouseId: z.number().optional(),
        yieldPercent: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        // Get work order details
        const workOrder = await db.getWorkOrderById(input.id);
        if (!workOrder) throw new Error("Work order not found");
        
        // Consume materials
        await db.consumeWorkOrderMaterials(input.id, ctx.user?.id);
        
        // Create finished goods lot output
        const completedQty = parseFloat(input.completedQuantity);
        const plannedQty = parseFloat(workOrder.quantity);
        const yieldPercent = input.yieldPercent || (completedQty / plannedQty * 100);
        
        // Get BOM to find output product
        const bom = await db.getBomById(workOrder.bomId);
        if (bom && bom.productId) {
          const outputWarehouse = input.warehouseId || workOrder.warehouseId;
          if (outputWarehouse) {
            const { lotId, lotCode } = await db.createWorkOrderOutput(
              input.id,
              bom.productId,
              completedQty,
              outputWarehouse,
              yieldPercent,
              ctx.user?.id
            );
            
            // Create audit log
            await db.createAuditLog({
              entityType: 'work_order',
              entityId: input.id,
              action: 'update',
              newValues: { 
                event: 'production_completed',
                completedQuantity: input.completedQuantity, 
                yieldPercent, 
                outputLotId: lotId, 
                outputLotCode: lotCode 
              },
              userId: ctx.user?.id
            });
          }
        }
        
        // Update work order status
        await db.updateWorkOrder(input.id, { 
          completedQuantity: input.completedQuantity,
          status: 'completed',
          actualEndDate: new Date()
        });
        
        // Create notification for work order completion
        const allUsers = await db.getAllUsers();
        const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
        
        await db.notifyUsersOfEvent({
          type: 'work_order_completed',
          title: `Work Order ${workOrder.workOrderNumber} Completed`,
          message: `Work Order ${workOrder.workOrderNumber} completed with ${completedQty} units (${yieldPercent.toFixed(1)}% yield)`,
          entityType: 'work_order',
          entityId: input.id,
          severity: yieldPercent < 90 ? 'warning' : 'info',
          link: `/operations/work-orders`,
          metadata: { completedQuantity: completedQty, yieldPercent },
        }, opsUsers.map(u => u.id));
        
        return { success: true };
      }),
  }),
  // Raw Material Inventory
  rawMaterialInventory: router({
    list: protectedProcedure
      .input(z.object({
        rawMaterialId: z.number().optional(),
        warehouseId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRawMaterialInventory(input);
      }),
    getTransactions: protectedProcedure
      .input(z.object({ rawMaterialId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getRawMaterialTransactions(input.rawMaterialId, input.limit);
      }),
    adjust: protectedProcedure
      .input(z.object({
        rawMaterialId: z.number(),
        warehouseId: z.number(),
        quantity: z.number(),
        unit: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getRawMaterialInventoryByLocation(input.rawMaterialId, input.warehouseId);
        const currentQty = parseFloat(current?.quantity?.toString() || '0');
        const newQty = currentQty + input.quantity;
        
        await db.upsertRawMaterialInventory(input.rawMaterialId, input.warehouseId, {
          quantity: newQty.toFixed(4),
          availableQuantity: newQty.toFixed(4),
          unit: input.unit,
        });
        
        await db.createRawMaterialTransaction({
          rawMaterialId: input.rawMaterialId,
          warehouseId: input.warehouseId,
          transactionType: 'adjust',
          quantity: input.quantity.toFixed(4),
          previousQuantity: currentQty.toFixed(4),
          newQuantity: newQty.toFixed(4),
          unit: input.unit,
          notes: input.notes,
          performedBy: ctx.user?.id,
        });
        
        return { success: true };
      }),
  }),
});

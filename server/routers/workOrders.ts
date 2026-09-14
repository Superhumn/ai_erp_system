// appRouter.workOrders — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { parseEntityText } from "../_core/universalTextParser";
import * as db from "../db";
import * as manufacturingDb from "../db/manufacturing";
import { opsProcedure, createAuditLog } from "./_shared";

// Work Orders
export const workOrdersRouter = router({
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
        bomId: z.number().optional(),
        recipeId: z.number().optional(),
        productId: z.number(),
        warehouseId: z.number().optional(),
        quantity: z.string(),
        unit: z.string().default('EA'),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
        scheduledStartDate: z.date().optional(),
        scheduledEndDate: z.date().optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      }).refine((d) => d.bomId != null || d.recipeId != null, {
        message: "Provide bomId or recipeId (recipe must be synced to a BOM first).",
      }))
      .mutation(async ({ input, ctx }) => {
        let bomId = input.bomId;
        let productId = input.productId;
        if (input.recipeId != null) {
          const recipe = await manufacturingDb.getRecipeById(input.recipeId);
          if (!recipe) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });
          }
          if (!recipe.bomId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Recipe has no BOM. Run recipes.syncToBom with a finished product first.",
            });
          }
          bomId = recipe.bomId;
          if (recipe.outputProductId) productId = recipe.outputProductId;
        }
        if (bomId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "bomId is required" });
        }
        const result = await db.createWorkOrder({
          bomId,
          productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          unit: input.unit,
          priority: input.priority,
          scheduledStartDate: input.scheduledStartDate,
          scheduledEndDate: input.scheduledEndDate,
          notes: input.notes,
          assignedTo: input.assignedTo,
          createdBy: ctx.user?.id,
        });
        await db.generateWorkOrderMaterialsFromBom(result.id, bomId, parseFloat(input.quantity));
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

        // ── Automation #8: Reserve raw materials when production starts ──
        try {
          const materials = await db.getWorkOrderMaterials(input.id);
          for (const mat of materials) {
            if (!mat.rawMaterialId) continue;
            const reqQty = parseFloat(mat.requiredQuantity?.toString() || "0");
            const consumedQty = parseFloat(mat.consumedQuantity?.toString() || "0");
            const remaining = Math.max(0, reqQty - consumedQty);
            if (remaining <= 0) continue;

            const inventoryRecords = await db.getRawMaterialInventory({ rawMaterialId: mat.rawMaterialId });
            for (const inv of inventoryRecords) {
              const totalQty = parseFloat(inv.quantity?.toString() || "0");
              const availableQty = parseFloat(inv.availableQuantity?.toString() || totalQty.toString());
              const toReserve = Math.min(remaining, availableQty);
              if (toReserve > 0) {
                await db.upsertRawMaterialInventory(mat.rawMaterialId, inv.warehouseId, {
                  availableQuantity: (availableQty - toReserve).toFixed(4),
                });
              }
            }
            await db.updateWorkOrderMaterial(mat.id, { status: "reserved" as any });
          }
          console.log(`[WorkOrder→Reserve] Reserved raw materials for WO ${input.id}`);
        } catch (e) {
          console.warn("[WorkOrder→Reserve] Material reservation failed:", e);
        }

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
        const opsUsers = await db.getUsersByRoles(['admin', 'ops', 'exec']);

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
    createFromText: opsProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const parsed = await parseEntityText(input.text, "work_order");
        const productName = (parsed.productName as string | undefined)?.trim();
        const quantity = Number(parsed.quantity);
        if (!productName || !Number.isFinite(quantity) || quantity <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not extract a product and quantity from the text.",
          });
        }

        const allProducts = await db.getProducts();
        const product = allProducts.find(
          (p) => p.name?.toLowerCase() === productName.toLowerCase()
            || p.sku?.toLowerCase() === productName.toLowerCase(),
        )
          ?? allProducts.find((p) => p.name?.toLowerCase().includes(productName.toLowerCase()));
        if (!product) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No product matched "${productName}". Create the product first or use an existing SKU.`,
          });
        }

        const boms = await db.getBillOfMaterials({ productId: product.id, status: "active" });
        const bom = boms[0];
        if (!bom) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No active BOM exists for product "${product.name}". Create a BOM before scheduling production.`,
          });
        }

        const priorityMap: Record<string, "low" | "normal" | "high" | "urgent"> = {
          low: "low",
          medium: "normal",
          normal: "normal",
          high: "high",
          urgent: "urgent",
        };
        const rawPriority = (parsed.priority as string | undefined)?.toLowerCase() ?? "normal";
        const priority = priorityMap[rawPriority] ?? "normal";

        const created = await manufacturingDb.createWorkOrder({
          productId: product.id,
          bomId: bom.id,
          quantity: quantity.toString(),
          unit: (parsed.unit as string | undefined) ?? "EA",
          status: "draft",
          priority,
          scheduledEndDate: parsed.dueDate ? new Date(parsed.dueDate as string) : undefined,
          notes: (parsed.notes as string | undefined) ?? `Created from text: "${input.text}"`,
          createdBy: ctx.user.id,
        });

        await createAuditLog(ctx.user.id, 'create', 'work_order', created.id, created.workOrderNumber);
        return { id: created.id, workOrderNumber: created.workOrderNumber };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await manufacturingDb.deleteWorkOrder(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'work_order', input.id);
        return { success: true };
      }),
  });

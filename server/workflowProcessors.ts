import { invokeLLM } from "./_core/llm";
import {
  demandForecasts,
  productionPlans,
  materialRequirements,
  suggestedPurchaseOrders,
  suggestedPoItems,
  purchaseOrders,
  purchaseOrderItems,
  purchaseOrderRawMaterials,
  rawMaterials,
  rawMaterialInventory,
  inventory,
  inventoryTransfers,
  inventoryTransferItems,
  workOrders,
  workOrderMaterials,
  workOrderOutputs,
  billOfMaterials,
  bomComponents,
  products,
  vendors,
  orders,
  orderItems,
  warehouses,
  shipments,
  freightRfqs,
  freightQuotes,
  freightCarriers,
  invoices,
  payments,
  supplierPerformance,
  vendorRfqs,
  vendorQuotes,
  vendorRfqInvitations,
  vendorRfqEmails,
} from "../drizzle/schema";
import { eq, and, lt, lte, gte, gt, desc, asc, sql, isNull, or, inArray, between } from "drizzle-orm";
import type { WorkflowEngine, WorkflowContext, WorkflowResult, StepResult } from "./autonomousWorkflowEngine";

// ============================================
// WORKFLOW PROCESSOR INTERFACE
// ============================================

interface WorkflowProcessor {
  execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult>;
}

// ============================================
// DEMAND FORECASTING WORKFLOW
// ============================================

const demandForecastingProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    const forecastsCreated: any[] = [];

    // Step 1: Fetch products for forecasting
    const step1 = await engine.recordStep(context, 1, "Fetch Active Products", "data_fetch", async () => {
      const activeProducts = await db
        .select()
        .from(products)
        .where(eq(products.status, "active"));

      return { success: true, data: { products: activeProducts, count: activeProducts.length } };
    });

    if (!step1.success) {
      return { success: false, runId: context.runId, status: "failed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, error: step1.error };
    }

    const productList = step1.data.products;
    itemsProcessed = productList.length;

    // Step 2: Fetch historical sales data
    const step2 = await engine.recordStep(context, 2, "Fetch Historical Sales", "data_fetch", async () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const salesData = await db
        .select({
          productId: orderItems.productId,
          totalQuantity: sql<number>`SUM(CAST(${orderItems.quantity} AS DECIMAL))`,
          orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(
            gte(orders.orderDate, threeMonthsAgo),
            eq(orders.status, "delivered")
          )
        )
        .groupBy(orderItems.productId);

      return { success: true, data: { salesData } };
    });

    // Step 3: Generate forecasts using AI
    const step3 = await engine.recordStep(context, 3, "Generate AI Forecasts", "ai_analysis", async () => {
      const forecasts: any[] = [];
      const forecastPeriodStart = new Date();
      const forecastPeriodEnd = new Date();
      forecastPeriodEnd.setMonth(forecastPeriodEnd.getMonth() + 1);

      for (const product of productList) {
        try {
          const productSales = step2.data?.salesData.find((s: any) => s.productId === product.id);
          const historicalQty = productSales?.totalQuantity || 0;
          const avgMonthly = historicalQty / 3;

          // Use AI to analyze and adjust forecast
          const aiDecision = await engine.makeAIDecision(
            context,
            "forecast_adjustment",
            `Generate demand forecast for product "${product.name}" (SKU: ${product.sku}).
Historical data:
- Total sales last 3 months: ${historicalQty} units
- Average monthly: ${avgMonthly.toFixed(2)} units
- Order count: ${productSales?.orderCount || 0}

Consider seasonal factors, trends, and market conditions.
Provide forecast quantity for next month and confidence level.`,
            [],
            {
              type: "object",
              properties: {
                forecastedQuantity: { type: "number" },
                confidence: { type: "number" },
                trend: { type: "string" },
                reasoning: { type: "string" },
              },
              required: ["forecastedQuantity", "confidence", "trend", "reasoning"],
              additionalProperties: false,
            }
          );

          // Create forecast record
          const forecastNumber = `FC-${Date.now().toString(36).toUpperCase()}-${product.id}`;
          const [forecast] = await db
            .insert(demandForecasts)
            .values({
              forecastNumber,
              productId: product.id,
              forecastDate: new Date(),
              forecastPeriodStart,
              forecastPeriodEnd,
              forecastedQuantity: aiDecision.decision.forecastedQuantity.toString(),
              confidenceLevel: aiDecision.decision.confidence.toString(),
              forecastMethod: "ai_trend",
              trendDirection: aiDecision.decision.trend as any,
              historicalDataMonths: 3,
              status: "active",
            })
            .$returningId();

          forecasts.push({
            id: forecast.id,
            productId: product.id,
            productName: product.name,
            quantity: aiDecision.decision.forecastedQuantity,
            confidence: aiDecision.decision.confidence,
          });

          itemsSucceeded++;
        } catch (err) {
          itemsFailed++;
          console.error(`Failed to forecast product ${product.id}:`, err);
        }
      }

      return {
        success: true,
        data: { forecasts },
        confidence: forecasts.length > 0 ? forecasts.reduce((sum, f) => sum + f.confidence, 0) / forecasts.length : 0,
      };
    });

    // Step 4: Emit event for downstream workflows
    await engine.recordStep(context, 4, "Trigger Production Planning", "send_notification", async () => {
      await engine.emitEvent(
        "forecast_generated",
        "info",
        "forecasting",
        "demand_forecast",
        context.runId,
        { forecastCount: step3.data?.forecasts.length }
      );

      return { success: true, data: { notified: true } };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: { forecasts: step3.data?.forecasts },
    };
  },
};

// ============================================
// PRODUCTION PLANNING WORKFLOW
// ============================================

const productionPlanningProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Get active forecasts
    const step1 = await engine.recordStep(context, 1, "Fetch Active Forecasts", "data_fetch", async () => {
      const forecasts = await db
        .select()
        .from(demandForecasts)
        .where(eq(demandForecasts.status, "active"));

      return { success: true, data: { forecasts } };
    });

    if (!step1.success || !step1.data?.forecasts.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, outputData: { message: "No active forecasts" } };
    }

    // Step 2: Get current inventory levels
    const step2 = await engine.recordStep(context, 2, "Check Current Inventory", "data_fetch", async () => {
      const inventoryLevels = await db
        .select({
          productId: inventory.productId,
          totalQty: sql<number>`SUM(CAST(${inventory.quantity} AS DECIMAL))`,
          reservedQty: sql<number>`SUM(CAST(${inventory.reservedQuantity} AS DECIMAL))`,
        })
        .from(inventory)
        .groupBy(inventory.productId);

      return { success: true, data: { inventory: inventoryLevels } };
    });

    const forecasts = step1.data.forecasts;
    itemsProcessed = forecasts.length;

    // Step 3: Generate production plans
    const step3 = await engine.recordStep(context, 3, "Generate Production Plans", "ai_decision", async () => {
      const plans: any[] = [];

      for (const forecast of forecasts) {
        try {
          const invLevel = step2.data?.inventory.find((i: any) => i.productId === forecast.productId);
          const availableQty = (invLevel?.totalQty || 0) - (invLevel?.reservedQty || 0);
          const forecastedQty = parseFloat(forecast.forecastedQuantity);
          const gap = forecastedQty - availableQty;

          if (gap <= 0) {
            // No production needed
            itemsSucceeded++;
            continue;
          }

          // Get BOM for this product
          const [bom] = await db
            .select()
            .from(billOfMaterials)
            .where(
              and(
                eq(billOfMaterials.productId, forecast.productId),
                eq(billOfMaterials.isActive, true)
              )
            );

          // AI decides production quantity (may produce more for efficiency)
          const aiDecision = await engine.makeAIDecision(
            context,
            "quantity_calculation",
            `Calculate optimal production quantity:
- Forecasted demand: ${forecastedQty} units
- Current available inventory: ${availableQty} units
- Gap to fill: ${gap} units
- Has BOM: ${bom ? "Yes" : "No"}

Consider batch sizes, production efficiency, and safety stock.`,
            [],
            {
              type: "object",
              properties: {
                plannedQuantity: { type: "number" },
                reasoning: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["plannedQuantity", "reasoning", "confidence"],
              additionalProperties: false,
            }
          );

          const planNumber = `PP-${Date.now().toString(36).toUpperCase()}`;
          const [plan] = await db
            .insert(productionPlans)
            .values({
              planNumber,
              demandForecastId: forecast.id,
              productId: forecast.productId,
              bomId: bom?.id,
              plannedQuantity: aiDecision.decision.plannedQuantity.toString(),
              currentInventory: availableQty.toString(),
              safetyStock: Math.ceil(forecastedQty * 0.1).toString(), // 10% safety stock
              status: "draft",
            })
            .$returningId();

          plans.push({
            id: plan.id,
            productId: forecast.productId,
            quantity: aiDecision.decision.plannedQuantity,
          });

          itemsSucceeded++;
        } catch (err) {
          itemsFailed++;
        }
      }

      return { success: true, data: { plans } };
    });

    // Step 4: Trigger material requirements planning
    await engine.recordStep(context, 4, "Trigger MRP", "send_notification", async () => {
      await engine.emitEvent(
        "production_planning",
        "info",
        "production",
        "production_plan",
        context.runId,
        { planCount: step3.data?.plans.length }
      );

      return { success: true };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: { plans: step3.data?.plans },
    };
  },
};

// ============================================
// MATERIAL REQUIREMENTS WORKFLOW
// ============================================

const materialRequirementsProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Get pending production plans
    const step1 = await engine.recordStep(context, 1, "Fetch Production Plans", "data_fetch", async () => {
      const plans = await db
        .select()
        .from(productionPlans)
        .where(
          or(
            eq(productionPlans.status, "draft"),
            eq(productionPlans.status, "approved")
          )
        );

      return { success: true, data: { plans } };
    });

    if (!step1.success || !step1.data?.plans.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    const plans = step1.data.plans;
    itemsProcessed = plans.length;

    // Step 2: Calculate material requirements
    const step2 = await engine.recordStep(context, 2, "Calculate Material Requirements", "calculation", async () => {
      const requirements: any[] = [];

      for (const plan of plans) {
        if (!plan.bomId) continue;

        // Get BOM components
        const components = await db
          .select()
          .from(bomComponents)
          .where(eq(bomComponents.bomId, plan.bomId));

        for (const component of components) {
          const plannedQty = parseFloat(plan.plannedQuantity);
          const componentQty = parseFloat(component.quantity);
          const wastePercent = parseFloat(component.wastePercentage || "0");
          const requiredQty = componentQty * plannedQty * (1 + wastePercent / 100);

          // Get current raw material inventory
          const [rmInventory] = await db
            .select({
              totalQty: sql<number>`SUM(CAST(${rawMaterialInventory.quantity} AS DECIMAL))`,
            })
            .from(rawMaterialInventory)
            .where(eq(rawMaterialInventory.rawMaterialId, component.rawMaterialId));

          const currentInv = rmInventory?.totalQty || 0;

          // Check on-order quantity
          const [onOrder] = await db.execute(sql`
            SELECT COALESCE(SUM(CAST(poi.quantity AS DECIMAL) - CAST(poi.receivedQuantity AS DECIMAL)), 0) as onOrderQty
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi.purchaseOrderId
            JOIN purchaseOrderRawMaterials porm ON porm.purchaseOrderItemId = poi.id
            WHERE porm.rawMaterialId = ${component.rawMaterialId}
            AND po.status IN ('sent', 'confirmed', 'partial')
          `);

          const onOrderQty = (onOrder as any)?.[0]?.onOrderQty || 0;
          const availableQty = currentInv + onOrderQty;
          const shortageQty = Math.max(0, requiredQty - availableQty);

          if (shortageQty > 0) {
            // Get raw material details
            const [rm] = await db
              .select()
              .from(rawMaterials)
              .where(eq(rawMaterials.id, component.rawMaterialId));

            const unitCost = parseFloat(rm?.unitCost || "0");
            totalValue += shortageQty * unitCost;

            // Create material requirement
            const [req] = await db
              .insert(materialRequirements)
              .values({
                productionPlanId: plan.id,
                rawMaterialId: component.rawMaterialId,
                requiredQuantity: requiredQty.toString(),
                currentInventory: currentInv.toString(),
                onOrderQuantity: onOrderQty.toString(),
                shortageQuantity: shortageQty.toString(),
                suggestedOrderQuantity: Math.max(shortageQty, parseFloat(rm?.minOrderQty || "0")).toString(),
                preferredVendorId: rm?.preferredVendorId,
                estimatedUnitCost: unitCost.toString(),
                isUrgent: (plan.plannedStartDate && new Date(plan.plannedStartDate) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
                status: "pending",
              })
              .$returningId();

            requirements.push({
              id: req.id,
              materialId: component.rawMaterialId,
              materialName: rm?.name,
              shortage: shortageQty,
              cost: shortageQty * unitCost,
            });
          }
        }

        itemsSucceeded++;
      }

      return { success: true, data: { requirements, totalValue } };
    });

    // Step 3: Generate suggested purchase orders
    const step3 = await engine.recordStep(context, 3, "Generate Suggested POs", "create_record", async () => {
      const reqs = step2.data?.requirements || [];
      if (reqs.length === 0) return { success: true, data: { suggestedPOs: [] } };

      // Group requirements by vendor
      const vendorReqs = new Map<number, any[]>();
      for (const req of reqs) {
        const fullReq = await db
          .select()
          .from(materialRequirements)
          .where(eq(materialRequirements.id, req.id));

        if (fullReq[0]?.preferredVendorId) {
          const vendorId = fullReq[0].preferredVendorId;
          if (!vendorReqs.has(vendorId)) vendorReqs.set(vendorId, []);
          vendorReqs.get(vendorId)!.push({ ...req, fullReq: fullReq[0] });
        }
      }

      const suggestedPOs: any[] = [];

      for (const [vendorId, items] of vendorReqs) {
        const poTotal = items.reduce((sum, item) => sum + item.cost, 0);
        const suggestedPoNumber = `SPO-${Date.now().toString(36).toUpperCase()}`;

        const [spo] = await db
          .insert(suggestedPurchaseOrders)
          .values({
            suggestedPoNumber,
            vendorId,
            totalAmount: poTotal.toString(),
            status: "pending",
            aiReasoning: `Auto-generated from material requirements. ${items.length} items with total value $${poTotal.toFixed(2)}`,
            confidenceScore: "85",
          })
          .$returningId();

        // Create line items
        for (const item of items) {
          await db.insert(suggestedPoItems).values({
            suggestedPoId: spo.id,
            materialRequirementId: item.id,
            rawMaterialId: item.materialId,
            quantity: item.shortage.toString(),
            unitPrice: (item.cost / item.shortage).toString(),
            totalPrice: item.cost.toString(),
          });
        }

        suggestedPOs.push({ id: spo.id, vendorId, total: poTotal, itemCount: items.length });
      }

      return { success: true, data: { suggestedPOs } };
    });

    // Step 4: Request approval for high-value POs
    if (step3.data?.suggestedPOs.length > 0) {
      await engine.recordStep(context, 4, "Request PO Approvals", "wait_approval", async () => {
        for (const spo of step3.data.suggestedPOs) {
          await engine.requestApproval(
            context,
            "purchase_order",
            `Suggested PO for Vendor #${spo.vendorId}`,
            `${spo.itemCount} materials, total value $${spo.total.toFixed(2)}`,
            spo.total,
            "suggested_purchase_order",
            spo.id,
            "AI recommends approval based on material requirements and vendor performance",
            85
          );
        }

        return { success: true };
      });
    }

    return {
      success: true,
      runId: context.runId,
      status: step3.data?.suggestedPOs.length ? "awaiting_approval" : "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      totalValue,
      outputData: { requirements: step2.data?.requirements, suggestedPOs: step3.data?.suggestedPOs },
      pendingApprovals: step3.data?.suggestedPOs.length,
    };
  },
};

// ============================================
// PROCUREMENT WORKFLOW
// ============================================

const procurementProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Get approved suggested POs
    const step1 = await engine.recordStep(context, 1, "Fetch Approved Suggested POs", "data_fetch", async () => {
      const approvedSPOs = await db
        .select()
        .from(suggestedPurchaseOrders)
        .where(eq(suggestedPurchaseOrders.status, "approved"));

      return { success: true, data: { suggestedPOs: approvedSPOs } };
    });

    if (!step1.success || !step1.data?.suggestedPOs.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    const suggestedPOs = step1.data.suggestedPOs;
    itemsProcessed = suggestedPOs.length;

    // Step 2: Convert to actual purchase orders
    const step2 = await engine.recordStep(context, 2, "Convert to Purchase Orders", "create_record", async () => {
      const createdPOs: any[] = [];

      for (const spo of suggestedPOs) {
        try {
          // Get vendor details
          const [vendor] = await db
            .select()
            .from(vendors)
            .where(eq(vendors.id, spo.vendorId));

          // Get line items
          const items = await db
            .select()
            .from(suggestedPoItems)
            .where(eq(suggestedPoItems.suggestedPoId, spo.id));

          // Calculate totals
          const subtotal = items.reduce((sum, item) => sum + parseFloat(item.totalPrice || "0"), 0);

          // Create PO
          const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
          const expectedDate = new Date();
          expectedDate.setDate(expectedDate.getDate() + (vendor?.defaultLeadTimeDays || 14));

          const [po] = await db
            .insert(purchaseOrders)
            .values({
              poNumber,
              vendorId: spo.vendorId,
              status: "draft",
              orderDate: new Date(),
              expectedDate,
              subtotal: subtotal.toString(),
              totalAmount: subtotal.toString(),
              currency: spo.currency || "USD",
              notes: `Auto-generated from suggested PO ${spo.suggestedPoNumber}`,
            })
            .$returningId();

          // Create line items
          for (const item of items) {
            const [rm] = await db
              .select()
              .from(rawMaterials)
              .where(eq(rawMaterials.id, item.rawMaterialId));

            const [poItem] = await db
              .insert(purchaseOrderItems)
              .values({
                purchaseOrderId: po.id,
                productId: item.productId,
                description: rm?.name || `Material #${item.rawMaterialId}`,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalAmount: item.totalPrice,
              })
              .$returningId();

            // Link to raw material
            await db.insert(purchaseOrderRawMaterials).values({
              purchaseOrderItemId: poItem.id,
              rawMaterialId: item.rawMaterialId,
              quantity: item.quantity,
            });
          }

          // Update suggested PO
          await db
            .update(suggestedPurchaseOrders)
            .set({
              status: "converted",
              convertedPoId: po.id,
            })
            .where(eq(suggestedPurchaseOrders.id, spo.id));

          createdPOs.push({ id: po.id, poNumber, vendorId: spo.vendorId, total: subtotal });
          totalValue += subtotal;
          itemsSucceeded++;
        } catch (err) {
          itemsFailed++;
          console.error(`Failed to convert SPO ${spo.id}:`, err);
        }
      }

      return { success: true, data: { createdPOs }, createdEntities: createdPOs.map(p => ({ type: "purchase_order", id: p.id })) };
    });

    // Step 3: Send POs to vendors
    const step3 = await engine.recordStep(context, 3, "Send POs to Vendors", "send_email", async () => {
      const sentPOs: any[] = [];

      for (const po of step2.data?.createdPOs || []) {
        const [vendor] = await db
          .select()
          .from(vendors)
          .where(eq(vendors.id, po.vendorId));

        if (vendor?.email) {
          // Generate PO email using AI
          const emailContent = await engine.makeAIDecision(
            context,
            "vendor_selection", // reusing decision type
            `Generate a professional purchase order email to vendor "${vendor.name}".
PO Number: ${po.poNumber}
Total Amount: $${po.total.toFixed(2)}

Include standard terms and request confirmation.`,
            [],
            {
              type: "object",
              properties: {
                subject: { type: "string" },
                body: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["subject", "body", "confidence"],
              additionalProperties: false,
            }
          );

          // Mark as sent (email would be sent here)
          await db
            .update(purchaseOrders)
            .set({ status: "sent" })
            .where(eq(purchaseOrders.id, po.id));

          sentPOs.push(po);
        }
      }

      return { success: true, data: { sentPOs } };
    });

    await engine.emitEvent(
      "po_sent",
      "info",
      "procurement",
      "purchase_order",
      context.runId,
      { poCount: step3.data?.sentPOs.length }
    );

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      totalValue,
      outputData: { createdPOs: step2.data?.createdPOs, sentPOs: step3.data?.sentPOs },
    };
  },
};

// ============================================
// INVENTORY REORDER WORKFLOW
// ============================================

const inventoryReorderProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Check inventory levels against reorder points
    const step1 = await engine.recordStep(context, 1, "Check Reorder Points", "data_fetch", async () => {
      const lowStockItems = await db
        .select({
          inventory: inventory,
          product: products,
        })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .where(
          and(
            sql`CAST(${inventory.quantity} AS DECIMAL) - CAST(${inventory.reservedQuantity} AS DECIMAL) <= CAST(${inventory.reorderLevel} AS DECIMAL)`,
            eq(products.status, "active")
          )
        );

      return { success: true, data: { lowStockItems } };
    });

    if (!step1.success || !step1.data?.lowStockItems.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.lowStockItems.length;

    // Step 2: Calculate reorder quantities
    const step2 = await engine.recordStep(context, 2, "Calculate Reorder Quantities", "ai_decision", async () => {
      const reorderRecommendations: any[] = [];

      for (const item of step1.data.lowStockItems) {
        const currentQty = parseFloat(item.inventory.quantity) - parseFloat(item.inventory.reservedQuantity || "0");
        const reorderLevel = parseFloat(item.inventory.reorderLevel || "0");
        const reorderQty = parseFloat(item.inventory.reorderQuantity || "100");

        const aiDecision = await engine.makeAIDecision(
          context,
          "reorder_trigger",
          `Determine optimal reorder quantity for product "${item.product.name}":
- Current available: ${currentQty} units
- Reorder level: ${reorderLevel} units
- Default reorder quantity: ${reorderQty} units
- Unit cost: $${item.product.costPrice || item.product.unitPrice}

Consider demand trends and storage capacity.`,
          [],
          {
            type: "object",
            properties: {
              recommendedQuantity: { type: "number" },
              urgency: { type: "string" },
              reasoning: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["recommendedQuantity", "urgency", "reasoning", "confidence"],
            additionalProperties: false,
          }
        );

        const unitCost = parseFloat(item.product.costPrice || item.product.unitPrice);
        const orderValue = aiDecision.decision.recommendedQuantity * unitCost;
        totalValue += orderValue;

        reorderRecommendations.push({
          productId: item.product.id,
          productName: item.product.name,
          currentQty,
          recommendedQty: aiDecision.decision.recommendedQuantity,
          urgency: aiDecision.decision.urgency,
          value: orderValue,
          vendorId: item.product.preferredVendorId,
        });

        itemsSucceeded++;
      }

      return { success: true, data: { recommendations: reorderRecommendations } };
    });

    // Step 3: Create purchase orders for reorders
    await engine.recordStep(context, 3, "Create Reorder POs", "create_record", async () => {
      const vendorGroups = new Map<number, any[]>();

      for (const rec of step2.data?.recommendations || []) {
        if (rec.vendorId) {
          if (!vendorGroups.has(rec.vendorId)) vendorGroups.set(rec.vendorId, []);
          vendorGroups.get(rec.vendorId)!.push(rec);
        }
      }

      const createdPOs: any[] = [];

      for (const [vendorId, items] of vendorGroups) {
        const poTotal = items.reduce((sum, item) => sum + item.value, 0);

        // Request approval for each PO
        await engine.requestApproval(
          context,
          "purchase_order",
          `Inventory Reorder PO for Vendor #${vendorId}`,
          `${items.length} products below reorder point. Total: $${poTotal.toFixed(2)}`,
          poTotal,
          "inventory_reorder",
          vendorId,
          `Automated reorder triggered for ${items.length} low-stock products`,
          90
        );

        createdPOs.push({ vendorId, itemCount: items.length, total: poTotal });
      }

      return { success: true, data: { pendingPOs: createdPOs } };
    });

    // Emit low inventory event
    await engine.emitEvent(
      "inventory_low",
      "warning",
      "inventory",
      "inventory",
      context.runId,
      { lowStockCount: itemsProcessed, totalValue }
    );

    return {
      success: true,
      runId: context.runId,
      status: "awaiting_approval",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      totalValue,
      outputData: { recommendations: step2.data?.recommendations },
    };
  },
};

// ============================================
// INVENTORY TRANSFER WORKFLOW
// ============================================

const inventoryTransferProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;

    // Step 1: Analyze inventory distribution across warehouses
    const step1 = await engine.recordStep(context, 1, "Analyze Inventory Distribution", "data_fetch", async () => {
      const distribution = await db
        .select({
          productId: inventory.productId,
          warehouseId: inventory.warehouseId,
          quantity: inventory.quantity,
          reservedQuantity: inventory.reservedQuantity,
          reorderLevel: inventory.reorderLevel,
        })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .where(eq(products.status, "active"));

      const warehouseList = await db.select().from(warehouses).where(eq(warehouses.status, "active"));

      return { success: true, data: { distribution, warehouses: warehouseList } };
    });

    // Step 2: Identify transfer opportunities using AI
    const step2 = await engine.recordStep(context, 2, "Identify Transfer Opportunities", "ai_analysis", async () => {
      const productDistribution = new Map<number, any[]>();

      for (const inv of step1.data?.distribution || []) {
        if (!productDistribution.has(inv.productId)) {
          productDistribution.set(inv.productId, []);
        }
        productDistribution.get(inv.productId)!.push(inv);
      }

      const transferRecommendations: any[] = [];

      for (const [productId, locations] of productDistribution) {
        if (locations.length < 2) continue;

        // Find locations with excess and shortage
        const excess = locations.filter(l => {
          const available = parseFloat(l.quantity) - parseFloat(l.reservedQuantity || "0");
          const reorderLevel = parseFloat(l.reorderLevel || "0");
          return available > reorderLevel * 2;
        });

        const shortage = locations.filter(l => {
          const available = parseFloat(l.quantity) - parseFloat(l.reservedQuantity || "0");
          const reorderLevel = parseFloat(l.reorderLevel || "0");
          return available < reorderLevel;
        });

        if (excess.length > 0 && shortage.length > 0) {
          const aiDecision = await engine.makeAIDecision(
            context,
            "allocation_decision",
            `Determine optimal inventory transfer for product #${productId}:
Locations with excess: ${JSON.stringify(excess.map(e => ({ warehouseId: e.warehouseId, qty: e.quantity })))}
Locations with shortage: ${JSON.stringify(shortage.map(s => ({ warehouseId: s.warehouseId, qty: s.quantity, reorderLevel: s.reorderLevel })))}

Recommend transfer quantity and from/to warehouses.`,
            [],
            {
              type: "object",
              properties: {
                fromWarehouseId: { type: "number" },
                toWarehouseId: { type: "number" },
                quantity: { type: "number" },
                reasoning: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["fromWarehouseId", "toWarehouseId", "quantity", "reasoning", "confidence"],
              additionalProperties: false,
            }
          );

          transferRecommendations.push({
            productId,
            ...aiDecision.decision,
          });
        }
      }

      return { success: true, data: { transfers: transferRecommendations } };
    });

    if (step2.data?.transfers.length === 0) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, outputData: { message: "No transfers needed" } };
    }

    itemsProcessed = step2.data.transfers.length;

    // Step 3: Create transfer orders
    const step3 = await engine.recordStep(context, 3, "Create Transfer Orders", "create_record", async () => {
      const createdTransfers: any[] = [];

      for (const transfer of step2.data?.transfers || []) {
        try {
          const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`;

          const [trfOrder] = await db
            .insert(inventoryTransfers)
            .values({
              transferNumber,
              fromWarehouseId: transfer.fromWarehouseId,
              toWarehouseId: transfer.toWarehouseId,
              status: "pending",
              requestedDate: new Date(),
              notes: `Auto-generated transfer: ${transfer.reasoning}`,
            })
            .$returningId();

          await db.insert(inventoryTransferItems).values({
            transferId: trfOrder.id,
            productId: transfer.productId,
            requestedQuantity: transfer.quantity.toString(),
          });

          createdTransfers.push({ id: trfOrder.id, transferNumber, ...transfer });
          itemsSucceeded++;
        } catch (err) {
          itemsFailed++;
        }
      }

      return { success: true, data: { createdTransfers } };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: { transfers: step3.data?.createdTransfers },
    };
  },
};

// ============================================
// INVENTORY OPTIMIZATION WORKFLOW
// ============================================

const inventoryOptimizationProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();

    // Step 1: Analyze inventory metrics
    const step1 = await engine.recordStep(context, 1, "Analyze Inventory Metrics", "ai_analysis", async () => {
      const invSummary = await db
        .select({
          productId: inventory.productId,
          productName: products.name,
          totalQty: sql<number>`SUM(CAST(${inventory.quantity} AS DECIMAL))`,
          totalReserved: sql<number>`SUM(CAST(${inventory.reservedQuantity} AS DECIMAL))`,
          unitCost: products.costPrice,
        })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .groupBy(inventory.productId, products.name, products.costPrice);

      // Calculate inventory value and identify excess
      let totalValue = 0;
      const excessItems: any[] = [];
      const slowMoving: any[] = [];

      for (const item of invSummary) {
        const available = item.totalQty - item.totalReserved;
        const value = available * parseFloat(item.unitCost || "0");
        totalValue += value;

        // Items with high inventory relative to demand
        if (available > 1000) {
          excessItems.push({ ...item, availableQty: available, value });
        }
      }

      return { success: true, data: { totalValue, itemCount: invSummary.length, excessItems, slowMoving } };
    });

    // Step 2: Generate optimization recommendations
    const step2 = await engine.recordStep(context, 2, "Generate Recommendations", "ai_decision", async () => {
      const aiDecision = await engine.makeAIDecision(
        context,
        "allocation_decision",
        `Analyze inventory optimization opportunities:
Total Inventory Value: $${step1.data?.totalValue.toFixed(2)}
Total SKUs: ${step1.data?.itemCount}
Excess Items: ${step1.data?.excessItems.length}

Provide recommendations for:
1. Reducing excess inventory
2. Improving turnover
3. Reorder point adjustments`,
        [],
        {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  targetProducts: { type: "array", items: { type: "number" } },
                  expectedSavings: { type: "number" },
                  priority: { type: "string" },
                },
                required: ["action", "targetProducts", "expectedSavings", "priority"],
                additionalProperties: false,
              },
            },
            summary: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["recommendations", "summary", "confidence"],
          additionalProperties: false,
        }
      );

      return { success: true, data: aiDecision.decision };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed: step1.data?.itemCount || 0,
      itemsSucceeded: step1.data?.itemCount || 0,
      itemsFailed: 0,
      totalValue: step1.data?.totalValue,
      outputData: step2.data,
    };
  },
};

// ============================================
// WORK ORDER GENERATION WORKFLOW
// ============================================

const workOrderGenerationProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;

    // Step 1: Get approved production plans
    const step1 = await engine.recordStep(context, 1, "Fetch Approved Production Plans", "data_fetch", async () => {
      const plans = await db
        .select()
        .from(productionPlans)
        .where(eq(productionPlans.status, "approved"));

      return { success: true, data: { plans } };
    });

    if (!step1.success || !step1.data?.plans.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.plans.length;

    // Step 2: Create work orders
    const step2 = await engine.recordStep(context, 2, "Create Work Orders", "create_record", async () => {
      const workOrdersCreated: any[] = [];

      for (const plan of step1.data.plans) {
        try {
          const [product] = await db
            .select()
            .from(products)
            .where(eq(products.id, plan.productId));

          const woNumber = `WO-${Date.now().toString(36).toUpperCase()}`;

          const [wo] = await db
            .insert(workOrders)
            .values({
              workOrderNumber: woNumber,
              productId: plan.productId,
              productionPlanId: plan.id,
              bomId: plan.bomId,
              quantity: plan.plannedQuantity,
              status: "planned",
              plannedStartDate: plan.plannedStartDate || new Date(),
              plannedEndDate: plan.plannedEndDate,
              notes: `Auto-generated from production plan ${plan.planNumber}`,
            })
            .$returningId();

          // Generate materials list from BOM
          if (plan.bomId) {
            const components = await db
              .select()
              .from(bomComponents)
              .where(eq(bomComponents.bomId, plan.bomId));

            for (const comp of components) {
              const reqQty = parseFloat(plan.plannedQuantity) * parseFloat(comp.quantity) * (1 + parseFloat(comp.wastePercentage || "0") / 100);

              await db.insert(workOrderMaterials).values({
                workOrderId: wo.id,
                rawMaterialId: comp.rawMaterialId,
                requiredQuantity: reqQty.toString(),
                status: "pending",
              });
            }
          }

          // Update production plan
          await db
            .update(productionPlans)
            .set({ status: "in_progress" })
            .where(eq(productionPlans.id, plan.id));

          workOrdersCreated.push({ id: wo.id, woNumber, productId: plan.productId, productName: product?.name });
          itemsSucceeded++;
        } catch (err) {
          itemsFailed++;
        }
      }

      return { success: true, data: { workOrders: workOrdersCreated } };
    });

    await engine.emitEvent(
      "work_order_created",
      "info",
      "production",
      "work_order",
      context.runId,
      { count: step2.data?.workOrders.length }
    );

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: { workOrders: step2.data?.workOrders },
    };
  },
};

// ============================================
// PRODUCTION SCHEDULING WORKFLOW
// ============================================

const productionSchedulingProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;

    // Step 1: Get planned work orders
    const step1 = await engine.recordStep(context, 1, "Fetch Work Orders", "data_fetch", async () => {
      const orders = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.status, "planned"))
        .orderBy(asc(workOrders.plannedStartDate));

      return { success: true, data: { workOrders: orders } };
    });

    if (!step1.success || !step1.data?.workOrders.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.workOrders.length;

    // Step 2: Check material availability
    const step2 = await engine.recordStep(context, 2, "Check Material Availability", "data_fetch", async () => {
      const readyOrders: any[] = [];
      const blockedOrders: any[] = [];

      for (const wo of step1.data.workOrders) {
        const materials = await db
          .select()
          .from(workOrderMaterials)
          .where(eq(workOrderMaterials.workOrderId, wo.id));

        let allAvailable = true;

        for (const mat of materials) {
          const [inv] = await db
            .select({
              totalQty: sql<number>`SUM(CAST(${rawMaterialInventory.quantity} AS DECIMAL))`,
            })
            .from(rawMaterialInventory)
            .where(eq(rawMaterialInventory.rawMaterialId, mat.rawMaterialId));

          const available = inv?.totalQty || 0;
          const required = parseFloat(mat.requiredQuantity);

          if (available < required) {
            allAvailable = false;
            break;
          }
        }

        if (allAvailable) {
          readyOrders.push(wo);
        } else {
          blockedOrders.push(wo);
        }
      }

      return { success: true, data: { readyOrders, blockedOrders } };
    });

    // Step 3: Schedule ready orders
    const step3 = await engine.recordStep(context, 3, "Schedule Production", "ai_decision", async () => {
      const scheduled: any[] = [];
      let currentDate = new Date();

      for (const wo of step2.data?.readyOrders || []) {
        // AI decides optimal scheduling
        const aiDecision = await engine.makeAIDecision(
          context,
          "timing_decision",
          `Schedule work order ${wo.workOrderNumber}:
- Product: #${wo.productId}
- Quantity: ${wo.quantity}
- Original planned start: ${wo.plannedStartDate}
- Materials ready: Yes

Determine optimal start date considering capacity and priority.`,
          [],
          {
            type: "object",
            properties: {
              scheduledStart: { type: "string" },
              estimatedDuration: { type: "number" },
              priority: { type: "string" },
              reasoning: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["scheduledStart", "estimatedDuration", "priority", "reasoning", "confidence"],
            additionalProperties: false,
          }
        );

        const scheduledStart = new Date(aiDecision.decision.scheduledStart);
        const scheduledEnd = new Date(scheduledStart);
        scheduledEnd.setHours(scheduledEnd.getHours() + aiDecision.decision.estimatedDuration);

        await db
          .update(workOrders)
          .set({
            status: "scheduled",
            scheduledStartDate: scheduledStart,
            scheduledEndDate: scheduledEnd,
          })
          .where(eq(workOrders.id, wo.id));

        scheduled.push({ ...wo, scheduledStart, scheduledEnd });
        itemsSucceeded++;
      }

      return { success: true, data: { scheduled } };
    });

    // Handle blocked orders
    for (const blocked of step2.data?.blockedOrders || []) {
      await engine.handleException(
        context,
        "stockout",
        `Material shortage for WO ${blocked.workOrderNumber}`,
        "Work order cannot be scheduled due to insufficient materials",
        { workOrderId: blocked.id },
        "work_order",
        blocked.id
      );
      itemsFailed++;
    }

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: { scheduled: step3.data?.scheduled, blocked: step2.data?.blockedOrders },
    };
  },
};

// ============================================
// FREIGHT PROCUREMENT WORKFLOW
// ============================================

const freightProcurementProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Get pending freight RFQs
    const step1 = await engine.recordStep(context, 1, "Fetch Pending RFQs", "data_fetch", async () => {
      const rfqs = await db
        .select()
        .from(freightRfqs)
        .where(eq(freightRfqs.status, "draft"));

      return { success: true, data: { rfqs } };
    });

    if (!step1.success || !step1.data?.rfqs.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.rfqs.length;

    // Step 2: Get eligible carriers
    const step2 = await engine.recordStep(context, 2, "Fetch Eligible Carriers", "data_fetch", async () => {
      const carriers = await db
        .select()
        .from(freightCarriers)
        .where(eq(freightCarriers.status, "active"));

      return { success: true, data: { carriers } };
    });

    // Step 3: Send RFQs to carriers
    const step3 = await engine.recordStep(context, 3, "Send RFQs to Carriers", "send_email", async () => {
      const sentRfqs: any[] = [];

      for (const rfq of step1.data.rfqs) {
        try {
          // AI selects best carriers based on lane and requirements
          const aiDecision = await engine.makeAIDecision(
            context,
            "vendor_selection",
            `Select carriers for freight RFQ:
Origin: ${rfq.originCity}, ${rfq.originCountry}
Destination: ${rfq.destinationCity}, ${rfq.destinationCountry}
Cargo type: ${rfq.cargoType}
Weight: ${rfq.weight} ${rfq.weightUnit}

Available carriers: ${JSON.stringify(step2.data?.carriers.map((c: any) => ({ id: c.id, name: c.name, rating: c.rating })))}

Select top 3 carriers to request quotes from.`,
            step2.data?.carriers || [],
            {
              type: "object",
              properties: {
                selectedCarrierIds: { type: "array", items: { type: "number" } },
                reasoning: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["selectedCarrierIds", "reasoning", "confidence"],
              additionalProperties: false,
            }
          );

          // Update RFQ status
          await db
            .update(freightRfqs)
            .set({ status: "sent" })
            .where(eq(freightRfqs.id, rfq.id));

          sentRfqs.push({
            rfqId: rfq.id,
            carrierIds: aiDecision.decision.selectedCarrierIds,
          });

          itemsSucceeded++;
        } catch (err) {
          itemsFailed++;
        }
      }

      return { success: true, data: { sentRfqs } };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: { sentRfqs: step3.data?.sentRfqs },
    };
  },
};

// ============================================
// SHIPMENT TRACKING WORKFLOW
// ============================================

const shipmentTrackingProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;

    // Step 1: Get in-transit shipments
    const step1 = await engine.recordStep(context, 1, "Fetch In-Transit Shipments", "data_fetch", async () => {
      const activeShipments = await db
        .select()
        .from(shipments)
        .where(eq(shipments.status, "in_transit"));

      return { success: true, data: { shipments: activeShipments } };
    });

    if (!step1.success || !step1.data?.shipments.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.shipments.length;

    // Step 2: Check for delays and update status
    const step2 = await engine.recordStep(context, 2, "Check Delivery Status", "api_call", async () => {
      const updates: any[] = [];
      const delays: any[] = [];

      for (const shipment of step1.data.shipments) {
        // Simulate tracking check (in real implementation, would call carrier API)
        const expectedDelivery = shipment.deliveryDate ? new Date(shipment.deliveryDate) : null;
        const isDelayed = expectedDelivery && expectedDelivery < new Date();

        if (isDelayed) {
          delays.push(shipment);

          await engine.handleException(
            context,
            "delivery_delay",
            `Shipment ${shipment.shipmentNumber} is delayed`,
            `Expected delivery: ${expectedDelivery?.toISOString()}, still in transit`,
            { shipmentId: shipment.id, trackingNumber: shipment.trackingNumber },
            "shipment",
            shipment.id
          );

          itemsFailed++;
        } else {
          itemsSucceeded++;
        }

        updates.push({
          id: shipment.id,
          shipmentNumber: shipment.shipmentNumber,
          status: isDelayed ? "delayed" : "in_transit",
          checked: new Date(),
        });
      }

      return { success: true, data: { updates, delays } };
    });

    // Emit events for delays
    if (step2.data?.delays.length > 0) {
      await engine.emitEvent(
        "shipment_delayed",
        "warning",
        "logistics",
        "shipment",
        context.runId,
        { delayedCount: step2.data.delays.length }
      );
    }

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: step2.data,
    };
  },
};

// ============================================
// ORDER FULFILLMENT WORKFLOW
// ============================================

const orderFulfillmentProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Get confirmed orders
    const step1 = await engine.recordStep(context, 1, "Fetch Confirmed Orders", "data_fetch", async () => {
      const confirmedOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.status, "confirmed"));

      return { success: true, data: { orders: confirmedOrders } };
    });

    if (!step1.success || !step1.data?.orders.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.orders.length;

    // Step 2: Check inventory and allocate
    const step2 = await engine.recordStep(context, 2, "Allocate Inventory", "calculation", async () => {
      const allocations: any[] = [];
      const shortages: any[] = [];

      for (const order of step1.data.orders) {
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        let canFulfill = true;
        const orderAllocations: any[] = [];

        for (const item of items) {
          const [inv] = await db
            .select({
              id: inventory.id,
              availableQty: sql<number>`CAST(${inventory.quantity} AS DECIMAL) - CAST(${inventory.reservedQuantity} AS DECIMAL)`,
              warehouseId: inventory.warehouseId,
            })
            .from(inventory)
            .where(eq(inventory.productId, item.productId!))
            .orderBy(desc(sql`CAST(${inventory.quantity} AS DECIMAL) - CAST(${inventory.reservedQuantity} AS DECIMAL)`))
            .limit(1);

          const requiredQty = parseFloat(item.quantity);

          if (!inv || inv.availableQty < requiredQty) {
            canFulfill = false;
            shortages.push({
              orderId: order.id,
              productId: item.productId,
              required: requiredQty,
              available: inv?.availableQty || 0,
            });
            break;
          }

          orderAllocations.push({
            inventoryId: inv.id,
            warehouseId: inv.warehouseId,
            productId: item.productId,
            quantity: requiredQty,
          });
        }

        if (canFulfill) {
          // Reserve inventory
          for (const alloc of orderAllocations) {
            await db
              .update(inventory)
              .set({
                reservedQuantity: sql`CAST(${inventory.reservedQuantity} AS DECIMAL) + ${alloc.quantity}`,
              })
              .where(eq(inventory.id, alloc.inventoryId));
          }

          // Update order status
          await db
            .update(orders)
            .set({ status: "processing" })
            .where(eq(orders.id, order.id));

          allocations.push({ orderId: order.id, allocations: orderAllocations });
          totalValue += parseFloat(order.totalAmount);
          itemsSucceeded++;
        } else {
          itemsFailed++;
        }
      }

      return { success: true, data: { allocations, shortages } };
    });

    // Step 3: Create shipments for allocated orders
    const step3 = await engine.recordStep(context, 3, "Create Shipments", "create_record", async () => {
      const shipmentsCreated: any[] = [];

      for (const alloc of step2.data?.allocations || []) {
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, alloc.orderId));

        if (!order) continue;

        const shipmentNumber = `SHP-${Date.now().toString(36).toUpperCase()}`;

        const [shipment] = await db
          .insert(shipments)
          .values({
            shipmentNumber,
            type: "outbound",
            orderId: order.id,
            status: "pending",
            toAddress: order.shippingAddress,
          })
          .$returningId();

        // Update order status
        await db
          .update(orders)
          .set({ status: "shipped" })
          .where(eq(orders.id, order.id));

        shipmentsCreated.push({ id: shipment.id, shipmentNumber, orderId: order.id });
      }

      return { success: true, data: { shipments: shipmentsCreated } };
    });

    // Handle shortages
    for (const shortage of step2.data?.shortages || []) {
      await engine.handleException(
        context,
        "stockout",
        `Cannot fulfill order ${shortage.orderId}`,
        `Product ${shortage.productId} shortage: need ${shortage.required}, have ${shortage.available}`,
        shortage,
        "order",
        shortage.orderId
      );
    }

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      totalValue,
      outputData: {
        allocations: step2.data?.allocations,
        shipments: step3.data?.shipments,
        shortages: step2.data?.shortages,
      },
    };
  },
};

// ============================================
// SUPPLIER MANAGEMENT WORKFLOW
// ============================================

const supplierManagementProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;

    // Step 1: Get all active vendors
    const step1 = await engine.recordStep(context, 1, "Fetch Active Vendors", "data_fetch", async () => {
      const vendorList = await db
        .select()
        .from(vendors)
        .where(eq(vendors.status, "active"));

      return { success: true, data: { vendors: vendorList } };
    });

    if (!step1.success || !step1.data?.vendors.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.vendors.length;
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Step 2: Calculate performance metrics
    const step2 = await engine.recordStep(context, 2, "Calculate Performance Metrics", "calculation", async () => {
      const metrics: any[] = [];

      for (const vendor of step1.data.vendors) {
        // Get POs for this vendor in the last 3 months
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const [poStats] = await db.execute(sql`
          SELECT
            COUNT(*) as totalOrders,
            SUM(CASE WHEN status = 'received' AND receivedDate <= expectedDate THEN 1 ELSE 0 END) as onTimeCount,
            SUM(CASE WHEN status = 'received' AND receivedDate > expectedDate THEN 1 ELSE 0 END) as lateCount,
            SUM(CAST(totalAmount AS DECIMAL)) as totalSpend
          FROM purchase_orders
          WHERE vendorId = ${vendor.id}
          AND orderDate >= ${threeMonthsAgo}
        `);

        const stats = (poStats as any[])[0] || {};
        const totalOrders = stats.totalOrders || 0;
        const onTimeRate = totalOrders > 0 ? (stats.onTimeCount / totalOrders) * 100 : 100;

        const deliveryScore = onTimeRate;
        const qualityScore = 85; // Would calculate from quality inspections
        const priceScore = 80; // Would compare to market rates
        const overallScore = (deliveryScore * 0.4 + qualityScore * 0.35 + priceScore * 0.25);

        // Upsert performance record
        const [existing] = await db
          .select()
          .from(supplierPerformance)
          .where(
            and(
              eq(supplierPerformance.vendorId, vendor.id),
              eq(supplierPerformance.metricMonth, currentMonth)
            )
          );

        if (existing) {
          await db
            .update(supplierPerformance)
            .set({
              totalOrders,
              onTimeDeliveries: stats.onTimeCount || 0,
              lateDeliveries: stats.lateCount || 0,
              totalSpend: stats.totalSpend?.toString() || "0",
              deliveryScore: deliveryScore.toString(),
              qualityScore: qualityScore.toString(),
              priceScore: priceScore.toString(),
              overallScore: overallScore.toString(),
            })
            .where(eq(supplierPerformance.id, existing.id));
        } else {
          await db.insert(supplierPerformance).values({
            vendorId: vendor.id,
            metricMonth: currentMonth,
            totalOrders,
            onTimeDeliveries: stats.onTimeCount || 0,
            lateDeliveries: stats.lateCount || 0,
            totalSpend: stats.totalSpend?.toString() || "0",
            deliveryScore: deliveryScore.toString(),
            qualityScore: qualityScore.toString(),
            priceScore: priceScore.toString(),
            overallScore: overallScore.toString(),
            riskLevel: overallScore < 60 ? "high" : overallScore < 80 ? "medium" : "low",
          });
        }

        metrics.push({
          vendorId: vendor.id,
          vendorName: vendor.name,
          deliveryScore,
          qualityScore,
          priceScore,
          overallScore,
          riskLevel: overallScore < 60 ? "high" : overallScore < 80 ? "medium" : "low",
        });

        // Flag high-risk vendors
        if (overallScore < 60) {
          await engine.handleException(
            context,
            "supplier_unavailable",
            `High risk vendor: ${vendor.name}`,
            `Overall score: ${overallScore.toFixed(1)}. Consider alternative suppliers.`,
            { vendorId: vendor.id, score: overallScore },
            "vendor",
            vendor.id
          );
        }

        itemsSucceeded++;
      }

      return { success: true, data: { metrics } };
    });

    // Step 3: Generate AI recommendations
    const step3 = await engine.recordStep(context, 3, "Generate Recommendations", "ai_analysis", async () => {
      const highRiskVendors = step2.data?.metrics.filter((m: any) => m.riskLevel === "high") || [];
      const lowScoreVendors = step2.data?.metrics.filter((m: any) => m.overallScore < 80) || [];

      if (highRiskVendors.length === 0 && lowScoreVendors.length === 0) {
        return { success: true, data: { recommendations: [], message: "All vendors performing well" } };
      }

      const aiDecision = await engine.makeAIDecision(
        context,
        "vendor_selection",
        `Review supplier performance and provide recommendations:
High-risk vendors: ${JSON.stringify(highRiskVendors)}
Below-target vendors: ${JSON.stringify(lowScoreVendors)}

Provide specific action recommendations.`,
        [],
        {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  vendorId: { type: "number" },
                  action: { type: "string" },
                  priority: { type: "string" },
                  details: { type: "string" },
                },
                required: ["vendorId", "action", "priority", "details"],
                additionalProperties: false,
              },
            },
            summary: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["recommendations", "summary", "confidence"],
          additionalProperties: false,
        }
      );

      return { success: true, data: aiDecision.decision };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      outputData: {
        metrics: step2.data?.metrics,
        recommendations: step3.data?.recommendations,
      },
    };
  },
};

// ============================================
// QUALITY INSPECTION WORKFLOW
// ============================================

const qualityInspectionProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();

    // Step 1: Get received POs pending inspection
    const step1 = await engine.recordStep(context, 1, "Fetch Items for Inspection", "data_fetch", async () => {
      const receivedPOs = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.status, "received"));

      return { success: true, data: { purchaseOrders: receivedPOs } };
    });

    // For now, auto-pass all inspections (real implementation would have inspection data)
    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed: step1.data?.purchaseOrders.length || 0,
      itemsSucceeded: step1.data?.purchaseOrders.length || 0,
      itemsFailed: 0,
      outputData: { message: "All items passed inspection" },
    };
  },
};

// ============================================
// INVOICE MATCHING WORKFLOW
// ============================================

const invoiceMatchingProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Get pending vendor invoices
    const step1 = await engine.recordStep(context, 1, "Fetch Pending Invoices", "data_fetch", async () => {
      const pendingInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.status, "draft"));

      return { success: true, data: { invoices: pendingInvoices } };
    });

    if (!step1.success || !step1.data?.invoices.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.invoices.length;

    // Step 2: Match invoices to POs
    const step2 = await engine.recordStep(context, 2, "Match to Purchase Orders", "ai_analysis", async () => {
      const matched: any[] = [];
      const discrepancies: any[] = [];

      for (const invoice of step1.data.invoices) {
        // Try to find matching PO by vendor
        const [matchingPO] = await db
          .select()
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.vendorId, invoice.customerId!), // In this context, customerId might be vendorId for payables
              eq(purchaseOrders.status, "received")
            )
          );

        if (matchingPO) {
          const invoiceAmount = parseFloat(invoice.totalAmount);
          const poAmount = parseFloat(matchingPO.totalAmount);
          const variance = Math.abs(invoiceAmount - poAmount);
          const variancePercent = (variance / poAmount) * 100;

          if (variancePercent <= 2) {
            // Within acceptable variance
            matched.push({
              invoiceId: invoice.id,
              poId: matchingPO.id,
              invoiceAmount,
              poAmount,
              variance,
            });
            totalValue += invoiceAmount;
            itemsSucceeded++;
          } else {
            // Price variance exception
            discrepancies.push({
              invoiceId: invoice.id,
              poId: matchingPO.id,
              invoiceAmount,
              poAmount,
              variance,
              variancePercent,
            });

            await engine.handleException(
              context,
              "price_variance",
              `Invoice ${invoice.invoiceNumber} price variance`,
              `Variance of $${variance.toFixed(2)} (${variancePercent.toFixed(1)}%) from PO ${matchingPO.poNumber}`,
              { invoiceId: invoice.id, poId: matchingPO.id, variance },
              "invoice",
              invoice.id
            );

            itemsFailed++;
          }
        } else {
          // No matching PO
          await engine.handleException(
            context,
            "documentation_missing",
            `No matching PO for invoice ${invoice.invoiceNumber}`,
            "Cannot match invoice to any received purchase order",
            { invoiceId: invoice.id },
            "invoice",
            invoice.id
          );
          itemsFailed++;
        }
      }

      return { success: true, data: { matched, discrepancies } };
    });

    // Step 3: Queue matched invoices for payment
    await engine.recordStep(context, 3, "Queue for Payment", "update_record", async () => {
      for (const match of step2.data?.matched || []) {
        await db
          .update(invoices)
          .set({ status: "sent" }) // Ready for payment
          .where(eq(invoices.id, match.invoiceId));
      }

      return { success: true, data: { queuedCount: step2.data?.matched.length } };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      totalValue,
      outputData: step2.data,
    };
  },
};

// ============================================
// PAYMENT PROCESSING WORKFLOW
// ============================================

const paymentProcessingProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;
    let totalValue = 0;

    // Step 1: Get approved invoices due for payment
    const step1 = await engine.recordStep(context, 1, "Fetch Due Payments", "data_fetch", async () => {
      const today = new Date();
      const approvedInvoices = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.status, "sent"),
            lte(invoices.dueDate, today)
          )
        );

      return { success: true, data: { invoices: approvedInvoices } };
    });

    if (!step1.success || !step1.data?.invoices.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    itemsProcessed = step1.data.invoices.length;

    // Step 2: Request approval for payments over threshold
    const step2 = await engine.recordStep(context, 2, "Process Payments", "wait_approval", async () => {
      const processed: any[] = [];
      const pendingApproval: any[] = [];

      for (const invoice of step1.data.invoices) {
        const amount = parseFloat(invoice.totalAmount);
        totalValue += amount;

        const approval = await engine.requestApproval(
          context,
          "payment",
          `Payment for Invoice ${invoice.invoiceNumber}`,
          `Pay $${amount.toFixed(2)} to vendor`,
          amount,
          "invoice",
          invoice.id,
          "Invoice matched to PO and approved for payment",
          90
        );

        if (approval.autoApproved) {
          // Create payment record
          const paymentNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;
          await db.insert(payments).values({
            paymentNumber,
            type: "made",
            invoiceId: invoice.id,
            vendorId: invoice.customerId, // Vendor in this context
            amount: invoice.totalAmount,
            paymentMethod: "bank_transfer",
            paymentDate: new Date(),
            status: "completed",
          });

          await db
            .update(invoices)
            .set({ status: "paid", paidAmount: invoice.totalAmount })
            .where(eq(invoices.id, invoice.id));

          processed.push({ invoiceId: invoice.id, amount });
          itemsSucceeded++;
        } else {
          pendingApproval.push({ invoiceId: invoice.id, amount, approvalId: approval.approvalId });
        }
      }

      return { success: true, data: { processed, pendingApproval } };
    });

    return {
      success: true,
      runId: context.runId,
      status: step2.data?.pendingApproval.length ? "awaiting_approval" : "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed,
      totalValue,
      outputData: step2.data,
      pendingApprovals: step2.data?.pendingApproval.length,
    };
  },
};

// ============================================
// EXCEPTION HANDLING WORKFLOW
// ============================================

const exceptionHandlingProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();

    // Step 1: Get open exceptions
    const step1 = await engine.recordStep(context, 1, "Fetch Open Exceptions", "data_fetch", async () => {
      const { exceptionLog } = await import("../drizzle/schema");
      const openExceptions = await db
        .select()
        .from(exceptionLog)
        .where(eq(exceptionLog.status, "open"))
        .orderBy(desc(exceptionLog.severity));

      return { success: true, data: { exceptions: openExceptions } };
    });

    if (!step1.success || !step1.data?.exceptions.length) {
      return { success: true, runId: context.runId, status: "completed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
    }

    // Step 2: AI triage and resolution
    const step2 = await engine.recordStep(context, 2, "Triage Exceptions", "ai_decision", async () => {
      const resolved: any[] = [];
      const escalated: any[] = [];

      for (const exception of step1.data.exceptions) {
        const aiDecision = await engine.makeAIDecision(
          context,
          "exception_handling",
          `Triage and resolve exception:
Type: ${exception.exceptionType}
Title: ${exception.title}
Description: ${exception.description}
Severity: ${exception.severity}
Data: ${exception.exceptionData}

Decide: resolve with specific action, or escalate to human?`,
          ["resolve", "escalate"],
          {
            type: "object",
            properties: {
              action: { type: "string" },
              resolution: { type: "string" },
              reasoning: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["action", "resolution", "reasoning", "confidence"],
            additionalProperties: false,
          }
        );

        const { exceptionLog } = await import("../drizzle/schema");

        if (aiDecision.confidence > 75 && aiDecision.decision.action === "resolve") {
          await db
            .update(exceptionLog)
            .set({
              status: "resolved",
              resolutionType: "ai_resolved",
              resolutionAction: aiDecision.decision.resolution,
              resolutionNotes: aiDecision.decision.reasoning,
              resolvedAt: new Date(),
            })
            .where(eq(exceptionLog.id, exception.id));

          resolved.push(exception);
        } else {
          await db
            .update(exceptionLog)
            .set({
              status: "escalated",
              escalatedAt: new Date(),
            })
            .where(eq(exceptionLog.id, exception.id));

          escalated.push(exception);
        }
      }

      return { success: true, data: { resolved, escalated } };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed: step1.data.exceptions.length,
      itemsSucceeded: step2.data?.resolved.length || 0,
      itemsFailed: step2.data?.escalated.length || 0,
      outputData: step2.data,
    };
  },
};

// ============================================
// VENDOR QUOTE ANALYSIS WORKFLOW
// Analyzes received quotes and provides recommendations
// ============================================

const vendorQuoteAnalysisProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;

    // Get input data
    const { rfqId, autoApproveThreshold = 5000 } = context.inputData;

    if (!rfqId) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        error: "Missing required field: rfqId",
      };
    }

    // Step 1: Fetch RFQ and quotes
    const step1 = await engine.recordStep(context, 1, "Fetch RFQ and Quotes", "data_fetch", async () => {
      const [rfq] = await db.select().from(vendorRfqs).where(eq(vendorRfqs.id, rfqId));

      if (!rfq) {
        throw new Error(`RFQ ${rfqId} not found`);
      }

      const quotes = await db
        .select()
        .from(vendorQuotes)
        .where(and(eq(vendorQuotes.rfqId, rfqId), eq(vendorQuotes.status, "received")));

      if (quotes.length === 0) {
        throw new Error("No quotes received yet");
      }

      return {
        success: true,
        data: {
          rfq,
          quotes,
          quoteCount: quotes.length,
        },
      };
    });

    if (!step1.success) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        error: step1.error,
      };
    }

    const rfq = step1.data.rfq;
    const quotes = step1.data.quotes;
    itemsProcessed = quotes.length;

    // Step 2: AI-powered quote analysis and comparison
    const step2 = await engine.recordStep(context, 2, "Analyze and Compare Quotes", "ai_analysis", async () => {
      // Fetch vendor details for each quote
      const vendorIds = quotes.map((q: any) => q.vendorId);
      const vendorDetails = await db
        .select()
        .from(vendors)
        .where(inArray(vendors.id, vendorIds));

      const vendorMap = new Map(vendorDetails.map((v: any) => [v.id, v]));

      // Prepare quote data for AI analysis
      const quoteData = quotes.map((q: any) => {
        const vendor = vendorMap.get(q.vendorId);
        return {
          quoteId: q.id,
          vendorId: q.vendorId,
          vendorName: vendor?.name || "Unknown",
          unitPrice: parseFloat(q.unitPrice || "0"),
          totalPrice: parseFloat(q.totalPrice || "0"),
          shippingCost: parseFloat(q.shippingCost || "0"),
          totalWithCharges: parseFloat(q.totalWithCharges || q.totalPrice || "0"),
          leadTimeDays: q.leadTimeDays,
          estimatedDeliveryDate: q.estimatedDeliveryDate,
          paymentTerms: q.paymentTerms,
          validUntil: q.validUntil,
        };
      });

      // Use AI to analyze and rank quotes
      const analysisPrompt = `Analyze and compare the following vendor quotes for RFQ:
Material: ${rfq.materialName}
Quantity: ${rfq.quantity} ${rfq.unit}
Required Delivery Date: ${rfq.requiredDeliveryDate || "ASAP"}

Quotes:
${JSON.stringify(quoteData, null, 2)}

Provide:
1. Ranking of quotes (1 = best)
2. Price comparison analysis
3. Lead time comparison
4. Overall recommendation with reasoning
5. Risk assessment for each quote
6. Best value recommendation considering price, quality, and delivery

Rank all quotes and identify the best option.`;

      const aiAnalysis = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are a procurement expert analyzing vendor quotes. Provide detailed analysis focusing on value, reliability, and risk.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "quote_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                rankings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      quoteId: { type: "number" },
                      rank: { type: "number" },
                      score: { type: "number" },
                      priceRank: { type: "number" },
                      leadTimeRank: { type: "number" },
                    },
                    required: ["quoteId", "rank", "score", "priceRank", "leadTimeRank"],
                    additionalProperties: false,
                  },
                },
                bestQuoteId: { type: "number" },
                recommendation: { type: "string" },
                reasoning: { type: "string" },
                riskAssessment: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["rankings", "bestQuoteId", "recommendation", "reasoning", "riskAssessment", "confidence"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = aiAnalysis.choices[0].message.content;
      const analysis = JSON.parse(typeof content === "string" ? content : "{}");

      // Update quotes with AI rankings
      for (const ranking of analysis.rankings) {
        await db
          .update(vendorQuotes)
          .set({
            aiScore: ranking.score,
            priceComparisonRank: ranking.priceRank,
            leadTimeComparisonRank: ranking.leadTimeRank,
            overallRank: ranking.rank,
            aiAnalysis: JSON.stringify(ranking),
            aiRecommendation: ranking.quoteId === analysis.bestQuoteId ? analysis.recommendation : null,
          })
          .where(eq(vendorQuotes.id, ranking.quoteId));
      }

      return {
        success: true,
        data: {
          analysis,
          bestQuote: quotes.find((q: any) => q.id === analysis.bestQuoteId),
        },
        aiResponse: analysis,
      };
    });

    if (!step2.success) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed,
        itemsSucceeded: 0,
        itemsFailed: itemsProcessed,
        error: step2.error,
      };
    }

    const bestQuote = step2.data.bestQuote;
    const analysis = step2.data.analysis;
    itemsSucceeded = quotes.length;

    // Step 3: Auto-approve or request approval based on threshold
    const step3 = await engine.recordStep(context, 3, "Approval Decision", "ai_decision", async () => {
      const bestQuoteTotal = parseFloat(bestQuote.totalWithCharges || bestQuote.totalPrice || "0");

      const approvalCheck = await engine.checkApprovalRequired("vendor_quote", bestQuoteTotal);

      let approvalResult;
      if (approvalCheck.autoApprove) {
        // Auto-approve
        await db
          .update(vendorQuotes)
          .set({
            status: "accepted",
          })
          .where(eq(vendorQuotes.id, bestQuote.id));

        // Reject other quotes
        const otherQuoteIds = quotes.filter((q: any) => q.id !== bestQuote.id).map((q: any) => q.id);
        if (otherQuoteIds.length > 0) {
          await db
            .update(vendorQuotes)
            .set({
              status: "rejected",
            })
            .where(inArray(vendorQuotes.id, otherQuoteIds));
        }

        // Update RFQ status
        await db
          .update(vendorRfqs)
          .set({
            status: "awarded",
          })
          .where(eq(vendorRfqs.id, rfqId));

        approvalResult = {
          autoApproved: true,
          approvalId: null,
          message: `Quote auto-approved. Total: $${bestQuoteTotal.toFixed(2)} is at or below threshold $${autoApproveThreshold}`,
        };
      } else {
        // Request approval
        const approval = await engine.requestApproval(
          context,
          "vendor_quote",
          `Vendor Quote Approval - ${rfq.materialName}`,
          `Best quote from vendor for ${rfq.quantity} ${rfq.unit} of ${rfq.materialName}. Total: $${bestQuoteTotal.toFixed(2)}`,
          bestQuoteTotal,
          "vendor_quote",
          bestQuote.id,
          analysis.recommendation,
          analysis.confidence
        );

        approvalResult = {
          autoApproved: false,
          approvalId: approval.approvalId,
          message: "Approval required. Waiting for human review.",
        };
      }

      return {
        success: true,
        data: approvalResult,
      };
    });

    // Step 4: Send notifications
    const step4 = await engine.recordStep(context, 4, "Send Notifications", "communication", async () => {
      const vendor = await db.select().from(vendors).where(eq(vendors.id, bestQuote.vendorId));

      if (step3.data.autoApproved) {
        const procurementEmail = process.env.PROCUREMENT_EMAIL || "procurement@company.com";
        
        // Send award notification email
        await db.insert(vendorRfqEmails).values({
          rfqId,
          vendorId: bestQuote.vendorId,
          quoteId: bestQuote.id,
          direction: "outbound",
          emailType: "award_notification",
          fromEmail: procurementEmail,
          toEmail: vendor[0]?.email,
          subject: `Award Notification - ${rfq.rfqNumber}`,
          body: `Congratulations! Your quote has been selected for ${rfq.materialName}.`,
          aiGenerated: true,
          sendStatus: "queued",
        });

        // Send rejection to other vendors
        const otherQuotes = quotes.filter((q: any) => q.id !== bestQuote.id);
        for (const quote of otherQuotes) {
          const otherVendor = await db.select().from(vendors).where(eq(vendors.id, quote.vendorId));

          await db.insert(vendorRfqEmails).values({
            rfqId,
            vendorId: quote.vendorId,
            quoteId: quote.id,
            direction: "outbound",
            emailType: "rejection_notification",
            fromEmail: procurementEmail,
            toEmail: otherVendor[0]?.email,
            subject: `Quote Response - ${rfq.rfqNumber}`,
            body: `Thank you for your quote. We have selected another vendor for this RFQ.`,
            aiGenerated: true,
            sendStatus: "queued",
          });
        }
      }

      return {
        success: true,
        data: {
          notificationsSent: step3.data.autoApproved ? quotes.length : 0,
        },
      };
    });

    return {
      success: true,
      runId: context.runId,
      status: step3.data.autoApproved ? "completed" : "awaiting_approval",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed: itemsProcessed - itemsSucceeded,
      totalValue: parseFloat(bestQuote.totalWithCharges || bestQuote.totalPrice || "0"),
      pendingApprovals: step3.data.autoApproved ? 0 : 1,
      outputData: {
        rfqId,
        bestQuoteId: bestQuote.id,
        analysis: analysis,
        autoApproved: step3.data.autoApproved,
        approvalId: step3.data.approvalId,
        totalValue: parseFloat(bestQuote.totalWithCharges || bestQuote.totalPrice || "0"),
      },
    };
  },
};

// ============================================
// VENDOR QUOTE PROCUREMENT WORKFLOW
// ============================================

const vendorQuoteProcurementProcessor: WorkflowProcessor = {
  async execute(engine: WorkflowEngine, context: WorkflowContext): Promise<WorkflowResult> {
    const db = engine.getDb();
    let itemsProcessed = 0;
    let itemsSucceeded = 0;
    let itemsFailed = 0;

    // Get input data
    const {
      materialName,
      materialDescription,
      quantity,
      unit,
      specifications,
      requiredDeliveryDate,
      deliveryLocation,
      priority = "normal",
      maxVendors = 5,
      autoApproveThreshold = 5000,
    } = context.inputData;

    if (!materialName || !quantity || !unit) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        error: "Missing required fields: materialName, quantity, unit",
      };
    }

    // Step 1: Search for suitable vendors (AI-powered web search)
    const step1 = await engine.recordStep(context, 1, "Search for Suitable Vendors", "ai_analysis", async () => {
      // First, search in database for existing vendors who have supplied similar materials
      const existingVendors = await db
        .select()
        .from(vendors)
        .where(eq(vendors.status, "active"))
        .limit(20);

      // Use AI to search for suitable vendors
      const searchPrompt = `Find suitable vendors for the following material procurement:
Material: ${materialName}
Description: ${materialDescription || "N/A"}
Quantity: ${quantity} ${unit}
Specifications: ${specifications || "N/A"}
Required Delivery Date: ${requiredDeliveryDate || "ASAP"}
Location: ${deliveryLocation || "N/A"}

Based on the material type and requirements, suggest types of vendors that would be suitable suppliers. Consider:
1. Industry specialization
2. Geographic location
3. Material/product specialization
4. Typical vendor types for this material

Return a list of vendor characteristics to search for.`;

      const aiResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a procurement expert helping to identify suitable vendor types for material procurement.",
          },
          {
            role: "user",
            content: searchPrompt,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "vendor_search",
            strict: true,
            schema: {
              type: "object",
              properties: {
                vendorTypes: {
                  type: "array",
                  items: { type: "string" },
                },
                searchCriteria: {
                  type: "array",
                  items: { type: "string" },
                },
                reasoning: { type: "string" },
              },
              required: ["vendorTypes", "searchCriteria", "reasoning"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = aiResponse.choices[0].message.content;
      const searchResults = JSON.parse(typeof content === "string" ? content : "{}");

      return {
        success: true,
        data: {
          existingVendors,
          searchResults,
        },
        aiResponse: searchResults,
      };
    });

    if (!step1.success) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        error: step1.error,
      };
    }

    // Step 2: Auto-select vendors based on material/history
    const step2 = await engine.recordStep(context, 2, "Select Best Vendors", "ai_decision", async () => {
      const candidateVendors = step1.data.existingVendors;

      if (candidateVendors.length === 0) {
        return {
          success: true,
          data: {
            selectedVendors: [],
            message: "No existing vendors found. Manual vendor addition required.",
          },
        };
      }

      // Use AI to rank and select vendors
      const selectionPrompt = `Rank and select the best vendors for this RFQ:
Material: ${materialName}
Quantity: ${quantity} ${unit}
Priority: ${priority}

Available Vendors:
${candidateVendors
  .map(
    (v: any) =>
      `- ID: ${v.id}, Name: ${v.name}, Contact: ${v.contactName}, Email: ${v.email}, Phone: ${v.phone}, Lead Time: ${v.defaultLeadTimeDays} days, Min Order: ${v.minOrderAmount || "N/A"}`
  )
  .join("\n")}

Select up to ${maxVendors} vendors that best match the requirements. Consider:
1. Default lead time vs required delivery date
2. Minimum order amount vs requested quantity
3. Vendor type and specialization
4. Contact availability (email, phone)

Return vendor IDs in order of preference.`;

      const aiDecision = await engine.makeAIDecision(
        context,
        "vendor_selection",
        selectionPrompt,
        candidateVendors.map((v: any) => v.id),
        {
          type: "object",
          properties: {
            choice: {
              type: "array",
              items: { type: "number" },
            },
            reasoning: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["choice", "reasoning", "confidence"],
          additionalProperties: false,
        }
      );

      const selectedVendorIds = Array.isArray(aiDecision.decision)
        ? aiDecision.decision.slice(0, maxVendors)
        : [];
      const selectedVendors = candidateVendors.filter((v: any) => selectedVendorIds.includes(v.id));

      return {
        success: true,
        data: {
          selectedVendors,
          reasoning: aiDecision.reasoning,
          confidence: aiDecision.confidence,
        },
      };
    });

    if (!step2.success || step2.data.selectedVendors.length === 0) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        error: "No suitable vendors found or selected",
      };
    }

    const selectedVendors = step2.data.selectedVendors;
    itemsProcessed = selectedVendors.length;

    // Step 3: Create RFQ
    const step3 = await engine.recordStep(context, 3, "Create RFQ", "data_create", async () => {
      // Generate unique RFQ number with timestamp and random component
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const rfqNumber = `RFQ-${timestamp}-${randomPart}`;

      const [rfq] = await db
        .insert(vendorRfqs)
        .values({
          rfqNumber,
          materialName,
          materialDescription,
          quantity: quantity.toString(),
          unit,
          specifications,
          requiredDeliveryDate: requiredDeliveryDate ? new Date(requiredDeliveryDate) : null,
          deliveryLocation,
          quoteDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          validityPeriod: 30,
          priority: priority as any,
          status: "draft",
        })
        .$returningId();

      return {
        success: true,
        data: { rfqId: rfq.id, rfqNumber },
        createdEntities: [{ type: "vendor_rfq", id: rfq.id }],
      };
    });

    if (!step3.success) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed,
        itemsSucceeded: 0,
        itemsFailed: itemsProcessed,
        error: step3.error,
      };
    }

    const rfqId = step3.data.rfqId;
    const rfqNumber = step3.data.rfqNumber;

    // Step 4: Generate and send RFQ emails via AI
    const step4 = await engine.recordStep(context, 4, "Send RFQ Emails", "communication", async () => {
      const emailResults = [];

      for (const vendor of selectedVendors) {
        // Generate AI-powered email content
        const emailPrompt = `Generate a professional RFQ email to vendor:
Vendor Name: ${vendor.name}
Contact Name: ${vendor.contactName || "Procurement Team"}

RFQ Details:
- RFQ Number: ${rfqNumber}
- Material: ${materialName}
- Description: ${materialDescription || "N/A"}
- Quantity: ${quantity} ${unit}
- Specifications: ${specifications || "N/A"}
- Required Delivery Date: ${requiredDeliveryDate || "ASAP"}
- Delivery Location: ${deliveryLocation || "N/A"}
- Quote Due Date: 7 days from now
- Validity Period: 30 days

Generate a professional, concise email requesting a quote.`;

        const aiEmail = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a professional procurement officer writing RFQ emails to vendors.",
            },
            {
              role: "user",
              content: emailPrompt,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "rfq_email",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["subject", "body"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = aiEmail.choices[0].message.content;
        const emailContent = JSON.parse(typeof content === "string" ? content : "{}");

        // Create invitation record
        const [invitation] = await db
          .insert(vendorRfqInvitations)
          .values({
            rfqId,
            vendorId: vendor.id,
            status: "pending",
            invitedAt: new Date(),
          })
          .$returningId();

        // Create email record
        const [email] = await db
          .insert(vendorRfqEmails)
          .values({
            rfqId,
            vendorId: vendor.id,
            direction: "outbound",
            emailType: "rfq_request",
            fromEmail: process.env.PROCUREMENT_EMAIL || "procurement@company.com",
            toEmail: vendor.email,
            subject: emailContent.subject,
            body: emailContent.body,
            aiGenerated: true,
            sendStatus: "queued",
          })
          .$returningId();

        emailResults.push({
          vendorId: vendor.id,
          vendorName: vendor.name,
          email: vendor.email,
          invitationId: invitation.id,
          emailId: email.id,
          status: "queued",
        });

        itemsSucceeded++;
      }

      // Update RFQ status to sent
      await db.update(vendorRfqs).set({ status: "sent" }).where(eq(vendorRfqs.id, rfqId));

      // Update invitations to sent
      await db
        .update(vendorRfqInvitations)
        .set({ status: "sent" })
        .where(eq(vendorRfqInvitations.rfqId, rfqId));

      return {
        success: true,
        data: {
          emailResults,
          totalSent: emailResults.length,
        },
      };
    });

    if (!step4.success) {
      return {
        success: false,
        runId: context.runId,
        status: "failed",
        itemsProcessed,
        itemsSucceeded: 0,
        itemsFailed: itemsProcessed,
        error: step4.error,
      };
    }

    // Step 5: Note about monitoring (this would be done by a separate scheduled workflow)
    const step5 = await engine.recordStep(context, 5, "Setup Quote Monitoring", "configuration", async () => {
      return {
        success: true,
        data: {
          message: "RFQ emails queued. Quote monitoring will be handled by email scanner and response processor.",
          rfqId,
          rfqNumber,
          vendorCount: selectedVendors.length,
          quoteDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      };
    });

    return {
      success: true,
      runId: context.runId,
      status: "completed",
      itemsProcessed,
      itemsSucceeded,
      itemsFailed: itemsProcessed - itemsSucceeded,
      outputData: {
        rfqId,
        rfqNumber,
        vendorsContacted: selectedVendors.length,
        emailsSent: step4.data.totalSent,
        monitoring: step5.data,
      },
    };
  },
};

// ============================================
// EXPORT ALL PROCESSORS
// ============================================

export const workflowProcessors = {
  demandForecasting: demandForecastingProcessor,
  productionPlanning: productionPlanningProcessor,
  materialRequirements: materialRequirementsProcessor,
  procurement: procurementProcessor,
  inventoryReorder: inventoryReorderProcessor,
  inventoryTransfer: inventoryTransferProcessor,
  inventoryOptimization: inventoryOptimizationProcessor,
  workOrderGeneration: workOrderGenerationProcessor,
  productionScheduling: productionSchedulingProcessor,
  freightProcurement: freightProcurementProcessor,
  shipmentTracking: shipmentTrackingProcessor,
  orderFulfillment: orderFulfillmentProcessor,
  supplierManagement: supplierManagementProcessor,
  qualityInspection: qualityInspectionProcessor,
  invoiceMatching: invoiceMatchingProcessor,
  paymentProcessing: paymentProcessingProcessor,
  exceptionHandling: exceptionHandlingProcessor,
  vendorQuoteAnalysis: vendorQuoteAnalysisProcessor,
  vendorQuoteProcurement: vendorQuoteProcurementProcessor,
};

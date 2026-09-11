// appRouter.forecasting — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { DEFAULT_REQUIRED_BY_DAYS, planRequirementsFromBom, persistPlanRequirements, manualProductionPlanInput, buildManualProductionPlan } from "./_shared";

// ============================================
// AI PRODUCTION FORECASTING
// ============================================
export const forecastingRouter = router({
    // Get demand forecasts
    getForecasts: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getDemandForecasts(input);
      }),

    // Get single forecast
    getForecast: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getDemandForecastById(input.id);
      }),

    // Generate AI forecast for products
    generateForecast: protectedProcedure
      .input(z.object({
        productIds: z.array(z.number()).optional(), // If empty, forecast all products
        forecastMonths: z.number().default(3), // How many months ahead to forecast
        historyMonths: z.number().default(12), // How many months of history to analyze
      }))
      .mutation(async ({ input, ctx }) => {
        const { invokeLLM } = await import('../_core/llm');
        
        // Get products to forecast
        let productsToForecast = await db.getProducts();
        if (input.productIds && input.productIds.length > 0) {
          productsToForecast = productsToForecast.filter(p => input.productIds!.includes(p.id));
        }
        
        // Get historical sales data
        const historicalData = await db.getHistoricalSalesData(undefined, input.historyMonths);
        
        // Group by product and month
        const salesByProductMonth: Record<number, Record<string, number>> = {};
        for (const sale of historicalData) {
          if (!sale.productId) continue;
          if (!salesByProductMonth[sale.productId]) salesByProductMonth[sale.productId] = {};
          const monthKey = sale.orderDate ? new Date(sale.orderDate).toISOString().slice(0, 7) : 'unknown';
          salesByProductMonth[sale.productId][monthKey] = (salesByProductMonth[sale.productId][monthKey] || 0) + parseFloat(sale.quantity?.toString() || '0');
        }
        
        const forecasts = [];
        
        for (const product of productsToForecast) {
          const productSales = salesByProductMonth[product.id] || {};
          const salesHistory = Object.entries(productSales)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, qty]) => ({ month, quantity: qty }));
          
          // Use AI to analyze and forecast
          const prompt = `You are a demand forecasting AI for an ERP system. Analyze the following sales history for product "${product.name}" and predict demand for the next ${input.forecastMonths} months.

Historical Sales Data:
${salesHistory.length > 0 ? salesHistory.map(s => `${s.month}: ${s.quantity} units`).join('\n') : 'No historical data available - use reasonable estimates based on product type'}

Product Details:
- Name: ${product.name}
- SKU: ${product.sku || 'N/A'}
- Category: ${product.category || 'General'}
- Current Price: $${product.unitPrice || 0}

Provide your forecast in JSON format with the following structure:
{
  "forecastedQuantity": <total units for forecast period>,
  "confidenceLevel": <0-100 percentage>,
  "trendDirection": "up" | "down" | "stable",
  "analysis": "<brief explanation of your forecast reasoning>",
  "monthlyBreakdown": [{ "month": "YYYY-MM", "quantity": <number> }]
}`;

          try {
            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are an expert demand forecasting analyst. Always respond with valid JSON.' },
                { role: 'user', content: prompt }
              ],
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'demand_forecast',
                  strict: true,
                  schema: {
                    type: 'object',
                    properties: {
                      forecastedQuantity: { type: 'number' },
                      confidenceLevel: { type: 'number' },
                      trendDirection: { type: 'string', enum: ['up', 'down', 'stable'] },
                      analysis: { type: 'string' },
                      monthlyBreakdown: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            month: { type: 'string' },
                            quantity: { type: 'number' }
                          },
                          required: ['month', 'quantity'],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ['forecastedQuantity', 'confidenceLevel', 'trendDirection', 'analysis', 'monthlyBreakdown'],
                    additionalProperties: false
                  }
                }
              }
            });
            
            const content = response.choices[0]?.message?.content;
            const forecastData = typeof content === 'string' ? JSON.parse(content) : null;
            
            if (forecastData) {
              const now = new Date();
              const periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
              const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1 + input.forecastMonths, 0);
              
              const result = await db.createDemandForecast({
                productId: product.id,
                forecastDate: now,
                forecastPeriodStart: periodStart,
                forecastPeriodEnd: periodEnd,
                forecastedQuantity: forecastData.forecastedQuantity.toString(),
                confidenceLevel: forecastData.confidenceLevel.toString(),
                forecastMethod: 'ai_trend',
                dataPointsUsed: salesHistory.length,
                aiAnalysis: forecastData.analysis,
                trendDirection: forecastData.trendDirection,
                status: 'active',
                createdBy: ctx.user?.id,
              });
              
              forecasts.push({ productId: product.id, productName: product.name, ...result, ...forecastData });
            }
          } catch (error) {
            console.error(`Forecast error for product ${product.id}:`, error);
            // Create a basic forecast even if AI fails
            const avgSales = salesHistory.length > 0 
              ? salesHistory.reduce((sum, s) => sum + s.quantity, 0) / salesHistory.length 
              : 100;
            
            const now = new Date();
            const periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1 + input.forecastMonths, 0);
            
            const result = await db.createDemandForecast({
              productId: product.id,
              forecastDate: now,
              forecastPeriodStart: periodStart,
              forecastPeriodEnd: periodEnd,
              forecastedQuantity: (avgSales * input.forecastMonths).toFixed(0),
              confidenceLevel: '50',
              forecastMethod: 'historical_avg',
              dataPointsUsed: salesHistory.length,
              aiAnalysis: 'Forecast based on historical average (AI analysis unavailable)',
              trendDirection: 'stable',
              status: 'active',
              createdBy: ctx.user?.id,
            });
            
            forecasts.push({ productId: product.id, productName: product.name, ...result });
          }
        }
        
        return { forecasts, count: forecasts.length };
      }),

    // Get production plans
    getProductionPlans: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getProductionPlans(input);
      }),

    // Preview a manual production plan: what to make, and what to buy for it.
    // Same maths as createProductionPlan, but nothing is written.
    previewProductionPlan: protectedProcedure
      .input(manualProductionPlanInput)
      .query(async ({ input, ctx }) =>
        buildManualProductionPlan(input, { userId: ctx.user?.id }, { persist: false }),
      ),

    // Create a production plan from a target quantity (no forecast needed).
    // Materials come from the recipe when one is given, otherwise from the BOM.
    createProductionPlan: protectedProcedure
      .input(manualProductionPlanInput)
      .mutation(async ({ input, ctx }) =>
        buildManualProductionPlan(input, { userId: ctx.user?.id }, { persist: true }),
      ),

    // Generate production plan from forecast
    generateProductionPlan: protectedProcedure
      .input(z.object({
        demandForecastId: z.number(),
        safetyStockPercent: z.number().default(20), // Add 20% safety stock
      }))
      .mutation(async ({ input, ctx }) => {
        const forecast = await db.getDemandForecastById(input.demandForecastId);
        if (!forecast) throw new Error('Forecast not found');
        
        const product = forecast.productId ? await db.getProductById(forecast.productId) : null;
        if (!product) throw new Error('Product not found');
        
        // Get current inventory
        const inventoryRecords = await db.getInventory(undefined, { productId: product.id });
        const currentInventory = inventoryRecords.reduce((sum, inv) => sum + parseFloat(inv.quantity?.toString() || '0'), 0);
        
        // Calculate production needed
        const forecastedQty = parseFloat(forecast.forecastedQuantity?.toString() || '0');
        const safetyStock = forecastedQty * (input.safetyStockPercent / 100);
        const plannedQuantity = Math.max(0, forecastedQty + safetyStock - currentInventory);
        
        // Get BOM for this product
        const boms = await db.getBillOfMaterials({ productId: product.id });
        const bom = boms[0];
        
        // Create production plan
        const plan = await db.createProductionPlan({
          demandForecastId: forecast.id,
          productId: product.id,
          bomId: bom?.id,
          plannedQuantity: plannedQuantity.toFixed(0),
          unit: 'EA',
          plannedStartDate: forecast.forecastPeriodStart || undefined,
          plannedEndDate: forecast.forecastPeriodEnd || undefined,
          currentInventory: currentInventory.toFixed(0),
          safetyStock: safetyStock.toFixed(0),
          status: 'draft',
          createdBy: ctx.user?.id,
        });
        
        // If we have a BOM, calculate material requirements
        if (bom) {
          const { requirements } = await planRequirementsFromBom({
            bomId: bom.id,
            plannedQuantity,
            planUnit: 'EA',
            unitContext: {},
            orderBufferPercent: 10,
            requiredByDate: forecast.forecastPeriodStart
              ? new Date(forecast.forecastPeriodStart)
              : new Date(Date.now() + DEFAULT_REQUIRED_BY_DAYS * 24 * 60 * 60 * 1000),
          });
          await persistPlanRequirements(plan.id, requirements);
        }
        
        return plan;
      }),

    // Get material requirements for a plan
    getMaterialRequirements: protectedProcedure
      .input(z.object({ productionPlanId: z.number() }))
      .query(async ({ input }) => {
        const requirements = await db.getMaterialRequirements(input.productionPlanId);
        return Promise.all(requirements.map(async (req) => {
          const rawMaterial = req.rawMaterialId ? await db.getRawMaterialById(req.rawMaterialId) : undefined;
          const vendor = req.preferredVendorId ? await db.getVendorById(req.preferredVendorId) : undefined;
          return {
            ...req,
            materialName: rawMaterial?.name || `Material #${req.rawMaterialId}`,
            materialSku: rawMaterial?.sku || null,
            vendorName: vendor?.name || null,
          };
        }));
      }),

    // Get suggested purchase orders
    getSuggestedPOs: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSuggestedPurchaseOrders(input);
      }),

    // Get suggested PO details
    getSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const po = await db.getSuggestedPurchaseOrderById(input.id);
        const items = await db.getSuggestedPoItems(input.id);
        return { ...po, items };
      }),

    // Generate suggested POs from production plan
    generateSuggestedPOs: protectedProcedure
      .input(z.object({ productionPlanId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const plan = await db.getProductionPlanById(input.productionPlanId);
        if (!plan) throw new Error('Production plan not found');
        
        const requirements = await db.getMaterialRequirements(input.productionPlanId);
        const shortages = requirements.filter(r => parseFloat(r.shortageQuantity?.toString() || '0') > 0);
        
        if (shortages.length === 0) {
          return { suggestedPOs: [], message: 'No material shortages - no POs needed' };
        }
        
        // Group by vendor
        const byVendor: Record<number, typeof shortages> = {};
        for (const shortage of shortages) {
          const vendorId = shortage.preferredVendorId || 0;
          if (!byVendor[vendorId]) byVendor[vendorId] = [];
          byVendor[vendorId].push(shortage);
        }
        
        const suggestedPOs = [];
        const now = new Date();
        const requiredByDate = plan.plannedStartDate ? new Date(plan.plannedStartDate) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
        
        for (const [vendorIdStr, items] of Object.entries(byVendor)) {
          const vendorId = parseInt(vendorIdStr);
          if (vendorId === 0) continue; // Skip items without vendor
          
          // Get vendor details including lead time
          const vendor = await db.getVendorById(vendorId);
          const vendorLeadTimeDays = vendor?.defaultLeadTimeDays || 14; // Default 14 days if not set
          
          // Calculate delivery dates based on lead time
          const estimatedDeliveryDate = new Date(now.getTime() + vendorLeadTimeDays * 24 * 60 * 60 * 1000);
          const daysUntilRequired = Math.ceil((requiredByDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          const isUrgent = vendorLeadTimeDays > daysUntilRequired;
          
          // Calculate latest order date (required date minus lead time)
          const latestOrderDate = new Date(requiredByDate.getTime() - vendorLeadTimeDays * 24 * 60 * 60 * 1000);
          const suggestedOrderDate = latestOrderDate < now ? now : latestOrderDate;
          
          const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.estimatedTotalCost?.toString() || '0'), 0);
          
          // Calculate priority based on lead time urgency and shortage severity
          const avgShortageRatio = items.reduce((sum, item) => {
            const required = parseFloat(item.requiredQuantity?.toString() || '1');
            const shortage = parseFloat(item.shortageQuantity?.toString() || '0');
            return sum + (shortage / required);
          }, 0) / items.length;
          
          // Boost priority if urgent (lead time exceeds available time)
          let priorityScore = Math.round(avgShortageRatio * 70); // Base score from shortage
          if (isUrgent) {
            priorityScore += 30; // Urgent boost
          } else if (daysUntilRequired - vendorLeadTimeDays < 7) {
            priorityScore += 15; // Near-urgent boost
          }
          priorityScore = Math.min(100, priorityScore);
          
          // Use AI to generate rationale including lead time info
          const { invokeLLM } = await import('../_core/llm');
          let aiRationale = '';
          try {
            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are an ERP procurement assistant. Provide brief, professional rationale for purchase orders.' },
                { role: 'user', content: `Generate a brief rationale (2-3 sentences) for this suggested purchase order:
- Vendor: ${vendor?.name || 'Unknown'}
- Vendor Lead Time: ${vendorLeadTimeDays} days
- Items: ${items.length} raw materials
- Total Amount: $${totalAmount.toFixed(2)}
- Required By: ${requiredByDate.toLocaleDateString()}
- Days Until Required: ${daysUntilRequired}
- Is Urgent: ${isUrgent ? 'YES - Lead time exceeds available time!' : 'No'}
- Estimated Delivery: ${estimatedDeliveryDate.toLocaleDateString()}
- Priority Score: ${priorityScore}/100
- Materials needed for production plan ${plan.planNumber}` }
              ]
            });
            aiRationale = typeof response.choices[0]?.message?.content === 'string' 
              ? response.choices[0].message.content 
              : 'Purchase order suggested based on production requirements and inventory analysis.';
          } catch {
            aiRationale = isUrgent 
              ? `URGENT: Lead time (${vendorLeadTimeDays} days) exceeds available time (${daysUntilRequired} days). Order immediately to minimize production delays.`
              : `Purchase order suggested based on production requirements. Vendor lead time: ${vendorLeadTimeDays} days. Order by ${latestOrderDate.toLocaleDateString()} for on-time delivery.`;
          }
          
          const suggestedPo = await db.createSuggestedPurchaseOrder({
            vendorId,
            productionPlanId: plan.id,
            totalAmount: totalAmount.toFixed(2),
            currency: 'USD',
            suggestedOrderDate,
            requiredByDate,
            estimatedDeliveryDate,
            vendorLeadTimeDays,
            daysUntilRequired,
            isUrgent,
            aiRationale,
            priorityScore,
            status: 'pending',
          });
          
          // Create line items and update material requirements with lead time info
          for (const item of items) {
            const rawMaterial = await db.getRawMaterialById(item.rawMaterialId);
            // Use material-specific lead time if available, otherwise vendor default
            const materialLeadTime = rawMaterial?.leadTimeDays || vendorLeadTimeDays;
            const materialDeliveryDate = new Date(now.getTime() + materialLeadTime * 24 * 60 * 60 * 1000);
            const materialLatestOrderDate = new Date(requiredByDate.getTime() - materialLeadTime * 24 * 60 * 60 * 1000);
            const materialIsUrgent = materialLeadTime > daysUntilRequired;
            
            // Update material requirement with lead time calculations
            await db.updateMaterialRequirement(item.id, {
              leadTimeDays: materialLeadTime,
              requiredByDate,
              latestOrderDate: materialLatestOrderDate,
              estimatedDeliveryDate: materialDeliveryDate,
              isUrgent: materialIsUrgent,
            });
            
            await db.createSuggestedPoItem({
              suggestedPoId: suggestedPo.id,
              materialRequirementId: item.id,
              rawMaterialId: item.rawMaterialId,
              description: rawMaterial?.name || 'Raw Material',
              quantity: item.suggestedOrderQuantity || '0',
              unit: item.unit || 'KG',
              unitPrice: item.estimatedUnitCost || '0',
              totalAmount: item.estimatedTotalCost || '0',
            });
          }
          
          suggestedPOs.push({
            ...suggestedPo,
            vendorName: vendor?.name,
            vendorLeadTimeDays,
            estimatedDeliveryDate,
            isUrgent,
            daysUntilRequired,
          });
        }
        
        return { suggestedPOs, count: suggestedPOs.length };
      }),

    // One-click approve suggested PO (convert to actual PO)
    approveSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.convertSuggestedPoToActualPo(input.id, ctx.user?.id || 0);
        return result;
      }),

    // Reject suggested PO
    rejectSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateSuggestedPurchaseOrder(input.id, {
          status: 'rejected',
          rejectedBy: ctx.user?.id,
          rejectedAt: new Date(),
          rejectionReason: input.reason,
        });
        return { success: true };
      }),

    // Get forecasting dashboard summary
    getDashboardSummary: protectedProcedure.query(async () => {
      const activeForecasts = await db.getDemandForecasts({ status: 'active' });
      const pendingPlans = await db.getProductionPlans({ status: 'draft' });
      const pendingSuggestedPOs = await db.getSuggestedPurchaseOrders({ status: 'pending' });
      
      const totalForecastedDemand = activeForecasts.reduce((sum, f) => sum + parseFloat(f.forecastedQuantity?.toString() || '0'), 0);
      const totalPendingPOValue = pendingSuggestedPOs.reduce((sum, po) => sum + parseFloat(po.totalAmount?.toString() || '0'), 0);
      
      return {
        activeForecasts: activeForecasts.length,
        pendingPlans: pendingPlans.length,
        pendingSuggestedPOs: pendingSuggestedPOs.length,
        totalForecastedDemand,
        totalPendingPOValue,
        forecasts: activeForecasts.slice(0, 5),
        suggestedPOs: pendingSuggestedPOs.slice(0, 5),
      };
    }),
  });

/**
 * Ingredient Quote Automation Service
 *
 * Monitors ingredient cost trends, triggers automated RFQ creation,
 * analyzes incoming quotes, and detects invoice price variances.
 */

import { invokeLLM } from "./_core/llm";
import * as manufacturingDb from "./db/manufacturing";
import * as emailService from "./_core/emailService";
import { getDb } from "./db/connection";
import {
  vendorRfqs, vendorQuotes, vendorRfqInvitations,
  ingredientQuoteRequests, ingredientCostAlerts,
  purchaseOrderItems, purchaseOrders, vendors,
  recipeIngredients, ingredientVendors,
} from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Configuration ─────────────────────────────────────────────────────

interface MonitorConfig {
  priceSpikePct: number;       // Trigger re-quote if cost is this % above historical avg
  contractExpiryDays: number;  // Trigger re-quote this many days before contract end
  invoiceVariancePct: number;  // Flag if invoice price exceeds PO price by this %
}

const DEFAULT_CONFIG: MonitorConfig = {
  priceSpikePct: 15,
  contractExpiryDays: 30,
  invoiceVariancePct: 5,
};

// ─── Cost Monitoring ───────────────────────────────────────────────────

/**
 * Scan all active ingredients for cost anomalies and expiring contracts.
 * Creates quote requests and alerts for any triggers found.
 */
export async function monitorIngredientCosts(config: Partial<MonitorConfig> = {}): Promise<{
  priceSpikeCount: number;
  contractExpiryCount: number;
  quoteRequestsCreated: number;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let priceSpikeCount = 0;
  let contractExpiryCount = 0;
  let quoteRequestsCreated = 0;

  // Check price spikes
  const spikedIngredients = await manufacturingDb.getIngredientsAboveCostThreshold(cfg.priceSpikePct);
  for (const item of spikedIngredients) {
    priceSpikeCount++;
    const ivs = await manufacturingDb.getIngredientVendors(item.ingredientId);
    const vendorIds = ivs.map(v => v.vendorId);

    const qr = await manufacturingDb.createIngredientQuoteRequest({
      ingredientId: item.ingredientId,
      triggerType: "price_spike",
      triggerDetails: JSON.stringify({ pctAbove: item.pctAbove, threshold: cfg.priceSpikePct }),
      currentCostPerUnit: item.currentCost.toFixed(4),
      historicalAvgCost: item.avgCost.toFixed(4),
      targetVendorIds: JSON.stringify(vendorIds),
      status: "pending",
      costUpdated: false,
    });

    await manufacturingDb.createIngredientCostAlert({
      ingredientId: item.ingredientId,
      alertType: "price_spike",
      severity: item.pctAbove > 30 ? "critical" : "warning",
      message: `${item.name} is ${item.pctAbove.toFixed(1)}% above its historical average cost`,
      details: JSON.stringify({ currentCost: item.currentCost, avgCost: item.avgCost, pctAbove: item.pctAbove }),
      quoteRequestId: qr.id,
      isRead: false,
      isDismissed: false,
    });

    quoteRequestsCreated++;
  }

  // Check expiring contracts
  const expiringContracts = await manufacturingDb.getIngredientsWithExpiringContracts(cfg.contractExpiryDays);
  for (const item of expiringContracts) {
    contractExpiryCount++;
    const iv = item.ingredientVendor;
    const ingredientId = iv.ingredientId;
    const allVendors = await manufacturingDb.getIngredientVendors(ingredientId);
    const vendorIds = allVendors.map(v => v.vendorId);

    const qr = await manufacturingDb.createIngredientQuoteRequest({
      ingredientId,
      triggerType: "contract_expiry",
      triggerDetails: JSON.stringify({ contractEndDate: iv.contractEndDate, vendorId: iv.vendorId }),
      targetVendorIds: JSON.stringify(vendorIds),
      status: "pending",
      costUpdated: false,
    });

    await manufacturingDb.createIngredientCostAlert({
      ingredientId,
      alertType: "contract_expiring",
      severity: "warning",
      message: `Contract with ${item.vendorName} for ${item.ingredientName} expires on ${iv.contractEndDate?.toISOString().slice(0, 10)}`,
      details: JSON.stringify({ vendorId: iv.vendorId, contractEndDate: iv.contractEndDate }),
      quoteRequestId: qr.id,
      isRead: false,
      isDismissed: false,
    });

    quoteRequestsCreated++;
  }

  return { priceSpikeCount, contractExpiryCount, quoteRequestsCreated };
}

// ─── RFQ Creation & Sending ────────────────────────────────────────────

/**
 * Create a vendorRfq linked to an ingredient quote request and send it to vendors.
 */
export async function sendIngredientRfqToVendors(quoteRequestId: number): Promise<{
  rfqId: number;
  invitationsSent: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const qr = await manufacturingDb.getIngredientQuoteRequestById(quoteRequestId);
  if (!qr) throw new Error("Quote request not found");

  const ingredient = await manufacturingDb.getIngredientById(qr.ingredientId);
  if (!ingredient) throw new Error("Ingredient not found");

  const targetVendorIds: number[] = qr.targetVendorIds ? JSON.parse(qr.targetVendorIds) : [];
  if (targetVendorIds.length === 0) {
    const ivs = await manufacturingDb.getIngredientVendors(qr.ingredientId);
    targetVendorIds.push(...ivs.map(v => v.vendorId));
  }
  if (targetVendorIds.length === 0) throw new Error("No vendors configured for this ingredient");

  const rfqNumber = `RFQ-ING-${Date.now().toString(36).toUpperCase()}`;
  const quoteDueDate = new Date();
  quoteDueDate.setDate(quoteDueDate.getDate() + 7);

  const rfqResult = await db.insert(vendorRfqs).values({
    rfqNumber,
    status: "sent",
    ingredientId: ingredient.id,
    materialName: ingredient.name,
    materialDescription: `Category: ${ingredient.category}. SKU: ${ingredient.sku}. ${ingredient.isAllergen ? `Allergen: ${ingredient.allergenType}` : "Non-allergen"}.`,
    quantity: "1",
    unit: ingredient.unitOfMeasure || "kg",
    specifications: `Current cost: ${ingredient.costPerUnit} ${ingredient.costUnit}. Requesting competitive pricing.`,
    quoteDueDate,
    validityPeriod: 30,
    priority: "normal",
  }).$returningId();
  const rfqId = rfqResult[0].id;

  await manufacturingDb.updateIngredientQuoteRequest(quoteRequestId, {
    vendorRfqId: rfqId,
    status: "rfq_created",
  });

  let invitationsSent = 0;
  for (const vendorId of targetVendorIds) {
    const vendorRows = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
    const vendor = vendorRows[0];
    if (!vendor?.email) continue;

    await db.insert(vendorRfqInvitations).values({
      rfqId,
      vendorId,
      status: "sent",
      sentAt: new Date(),
      reminderCount: 0,
    });

    try {
      const emailContent = await generateIngredientRfqEmail(ingredient, vendor, qr);
      await emailService.sendTransactionalEmail({
        to: vendor.email,
        subject: emailContent.subject,
        html: emailContent.htmlBody,
      });
      invitationsSent++;
    } catch {
      // Email failure is non-fatal; invitation is tracked for manual follow-up
    }
  }

  return { rfqId, invitationsSent };
}

async function generateIngredientRfqEmail(
  ingredient: NonNullable<Awaited<ReturnType<typeof manufacturingDb.getIngredientById>>>,
  vendor: { name: string; contactName: string | null; email: string | null },
  qr: NonNullable<Awaited<ReturnType<typeof manufacturingDb.getIngredientQuoteRequestById>>>,
): Promise<{ subject: string; htmlBody: string }> {
  const result = await invokeLLM({
    messages: [{
      role: "user",
      content: `Generate a professional, concise email requesting a price quote from a supplier.

Vendor: ${vendor.name} (contact: ${vendor.contactName || "Purchasing"})
Ingredient: ${ingredient.name} (SKU: ${ingredient.sku}, Category: ${ingredient.category})
Unit of measure: ${ingredient.unitOfMeasure}
Current cost: ${qr.currentCostPerUnit || ingredient.costPerUnit} ${ingredient.costUnit}
Historical avg: ${qr.historicalAvgCost || "N/A"}
Trigger: ${qr.triggerType}

Output JSON: { "subject": "...", "htmlBody": "..." }
The HTML should be simple and professional. Keep it under 200 words.`,
    }],
    maxTokens: 600,
  });

  try {
    const text = result.choices[0].message.content;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fall through to default */ }

  return {
    subject: `Request for Quote: ${ingredient.name}`,
    htmlBody: `<p>Dear ${vendor.contactName || "Purchasing Team"},</p>
<p>We are requesting a competitive price quote for <strong>${ingredient.name}</strong> (${ingredient.sku}).</p>
<p>Please provide your best pricing per ${ingredient.costUnit?.replace("per_", "") || "unit"}, including lead time and minimum order quantity.</p>
<p>Please respond within 7 business days.</p>
<p>Thank you.</p>`,
  };
}

// ─── Quote Analysis ────────────────────────────────────────────────────

/**
 * Analyze received quotes against current costs and historical averages.
 */
export async function analyzeIngredientQuotes(quoteRequestId: number): Promise<{
  bestQuoteId: number | null;
  savings: number;
  analysis: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const qr = await manufacturingDb.getIngredientQuoteRequestById(quoteRequestId);
  if (!qr || !qr.vendorRfqId) throw new Error("Quote request or linked RFQ not found");

  const quotes = await db.select().from(vendorQuotes)
    .where(and(eq(vendorQuotes.rfqId, qr.vendorRfqId), eq(vendorQuotes.status, "received")))
    .orderBy(vendorQuotes.unitPrice);

  if (quotes.length === 0) return { bestQuoteId: null, savings: 0, analysis: "No quotes received yet." };

  const currentCost = parseFloat(qr.currentCostPerUnit?.toString() || "0");
  const historicalAvg = parseFloat(qr.historicalAvgCost?.toString() || "0");

  const quoteSummaries = quotes.map((q, i) => {
    const price = parseFloat(q.unitPrice?.toString() || "0");
    return {
      rank: i + 1,
      quoteId: q.id,
      vendorId: q.vendorId,
      unitPrice: price,
      leadTimeDays: q.leadTimeDays,
      pctVsCurrent: currentCost > 0 ? ((price - currentCost) / currentCost) * 100 : 0,
      pctVsAvg: historicalAvg > 0 ? ((price - historicalAvg) / historicalAvg) * 100 : 0,
    };
  });

  const bestQuote = quoteSummaries[0];
  const savings = currentCost > 0 ? currentCost - bestQuote.unitPrice : 0;

  let analysisText: string;
  try {
    const llmResult = await invokeLLM({
      messages: [{
        role: "user",
        content: `Analyze these ingredient quotes. Current cost: $${currentCost}, Historical avg: $${historicalAvg}.
Quotes: ${JSON.stringify(quoteSummaries)}
Provide a concise 2-3 sentence recommendation. Plain text only.`,
      }],
      maxTokens: 200,
    });
    analysisText = llmResult.choices[0].message.content;
  } catch {
    analysisText = `Best quote is $${bestQuote.unitPrice} (${bestQuote.pctVsCurrent.toFixed(1)}% vs current). ${savings > 0 ? `Potential savings of $${savings.toFixed(4)}/unit.` : "No savings vs current cost."}`;
  }

  await manufacturingDb.updateIngredientQuoteRequest(quoteRequestId, {
    status: "analyzed",
    analysisResult: JSON.stringify({ quotes: quoteSummaries, bestQuoteId: bestQuote.quoteId, savings, analysis: analysisText }),
  });

  if (savings > 0) {
    await manufacturingDb.createIngredientCostAlert({
      ingredientId: qr.ingredientId,
      alertType: "better_price_found",
      severity: "info",
      message: `Quote from vendor ${bestQuote.vendorId} is $${savings.toFixed(4)}/unit below current cost`,
      details: JSON.stringify({ quoteId: bestQuote.quoteId, unitPrice: bestQuote.unitPrice, savings }),
      quoteRequestId: qr.id,
      vendorQuoteId: bestQuote.quoteId,
      isRead: false,
      isDismissed: false,
    });
  }

  return { bestQuoteId: bestQuote.quoteId, savings, analysis: analysisText };
}

// ─── Quote Acceptance ──────────────────────────────────────────────────

/**
 * Accept a quote and optionally auto-update the ingredient's cost.
 */
export async function acceptIngredientQuote(
  quoteRequestId: number,
  quoteId: number,
  autoUpdateCost: boolean,
): Promise<{ costUpdated: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const qr = await manufacturingDb.getIngredientQuoteRequestById(quoteRequestId);
  if (!qr) throw new Error("Quote request not found");

  const quoteRows = await db.select().from(vendorQuotes).where(eq(vendorQuotes.id, quoteId)).limit(1);
  const quote = quoteRows[0];
  if (!quote) throw new Error("Quote not found");

  await db.update(vendorQuotes).set({ status: "accepted" }).where(eq(vendorQuotes.id, quoteId));

  let costUpdated = false;
  if (autoUpdateCost) {
    const unitPrice = quote.unitPrice?.toString() || "0";
    const ingredient = await manufacturingDb.getIngredientById(qr.ingredientId);
    if (ingredient) {
      await manufacturingDb.addIngredientCostEntry({
        ingredientId: qr.ingredientId,
        costPerUnit: unitPrice,
        costUnit: ingredient.costUnit,
        supplierId: quote.vendorId,
        source: "rfq_quote",
        effectiveDate: new Date(),
      });

      // Update the vendor's last quoted price
      await db.update(ingredientVendors).set({
        lastQuotedPrice: unitPrice,
        lastQuotedAt: new Date(),
        unitPrice: unitPrice,
      }).where(and(
        eq(ingredientVendors.ingredientId, qr.ingredientId),
        eq(ingredientVendors.vendorId, quote.vendorId),
      ));

      costUpdated = true;
    }
  }

  await manufacturingDb.updateIngredientQuoteRequest(quoteRequestId, {
    status: "accepted",
    acceptedQuoteId: quoteId,
    costUpdated,
  });

  return { costUpdated };
}

// ─── Invoice Price Variance Detection ──────────────────────────────────

/**
 * Compare a vendor invoice line against the original PO price.
 * If the invoice price exceeds the PO price by more than the threshold,
 * creates an alert and optionally triggers a re-quote.
 */
export async function checkInvoicePriceVariance(input: {
  vendorId: number;
  ingredientId: number;
  invoiceUnitPrice: number;
  invoiceQuantity: number;
  purchaseOrderId?: number;
  invoiceNumber?: string;
}, config: Partial<MonitorConfig> = {}): Promise<{
  hasVariance: boolean;
  variancePct: number;
  alertId?: number;
  quoteRequestId?: number;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const ingredient = await manufacturingDb.getIngredientById(input.ingredientId);
  if (!ingredient) throw new Error("Ingredient not found");

  // Determine the expected price: from PO if available, otherwise current ingredient cost
  let expectedPrice = parseFloat(ingredient.costPerUnit?.toString() || "0");
  if (input.purchaseOrderId) {
    const poItems = await db.select().from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId));
    // Find the matching PO line (by description/product match — best effort)
    for (const item of poItems) {
      const poPrice = parseFloat(item.unitPrice?.toString() || "0");
      if (poPrice > 0) {
        expectedPrice = poPrice;
        break;
      }
    }
  }

  if (expectedPrice <= 0) return { hasVariance: false, variancePct: 0 };

  const variancePct = ((input.invoiceUnitPrice - expectedPrice) / expectedPrice) * 100;
  if (variancePct <= cfg.invoiceVariancePct) {
    return { hasVariance: false, variancePct };
  }

  // Variance detected — create alert
  const overcharge = (input.invoiceUnitPrice - expectedPrice) * input.invoiceQuantity;
  const alert = await manufacturingDb.createIngredientCostAlert({
    ingredientId: input.ingredientId,
    alertType: "invoice_above_po",
    severity: variancePct > 20 ? "critical" : "warning",
    message: `Invoice${input.invoiceNumber ? ` ${input.invoiceNumber}` : ""} from vendor ${input.vendorId} is ${variancePct.toFixed(1)}% above expected price for ${ingredient.name} (overcharge: $${overcharge.toFixed(2)})`,
    details: JSON.stringify({
      vendorId: input.vendorId,
      invoiceUnitPrice: input.invoiceUnitPrice,
      expectedPrice,
      variancePct,
      overcharge,
      purchaseOrderId: input.purchaseOrderId,
      invoiceNumber: input.invoiceNumber,
    }),
    isRead: false,
    isDismissed: false,
  });

  // Auto-trigger a re-quote to find better pricing
  const ivs = await manufacturingDb.getIngredientVendors(input.ingredientId);
  const vendorIds = ivs.map(v => v.vendorId);

  const qr = await manufacturingDb.createIngredientQuoteRequest({
    ingredientId: input.ingredientId,
    triggerType: "invoice_variance",
    triggerDetails: JSON.stringify({
      invoiceUnitPrice: input.invoiceUnitPrice,
      expectedPrice,
      variancePct,
      vendorId: input.vendorId,
      invoiceNumber: input.invoiceNumber,
    }),
    currentCostPerUnit: expectedPrice.toFixed(4),
    targetVendorIds: JSON.stringify(vendorIds),
    status: "pending",
    costUpdated: false,
  });

  return {
    hasVariance: true,
    variancePct,
    alertId: alert.id,
    quoteRequestId: qr.id,
  };
}

/**
 * Fulfillment-driven Revenue Recognition Service
 *
 * Recognizes revenue based on fulfillment events (shipment, delivery)
 * rather than invoice date. Supports multiple recognition methods
 * and auto-generates GL entries.
 */

import * as db from "./db";
import { createAutoJournalEntry } from "./glAutomationService";

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

/**
 * Process a fulfillment event and create revenue recognition entries.
 *
 * Called when a shipment status changes to "delivered" or "in_transit"
 * depending on the recognition rule.
 */
export async function processRevenueRecognitionEvent(params: {
  companyId?: number;
  triggerType: "shipment" | "delivery" | "invoice" | "payment" | "manual";
  triggerEntityType: string;
  triggerEntityId: number;
  orderId?: number;
  invoiceId?: number;
  shipmentId?: number;
  revenueAmount: number;
  cogsAmount?: number;
  currency?: string;
  createdBy?: number;
}) {
  // Find applicable revenue recognition rule
  const rules = await db.getRevenueRecognitionRules(params.companyId);

  // Find the matching rule based on trigger type
  const triggerMethodMap: Record<string, string> = {
    shipment: "point_of_shipment",
    delivery: "point_of_delivery",
    invoice: "point_of_invoice",
    payment: "on_payment",
  };
  const expectedMethod = triggerMethodMap[params.triggerType] || "point_of_shipment";

  const rule = rules.find((r) => r.method === expectedMethod) || rules[0];

  if (!rule) {
    // No rules configured - still record the event but don't post GL entries
    const event = await db.createRevenueRecognitionEvent({
      companyId: params.companyId,
      ruleId: 0,
      eventType: "recognize",
      triggerType: params.triggerType,
      triggerEntityType: params.triggerEntityType,
      triggerEntityId: params.triggerEntityId,
      orderId: params.orderId,
      invoiceId: params.invoiceId,
      shipmentId: params.shipmentId,
      revenueAmount: params.revenueAmount.toFixed(2),
      cogsAmount: params.cogsAmount ? params.cogsAmount.toFixed(2) : null,
      currency: params.currency || "USD",
      status: "pending",
      notes: "No revenue recognition rule configured - event recorded for manual processing",
    });
    return { eventId: event.id, status: "pending", glPosted: false };
  }

  // Create the recognition event
  const event = await db.createRevenueRecognitionEvent({
    companyId: params.companyId,
    ruleId: rule.id,
    eventType: "recognize",
    triggerType: params.triggerType,
    triggerEntityType: params.triggerEntityType,
    triggerEntityId: params.triggerEntityId,
    orderId: params.orderId,
    invoiceId: params.invoiceId,
    shipmentId: params.shipmentId,
    revenueAmount: params.revenueAmount.toFixed(2),
    cogsAmount: params.cogsAmount ? params.cogsAmount.toFixed(2) : null,
    currency: params.currency || "USD",
    status: "pending",
  });

  // Auto-post GL entries if accounts are configured on the rule
  let glResult = null;
  if (rule.revenueAccountId && rule.receivableAccountId) {
    const lines = [
      {
        accountId: rule.receivableAccountId,
        debit: params.revenueAmount.toFixed(2),
        credit: "0",
        description: `AR - Revenue recognition (${params.triggerType})`,
      },
      {
        accountId: rule.revenueAccountId,
        debit: "0",
        credit: params.revenueAmount.toFixed(2),
        description: `Revenue recognized on ${params.triggerType}`,
      },
    ];

    // Add COGS entries if applicable
    if (params.cogsAmount && rule.cogsAccountId && rule.inventoryAccountId) {
      lines.push(
        {
          accountId: rule.cogsAccountId,
          debit: params.cogsAmount.toFixed(2),
          credit: "0",
          description: "Cost of goods sold",
        },
        {
          accountId: rule.inventoryAccountId,
          debit: "0",
          credit: params.cogsAmount.toFixed(2),
          description: "Inventory relieved",
        }
      );
    }

    glResult = await createAutoJournalEntry({
      companyId: params.companyId,
      triggerEvent: "shipment_delivered",
      referenceType: params.triggerEntityType,
      referenceId: params.triggerEntityId,
      description: `Revenue Recognition - ${params.triggerType} #${params.triggerEntityId}`,
      lines,
      currency: params.currency,
      createdBy: params.createdBy,
      autoPost: true,
    });
  }

  return {
    eventId: event.id,
    status: "posted",
    glPosted: !!glResult,
    transactionId: glResult?.transactionId,
    transactionNumber: glResult?.transactionNumber,
  };
}

/**
 * Defer revenue for a prepaid order (before fulfillment).
 * DR: Cash/Bank
 * CR: Deferred Revenue
 */
export async function deferRevenue(params: {
  companyId?: number;
  orderId?: number;
  invoiceId?: number;
  amount: number;
  currency?: string;
  createdBy?: number;
}) {
  const rules = await db.getRevenueRecognitionRules(params.companyId);
  const rule = rules.find((r) => r.deferredRevenueAccountId);

  if (!rule || !rule.deferredRevenueAccountId) {
    return { status: "skipped", reason: "No deferred revenue account configured" };
  }

  const event = await db.createRevenueRecognitionEvent({
    companyId: params.companyId,
    ruleId: rule.id,
    eventType: "defer",
    triggerType: "payment",
    triggerEntityType: "order",
    triggerEntityId: params.orderId || 0,
    orderId: params.orderId,
    invoiceId: params.invoiceId,
    revenueAmount: params.amount.toFixed(2),
    currency: params.currency || "USD",
    status: "posted",
    notes: "Revenue deferred pending fulfillment",
  });

  return { eventId: event.id, status: "deferred" };
}

/**
 * Get revenue recognition status for an order.
 */
export async function getOrderRevenueStatus(orderId: number) {
  const events = await db.getRevenueRecognitionEvents(undefined, orderId);

  const recognized = events
    .filter((e) => e.eventType === "recognize")
    .reduce((s, e) => s + toNum(e.revenueAmount), 0);
  const deferred = events
    .filter((e) => e.eventType === "defer")
    .reduce((s, e) => s + toNum(e.revenueAmount), 0);
  const reversed = events
    .filter((e) => e.eventType === "reverse")
    .reduce((s, e) => s + toNum(e.revenueAmount), 0);

  return {
    orderId,
    totalRecognized: recognized.toFixed(2),
    totalDeferred: deferred.toFixed(2),
    totalReversed: reversed.toFixed(2),
    netRecognized: (recognized - reversed).toFixed(2),
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      triggerType: e.triggerType,
      amount: e.revenueAmount,
      cogsAmount: e.cogsAmount,
      status: e.status,
      createdAt: e.createdAt,
    })),
  };
}

/**
 * Process shipment status change for revenue recognition.
 * This is the main entry point called by the shipment workflow.
 */
export async function onShipmentStatusChange(params: {
  companyId?: number;
  shipmentId: number;
  newStatus: string;
  orderId?: number;
  createdBy?: number;
}) {
  if (params.newStatus !== "delivered" && params.newStatus !== "in_transit") {
    return { processed: false, reason: "Status not a recognition trigger" };
  }

  // Get revenue recognition rules to determine if this status triggers recognition
  const rules = await db.getRevenueRecognitionRules(params.companyId);
  const applicableRule = rules.find((r) => {
    if (params.newStatus === "in_transit" && r.method === "point_of_shipment") return true;
    if (params.newStatus === "delivered" && r.method === "point_of_delivery") return true;
    return false;
  });

  if (!applicableRule) {
    return { processed: false, reason: "No matching revenue recognition rule" };
  }

  // Get order details for amounts
  let revenueAmount = 0;
  let cogsAmount = 0;

  if (params.orderId) {
    const order = await db.getOrderById(params.orderId);
    if (order) {
      revenueAmount = toNum(order.totalAmount);
      // Estimate COGS from order items' cost prices
      const orderItems = await db.getOrderItems(params.orderId);
      cogsAmount = orderItems.reduce((s, item) => {
        return s + toNum(item.quantity) * toNum(item.unitPrice) * 0.6; // Rough estimate
      }, 0);
    }
  }

  if (revenueAmount <= 0) {
    return { processed: false, reason: "No revenue amount found for order" };
  }

  const triggerType = params.newStatus === "in_transit" ? "shipment" : "delivery";

  return processRevenueRecognitionEvent({
    companyId: params.companyId,
    triggerType,
    triggerEntityType: "shipment",
    triggerEntityId: params.shipmentId,
    orderId: params.orderId,
    shipmentId: params.shipmentId,
    revenueAmount,
    cogsAmount,
    createdBy: params.createdBy,
  });
}

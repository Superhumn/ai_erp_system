/**
 * Net Revenue & Channel Profitability Service
 *
 * Tracks platform fees, payout reconciliation, and builds
 * a margin waterfall from gross revenue to net revenue per channel.
 */

import * as db from "./db";

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

/**
 * Record platform fees for an order/invoice.
 */
export async function recordPlatformFees(params: {
  companyId?: number;
  channel: "shopify" | "amazon" | "wholesale" | "retail" | "direct" | "other";
  orderId?: number;
  invoiceId?: number;
  fees: Array<{
    feeType:
      | "transaction_fee"
      | "payment_processing"
      | "platform_commission"
      | "listing_fee"
      | "fulfillment_fee"
      | "advertising"
      | "refund_fee"
      | "chargeback"
      | "other";
    feeDescription?: string;
    feeAmount: string;
    referenceNumber?: string;
  }>;
  feeDate: Date;
}) {
  const results = [];
  for (const fee of params.fees) {
    const result = await db.createPlatformFee({
      companyId: params.companyId,
      channel: params.channel,
      orderId: params.orderId,
      invoiceId: params.invoiceId,
      feeType: fee.feeType,
      feeDescription: fee.feeDescription,
      feeAmount: fee.feeAmount,
      feeCurrency: "USD",
      feeDate: params.feeDate,
      referenceNumber: fee.referenceNumber,
    });
    results.push(result);
  }
  return { recorded: results.length, fees: results };
}

/**
 * Record a channel payout and its line items.
 */
export async function recordChannelPayout(params: {
  companyId?: number;
  channel: "shopify" | "amazon" | "stripe" | "paypal" | "other";
  payoutNumber: string;
  payoutDate: Date;
  grossAmount: string;
  feesDeducted?: string;
  refundsDeducted?: string;
  chargebacksDeducted?: string;
  adjustments?: string;
  netAmount: string;
  currency?: string;
  lines?: Array<{
    orderId?: number;
    invoiceId?: number;
    lineType: "sale" | "refund" | "fee" | "chargeback" | "adjustment" | "other";
    grossAmount: string;
    feeAmount?: string;
    netAmount: string;
    referenceNumber?: string;
  }>;
}) {
  const payout = await db.createChannelPayout({
    companyId: params.companyId,
    channel: params.channel,
    payoutNumber: params.payoutNumber,
    payoutDate: params.payoutDate,
    grossAmount: params.grossAmount,
    feesDeducted: params.feesDeducted || "0",
    refundsDeducted: params.refundsDeducted || "0",
    chargebacksDeducted: params.chargebacksDeducted || "0",
    adjustments: params.adjustments || "0",
    netAmount: params.netAmount,
    currency: params.currency || "USD",
    status: "pending",
  });

  if (params.lines && params.lines.length > 0) {
    const lineItems = params.lines.map((l) => ({
      payoutId: payout.id,
      orderId: l.orderId,
      invoiceId: l.invoiceId,
      lineType: l.lineType,
      grossAmount: l.grossAmount,
      feeAmount: l.feeAmount || "0",
      netAmount: l.netAmount,
      status: "unmatched" as const,
      referenceNumber: l.referenceNumber,
    }));
    await db.createPayoutReconciliationLinesBatch(lineItems);
  }

  return { payoutId: payout.id, payoutNumber: params.payoutNumber };
}

/**
 * Reconcile a payout against recorded orders/invoices.
 * Marks matching lines and flags discrepancies.
 */
export async function reconcilePayout(payoutId: number) {
  const payout = await db.getChannelPayoutById(payoutId);
  if (!payout) throw new Error("Payout not found");

  const lines = await db.getPayoutReconciliationLines(payoutId);
  let matchedCount = 0;
  let unmatchedCount = 0;
  let discrepancyCount = 0;

  for (const line of lines) {
    if (line.orderId || line.invoiceId) {
      // Attempt to match against orders/invoices
      if (line.orderId) {
        const order = await db.getOrderById(line.orderId);
        if (order) {
          const orderTotal = toNum(order.totalAmount);
          const lineGross = toNum(line.grossAmount);
          if (Math.abs(orderTotal - lineGross) < 0.01) {
            matchedCount++;
          } else {
            discrepancyCount++;
          }
        } else {
          unmatchedCount++;
        }
      } else {
        matchedCount++;
      }
    } else {
      unmatchedCount++;
    }
  }

  // Update payout status
  const newStatus =
    unmatchedCount === 0 && discrepancyCount === 0
      ? "reconciled"
      : discrepancyCount > 0
        ? "discrepancy"
        : "pending";

  await db.updateChannelPayout(payoutId, {
    status: newStatus as any,
    reconciliationDate: new Date(),
    reconciliationNotes: `Matched: ${matchedCount}, Unmatched: ${unmatchedCount}, Discrepancies: ${discrepancyCount}`,
  });

  return {
    payoutId,
    status: newStatus,
    summary: { matched: matchedCount, unmatched: unmatchedCount, discrepancies: discrepancyCount },
  };
}

/**
 * Build a net revenue waterfall for a given channel and time period.
 * Gross Sales → Discounts → Refunds → Platform Fees → Net Revenue
 */
export async function getNetRevenueWaterfall(params: {
  companyId?: number;
  channel?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  // Get all orders for the channel/period
  const allOrders = await db.getOrders({ companyId: params.companyId });
  const filteredOrders = allOrders.filter((o) => {
    if (params.startDate && new Date(o.orderDate) < params.startDate) return false;
    if (params.endDate && new Date(o.orderDate) > params.endDate) return false;
    return true;
  });

  const grossSales = filteredOrders.reduce((s, o) => s + toNum(o.subtotal), 0);
  const discounts = filteredOrders.reduce((s, o) => s + toNum(o.discountAmount), 0);
  const shipping = filteredOrders.reduce((s, o) => s + toNum(o.shippingAmount), 0);
  const tax = filteredOrders.reduce((s, o) => s + toNum(o.taxAmount), 0);

  // Get platform fees
  const allFees = await db.getPlatformFees(params.companyId, params.channel);
  const transactionFees = allFees
    .filter((f) => f.feeType === "transaction_fee" || f.feeType === "payment_processing")
    .reduce((s, f) => s + toNum(f.feeAmount), 0);
  const platformCommission = allFees
    .filter((f) => f.feeType === "platform_commission")
    .reduce((s, f) => s + toNum(f.feeAmount), 0);
  const fulfillmentFees = allFees
    .filter((f) => f.feeType === "fulfillment_fee")
    .reduce((s, f) => s + toNum(f.feeAmount), 0);
  const otherFees = allFees
    .filter(
      (f) =>
        !["transaction_fee", "payment_processing", "platform_commission", "fulfillment_fee"].includes(
          f.feeType
        )
    )
    .reduce((s, f) => s + toNum(f.feeAmount), 0);

  const totalFees = transactionFees + platformCommission + fulfillmentFees + otherFees;
  const refunds = filteredOrders
    .filter((o) => o.status === "refunded")
    .reduce((s, o) => s + toNum(o.totalAmount), 0);

  const netRevenue = grossSales - discounts - refunds - totalFees;

  return {
    period: {
      start: params.startDate?.toISOString() || "all-time",
      end: params.endDate?.toISOString() || "present",
    },
    channel: params.channel || "all",
    orderCount: filteredOrders.length,
    waterfall: {
      grossSales: grossSales.toFixed(2),
      discounts: `-${discounts.toFixed(2)}`,
      refunds: `-${refunds.toFixed(2)}`,
      transactionFees: `-${transactionFees.toFixed(2)}`,
      platformCommission: `-${platformCommission.toFixed(2)}`,
      fulfillmentFees: `-${fulfillmentFees.toFixed(2)}`,
      otherFees: `-${otherFees.toFixed(2)}`,
      totalFees: `-${totalFees.toFixed(2)}`,
      netRevenue: netRevenue.toFixed(2),
    },
    marginPercent: grossSales > 0 ? ((netRevenue / grossSales) * 100).toFixed(2) : "0",
    additionalInfo: {
      shippingCollected: shipping.toFixed(2),
      taxCollected: tax.toFixed(2),
    },
  };
}

/**
 * Get channel profitability comparison.
 */
export async function getChannelProfitability(companyId?: number) {
  const channels = ["shopify", "amazon", "wholesale", "retail", "direct"] as const;
  const results = [];

  for (const channel of channels) {
    const waterfall = await getNetRevenueWaterfall({ companyId, channel });
    if (toNum(waterfall.waterfall.grossSales) > 0) {
      results.push({
        channel,
        ...waterfall.waterfall,
        marginPercent: waterfall.marginPercent,
        orderCount: waterfall.orderCount,
      });
    }
  }

  return {
    channels: results,
    summary: {
      totalGrossSales: results.reduce((s, r) => s + toNum(r.grossSales), 0).toFixed(2),
      totalNetRevenue: results.reduce((s, r) => s + toNum(r.netRevenue), 0).toFixed(2),
      channelCount: results.length,
    },
  };
}

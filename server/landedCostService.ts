/**
 * Landed Cost Allocation Service
 *
 * Distributes freight, duty, insurance, and handling costs across
 * PO line items / SKUs based on configurable allocation methods.
 * Computes per-unit landed cost and margin impact.
 */

import * as db from "./db";

export interface LandedCostInput {
  companyId?: number;
  shipmentId?: number;
  purchaseOrderId?: number;
  freightBookingId?: number;
  customsClearanceId?: number;
  freightCost?: string;
  insuranceCost?: string;
  dutyCost?: string;
  customsFees?: string;
  handlingFees?: string;
  otherCosts?: string;
  allocationMethod: "by_value" | "by_weight" | "by_volume" | "by_quantity" | "equal";
  currency?: string;
  notes?: string;
  createdBy?: number;
}

export interface LandedCostLineInput {
  productId?: number;
  rawMaterialId?: number;
  purchaseOrderItemId?: number;
  sku?: string;
  itemDescription?: string;
  quantity: string;
  unitCost: string;
  weight?: string;
  volume?: string;
  sellingPrice?: string;
}

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

/**
 * Create a landed cost allocation and compute per-item distribution.
 */
export async function createLandedCostAllocation(
  input: LandedCostInput,
  lineItems: LandedCostLineInput[]
) {
  const freight = toNum(input.freightCost);
  const insurance = toNum(input.insuranceCost);
  const duty = toNum(input.dutyCost);
  const customs = toNum(input.customsFees);
  const handling = toNum(input.handlingFees);
  const other = toNum(input.otherCosts);
  const totalLanded = freight + insurance + duty + customs + handling + other;

  const allocationNumber = generateAllocationNumber();

  // Create header record
  const allocation = await db.createLandedCostAllocation({
    companyId: input.companyId,
    allocationNumber,
    shipmentId: input.shipmentId,
    purchaseOrderId: input.purchaseOrderId,
    freightBookingId: input.freightBookingId,
    customsClearanceId: input.customsClearanceId,
    status: "calculated",
    freightCost: freight.toFixed(2),
    insuranceCost: insurance.toFixed(2),
    dutyCost: duty.toFixed(2),
    customsFees: customs.toFixed(2),
    handlingFees: handling.toFixed(2),
    otherCosts: other.toFixed(2),
    totalLandedCost: totalLanded.toFixed(2),
    currency: input.currency || "USD",
    allocationMethod: input.allocationMethod,
    notes: input.notes,
    createdBy: input.createdBy,
  });

  // Calculate allocation basis for each item
  const items = lineItems.map((li) => {
    const qty = toNum(li.quantity);
    const uc = toNum(li.unitCost);
    return {
      ...li,
      qty,
      uc,
      totalItemCost: qty * uc,
      weight: toNum(li.weight),
      volume: toNum(li.volume),
    };
  });

  // Compute totals for the allocation basis
  const totals = items.reduce(
    (acc, it) => ({
      value: acc.value + it.totalItemCost,
      weight: acc.weight + it.weight,
      volume: acc.volume + it.volume,
      quantity: acc.quantity + it.qty,
      count: acc.count + 1,
    }),
    { value: 0, weight: 0, volume: 0, quantity: 0, count: 0 }
  );

  // Allocate costs to each line item
  const allocatedItems = items.map((item) => {
    let ratio = 0;
    switch (input.allocationMethod) {
      case "by_value":
        ratio = totals.value > 0 ? item.totalItemCost / totals.value : 0;
        break;
      case "by_weight":
        ratio = totals.weight > 0 ? item.weight / totals.weight : 0;
        break;
      case "by_volume":
        ratio = totals.volume > 0 ? item.volume / totals.volume : 0;
        break;
      case "by_quantity":
        ratio = totals.quantity > 0 ? item.qty / totals.quantity : 0;
        break;
      case "equal":
        ratio = totals.count > 0 ? 1 / totals.count : 0;
        break;
    }

    const allocFreight = freight * ratio;
    const allocInsurance = insurance * ratio;
    const allocDuty = duty * ratio;
    const allocCustoms = customs * ratio;
    const allocHandling = handling * ratio;
    const allocOther = other * ratio;
    const totalAllocated =
      allocFreight + allocInsurance + allocDuty + allocCustoms + allocHandling + allocOther;

    const landedUnitCost = item.qty > 0 ? (item.totalItemCost + totalAllocated) / item.qty : 0;
    const sp = toNum(item.sellingPrice);
    const grossMargin = sp > 0 ? sp - landedUnitCost : 0;
    const grossMarginPercent = sp > 0 ? (grossMargin / sp) * 100 : 0;

    return {
      allocationId: allocation.id,
      productId: item.productId,
      rawMaterialId: item.rawMaterialId,
      purchaseOrderItemId: item.purchaseOrderItemId,
      sku: item.sku,
      itemDescription: item.itemDescription,
      quantity: item.qty.toFixed(4),
      unitCost: item.uc.toFixed(4),
      totalItemCost: item.totalItemCost.toFixed(2),
      weight: item.weight > 0 ? item.weight.toFixed(2) : null,
      volume: item.volume > 0 ? item.volume.toFixed(2) : null,
      allocatedFreight: allocFreight.toFixed(2),
      allocatedInsurance: allocInsurance.toFixed(2),
      allocatedDuty: allocDuty.toFixed(2),
      allocatedCustomsFees: allocCustoms.toFixed(2),
      allocatedHandling: allocHandling.toFixed(2),
      allocatedOther: allocOther.toFixed(2),
      totalAllocatedCost: totalAllocated.toFixed(2),
      landedUnitCost: landedUnitCost.toFixed(4),
      sellingPrice: sp > 0 ? sp.toFixed(2) : null,
      grossMargin: sp > 0 ? grossMargin.toFixed(2) : null,
      grossMarginPercent: sp > 0 ? grossMarginPercent.toFixed(2) : null,
    };
  });

  // Batch insert all line items
  await db.createLandedCostItemsBatch(allocatedItems as any);

  return {
    allocationId: allocation.id,
    allocationNumber,
    totalLandedCost: totalLanded.toFixed(2),
    itemCount: allocatedItems.length,
    items: allocatedItems,
  };
}

/**
 * Re-calculate an existing allocation (e.g., when costs change).
 */
export async function recalculateLandedCost(allocationId: number) {
  const header = await db.getLandedCostAllocationById(allocationId);
  if (!header) throw new Error("Allocation not found");

  const items = await db.getLandedCostItems(allocationId);
  if (items.length === 0) return header;

  // Re-run allocation with current header costs
  await db.deleteLandedCostItems(allocationId);

  const lineInputs: LandedCostLineInput[] = items.map((it) => ({
    productId: it.productId ?? undefined,
    rawMaterialId: it.rawMaterialId ?? undefined,
    purchaseOrderItemId: it.purchaseOrderItemId ?? undefined,
    sku: it.sku ?? undefined,
    itemDescription: it.itemDescription ?? undefined,
    quantity: String(it.quantity),
    unitCost: String(it.unitCost),
    weight: it.weight ? String(it.weight) : undefined,
    volume: it.volume ? String(it.volume) : undefined,
    sellingPrice: it.sellingPrice ? String(it.sellingPrice) : undefined,
  }));

  return createLandedCostAllocation(
    {
      companyId: header.companyId ?? undefined,
      shipmentId: header.shipmentId ?? undefined,
      purchaseOrderId: header.purchaseOrderId ?? undefined,
      freightBookingId: header.freightBookingId ?? undefined,
      customsClearanceId: header.customsClearanceId ?? undefined,
      freightCost: String(header.freightCost),
      insuranceCost: String(header.insuranceCost),
      dutyCost: String(header.dutyCost),
      customsFees: String(header.customsFees),
      handlingFees: String(header.handlingFees),
      otherCosts: String(header.otherCosts),
      allocationMethod: header.allocationMethod,
      currency: header.currency || "USD",
    },
    lineInputs
  );
}

/**
 * Get margin impact analysis for all items in an allocation.
 */
export async function getMarginImpactAnalysis(allocationId: number) {
  const header = await db.getLandedCostAllocationById(allocationId);
  if (!header) throw new Error("Allocation not found");

  const items = await db.getLandedCostItems(allocationId);

  const summary = {
    allocationNumber: header.allocationNumber,
    totalLandedCost: header.totalLandedCost,
    allocationMethod: header.allocationMethod,
    itemCount: items.length,
    items: items.map((it) => ({
      sku: it.sku,
      description: it.itemDescription,
      quantity: it.quantity,
      originalUnitCost: it.unitCost,
      landedUnitCost: it.landedUnitCost,
      costIncrease: (toNum(it.landedUnitCost) - toNum(it.unitCost)).toFixed(4),
      costIncreasePercent:
        toNum(it.unitCost) > 0
          ? (((toNum(it.landedUnitCost) - toNum(it.unitCost)) / toNum(it.unitCost)) * 100).toFixed(
              2
            )
          : "0",
      sellingPrice: it.sellingPrice,
      grossMargin: it.grossMargin,
      grossMarginPercent: it.grossMarginPercent,
      allocatedCostBreakdown: {
        freight: it.allocatedFreight,
        insurance: it.allocatedInsurance,
        duty: it.allocatedDuty,
        customsFees: it.allocatedCustomsFees,
        handling: it.allocatedHandling,
        other: it.allocatedOther,
        total: it.totalAllocatedCost,
      },
    })),
    averageMarginPercent: 0,
  };

  // Calculate average margin
  const marginsWithSP = items.filter((it) => toNum(it.grossMarginPercent) !== 0);
  if (marginsWithSP.length > 0) {
    summary.averageMarginPercent =
      marginsWithSP.reduce((sum, it) => sum + toNum(it.grossMarginPercent), 0) /
      marginsWithSP.length;
  }

  return summary;
}

function generateAllocationNumber() {
  const d = new Date();
  const yr = d.getFullYear().toString().slice(-2);
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const rnd = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `LC-${yr}${mo}-${rnd}`;
}

/**
 * Tests for Shipments page utility functions.
 * Functions tested: Shipment type, typeColors, shipment filtering and summary stats
 */
import { describe, it, expect } from "vitest";

// ── Re-implement logic from Shipments.tsx ──

type Shipment = {
  id?: number;
  shipmentNumber: string;
  type: "inbound" | "outbound";
  status: "pending" | "in_transit" | "delivered" | "returned" | "cancelled";
  carrier: string | null;
  trackingNumber: string | null;
  shipDate: Date | null;
  deliveryDate: Date | null;
  notes: string | null;
};

const typeColors: Record<string, string> = {
  inbound: "bg-blue-500/10 text-blue-600",
  outbound: "bg-green-500/10 text-green-600",
};

function filterShipments(
  shipments: Shipment[],
  search: string,
  statusFilter: string,
): Shipment[] {
  let list = shipments;
  if (statusFilter !== "all") {
    list = list.filter(s => s.status === statusFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s =>
      s.shipmentNumber.toLowerCase().includes(q) ||
      (s.carrier && s.carrier.toLowerCase().includes(q)) ||
      (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q))
    );
  }
  return list;
}

function computeShipmentStats(shipments: Shipment[]) {
  let inTransitCount = 0, deliveredCount = 0, pendingCount = 0;
  for (const s of shipments) {
    if (s.status === "in_transit") inTransitCount++;
    else if (s.status === "delivered") deliveredCount++;
    else if (s.status === "pending") pendingCount++;
  }
  return { inTransitCount, deliveredCount, pendingCount };
}

// ── Tests ──

describe("Shipments — typeColors", () => {
  it("has inbound color", () => {
    expect(typeColors.inbound).toContain("blue");
  });

  it("has outbound color", () => {
    expect(typeColors.outbound).toContain("green");
  });
});

describe("Shipments — filterShipments", () => {
  const shipments: Shipment[] = [
    { shipmentNumber: "SHP-001", type: "outbound", status: "in_transit", carrier: "FedEx", trackingNumber: "FX123", shipDate: null, deliveryDate: null, notes: null },
    { shipmentNumber: "SHP-002", type: "inbound", status: "delivered", carrier: "UPS", trackingNumber: "UPS456", shipDate: null, deliveryDate: null, notes: null },
    { shipmentNumber: "SHP-003", type: "outbound", status: "pending", carrier: "DHL", trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
  ];

  it("returns all when no filters applied", () => {
    expect(filterShipments(shipments, "", "all")).toHaveLength(3);
  });

  it("filters by status", () => {
    const result = filterShipments(shipments, "", "in_transit");
    expect(result).toHaveLength(1);
    expect(result[0].shipmentNumber).toBe("SHP-001");
  });

  it("filters by search on shipment number", () => {
    const result = filterShipments(shipments, "002", "all");
    expect(result).toHaveLength(1);
    expect(result[0].shipmentNumber).toBe("SHP-002");
  });

  it("filters by search on carrier", () => {
    const result = filterShipments(shipments, "fedex", "all");
    expect(result).toHaveLength(1);
  });

  it("filters by search on tracking number", () => {
    const result = filterShipments(shipments, "ups456", "all");
    expect(result).toHaveLength(1);
  });

  it("combines search and status filter", () => {
    const result = filterShipments(shipments, "SHP", "delivered");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("delivered");
  });

  it("returns empty for no match", () => {
    expect(filterShipments(shipments, "zzz", "all")).toHaveLength(0);
  });

  it("is case insensitive", () => {
    expect(filterShipments(shipments, "FEDEX", "all")).toHaveLength(1);
  });

  it("handles null tracking number gracefully", () => {
    const result = filterShipments(shipments, "DHL", "all");
    expect(result).toHaveLength(1);
    expect(result[0].shipmentNumber).toBe("SHP-003");
  });
});

describe("Shipments — computeShipmentStats", () => {
  it("counts statuses correctly", () => {
    const shipments: Shipment[] = [
      { shipmentNumber: "1", type: "outbound", status: "in_transit", carrier: null, trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
      { shipmentNumber: "2", type: "outbound", status: "in_transit", carrier: null, trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
      { shipmentNumber: "3", type: "inbound", status: "delivered", carrier: null, trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
      { shipmentNumber: "4", type: "outbound", status: "pending", carrier: null, trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
      { shipmentNumber: "5", type: "outbound", status: "cancelled", carrier: null, trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
    ];
    const stats = computeShipmentStats(shipments);
    expect(stats.inTransitCount).toBe(2);
    expect(stats.deliveredCount).toBe(1);
    expect(stats.pendingCount).toBe(1);
  });

  it("returns zeros for empty list", () => {
    const stats = computeShipmentStats([]);
    expect(stats).toEqual({ inTransitCount: 0, deliveredCount: 0, pendingCount: 0 });
  });

  it("ignores cancelled and returned", () => {
    const shipments: Shipment[] = [
      { shipmentNumber: "1", type: "outbound", status: "cancelled", carrier: null, trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
      { shipmentNumber: "2", type: "outbound", status: "returned", carrier: null, trackingNumber: null, shipDate: null, deliveryDate: null, notes: null },
    ];
    const stats = computeShipmentStats(shipments);
    expect(stats.inTransitCount).toBe(0);
    expect(stats.deliveredCount).toBe(0);
    expect(stats.pendingCount).toBe(0);
  });
});

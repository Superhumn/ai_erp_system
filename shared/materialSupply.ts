/**
 * Material Supply & Reorder — cross-boundary data contract.
 *
 * Shape returned by `trpc.materialSupply.overview` and consumed by the
 * `MaterialSupply` page. Field names mirror the build handoff spec; the page's
 * reorder math (see `client/src/lib/materialSupply.ts`) is computed from these.
 */

export type ShipmentStatus = "sea" | "port" | "customs" | "delayed" | "booked";

/** Drives the map lane origin for an inbound shipment. */
export type OriginRegion = "asia" | "sea" | "eu";

export type MaterialSupplyCopacker = {
  code: string; // "PAC"
  name: string; // "Pacific Foods Co"
  short: string; // "Pacific Foods"
  location: string; // "Portland, OR"
  /** Stylized-map pixel coordinates (viewBox 1300x340). Optional — laid out automatically when absent. */
  x?: number;
  y?: number;
  /** Real-world coordinates, for a future map-tile layer. */
  lat?: number;
  lng?: number;
};

export type MaterialSupplyMaterial = {
  id: string; // "mushrooms"
  name: string; // "Mushroom Extract"
  unit: string; // "kg" | "L"
  leadTimeDays: number; // sea-freight lead time (planning param)
};

/** One material AT one copacker. */
export type MaterialSupplyInventoryLine = {
  copackerCode: string;
  materialId: string;
  onHand: number; // current on-hand, in material unit
  dailyUsage: number; // avg daily consumption
};

/** An inbound sea-freight container load. */
export type MaterialSupplyShipment = {
  id: string;
  materialId: string;
  copackerCode: string; // destination copacker
  qty: number; // in material unit
  etaDays: number; // days from "today"
  status: ShipmentStatus;
  originRegion: OriginRegion;
  vessel?: string;
  containers?: number;
};

export type MaterialSupplyPlanning = {
  safetyDays: number; // default 10
  targetCoverDays: number; // default 30
};

export type MaterialSupplyOverview = {
  copackers: MaterialSupplyCopacker[];
  materials: MaterialSupplyMaterial[];
  inventoryLines: MaterialSupplyInventoryLine[];
  shipments: MaterialSupplyShipment[];
  planning: MaterialSupplyPlanning;
  /** "live" = assembled from ERP tables; "sample" = canonical demo dataset (no live data yet). */
  source: "live" | "sample";
};

export const DEFAULT_MATERIAL_SUPPLY_PLANNING: MaterialSupplyPlanning = {
  safetyDays: 10,
  targetCoverDays: 30,
};

/**
 * Canonical demo dataset — matches the design spec exactly. Returned by the API
 * when no live copacker / raw-material / inventory data is available, so the
 * view always renders meaningfully.
 */
export const SAMPLE_MATERIAL_SUPPLY: MaterialSupplyOverview = {
  source: "sample",
  planning: DEFAULT_MATERIAL_SUPPLY_PLANNING,
  copackers: [
    { code: "PAC", name: "Pacific Foods Co", short: "Pacific Foods", location: "Portland, OR", x: 215, y: 100 },
    { code: "SUN", name: "Sunrise Copacking", short: "Sunrise", location: "Edison, NJ", x: 1080, y: 115 },
    { code: "LSB", name: "Lone Star Bottling", short: "Lone Star", location: "Dallas, TX", x: 650, y: 258 },
    { code: "GSP", name: "Golden State Packing", short: "Golden State", location: "Vernon, CA", x: 195, y: 220 },
  ],
  materials: [
    { id: "mushrooms", name: "Mushroom Extract", unit: "kg", leadTimeDays: 38 },
    { id: "hemp", name: "Hemp Protein", unit: "kg", leadTimeDays: 26 },
    { id: "coconut", name: "Coconut Oil", unit: "L", leadTimeDays: 34 },
    { id: "formulas", name: "Finished Formula", unit: "kg", leadTimeDays: 30 },
  ],
  inventoryLines: [
    { copackerCode: "PAC", materialId: "mushrooms", onHand: 1200, dailyUsage: 45 },
    { copackerCode: "PAC", materialId: "hemp", onHand: 3000, dailyUsage: 120 },
    { copackerCode: "PAC", materialId: "coconut", onHand: 1800, dailyUsage: 90 },
    { copackerCode: "PAC", materialId: "formulas", onHand: 300, dailyUsage: 60 },
    { copackerCode: "SUN", materialId: "mushrooms", onHand: 600, dailyUsage: 50 },
    { copackerCode: "SUN", materialId: "hemp", onHand: 5000, dailyUsage: 140 },
    { copackerCode: "SUN", materialId: "coconut", onHand: 900, dailyUsage: 80 },
    { copackerCode: "SUN", materialId: "formulas", onHand: 1500, dailyUsage: 70 },
    { copackerCode: "LSB", materialId: "mushrooms", onHand: 2000, dailyUsage: 40 },
    { copackerCode: "LSB", materialId: "hemp", onHand: 1200, dailyUsage: 100 },
    { copackerCode: "LSB", materialId: "coconut", onHand: 4000, dailyUsage: 75 },
    { copackerCode: "LSB", materialId: "formulas", onHand: 500, dailyUsage: 55 },
    { copackerCode: "GSP", materialId: "mushrooms", onHand: 900, dailyUsage: 60 },
    { copackerCode: "GSP", materialId: "hemp", onHand: 2200, dailyUsage: 110 },
    { copackerCode: "GSP", materialId: "coconut", onHand: 700, dailyUsage: 85 },
    { copackerCode: "GSP", materialId: "formulas", onHand: 2400, dailyUsage: 50 },
  ],
  shipments: [
    { id: "S1", materialId: "mushrooms", copackerCode: "PAC", etaDays: 12, status: "sea", vessel: "MSC Loreto", qty: 2000, containers: 2, originRegion: "asia" },
    { id: "S2", materialId: "hemp", copackerCode: "PAC", etaDays: 8, status: "sea", vessel: "Maersk Cardiff", qty: 4000, containers: 2, originRegion: "eu" },
    { id: "S3", materialId: "coconut", copackerCode: "PAC", etaDays: 20, status: "delayed", vessel: "ONE Olympus", qty: 3000, containers: 3, originRegion: "sea" },
    { id: "S4", materialId: "formulas", copackerCode: "PAC", etaDays: 40, status: "booked", vessel: "CMA CGM Lyra", qty: 2000, containers: 1, originRegion: "asia" },
    { id: "S5", materialId: "mushrooms", copackerCode: "SUN", etaDays: 6, status: "port", vessel: "CMA CGM Lyra", qty: 2500, containers: 3, originRegion: "asia" },
    { id: "S6", materialId: "coconut", copackerCode: "SUN", etaDays: 15, status: "customs", vessel: "MSC Tessa", qty: 2800, containers: 2, originRegion: "sea" },
    { id: "S7", materialId: "formulas", copackerCode: "SUN", etaDays: 25, status: "sea", vessel: "Cosco Sh. Rose", qty: 2200, containers: 2, originRegion: "asia" },
    { id: "S8", materialId: "mushrooms", copackerCode: "LSB", etaDays: 30, status: "booked", vessel: "Hapag Tsingtao", qty: 1800, containers: 1, originRegion: "asia" },
    { id: "S9", materialId: "hemp", copackerCode: "LSB", etaDays: 10, status: "sea", vessel: "Cosco Sh. Rose", qty: 3500, containers: 3, originRegion: "eu" },
    { id: "S10", materialId: "coconut", copackerCode: "LSB", etaDays: 45, status: "booked", vessel: "Yang Ming Wish", qty: 2500, containers: 2, originRegion: "sea" },
    { id: "S11", materialId: "coconut", copackerCode: "GSP", etaDays: 9, status: "sea", vessel: "Hapag Tsingtao", qty: 1000, containers: 1, originRegion: "sea" },
    { id: "S12", materialId: "hemp", copackerCode: "GSP", etaDays: 18, status: "sea", vessel: "Maersk Cardiff", qty: 3800, containers: 3, originRegion: "eu" },
    { id: "S13", materialId: "mushrooms", copackerCode: "GSP", etaDays: 14, status: "delayed", vessel: "Ever Aim", qty: 800, containers: 1, originRegion: "asia" },
    { id: "S14", materialId: "formulas", copackerCode: "GSP", etaDays: 33, status: "booked", vessel: "MSC Loreto", qty: 1200, containers: 1, originRegion: "asia" },
  ],
};

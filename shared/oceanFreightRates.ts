/**
 * Superhumn ocean freight matrix — port-to-port base rates + landed-cost model.
 *
 * Source: "Superhumn ocean freight matrix" sheet, as-of 9 August 2026, USD.
 * Every figure below is a market indication, NOT a binding quote. Spot rates move
 * 20-40% within a quarter and contract rates typically price 10-25% under spot.
 * Verify with a forwarder RFQ before any commercial decision.
 *
 * This module is the single source of truth for the rate estimator: the tRPC
 * `freight.rateEstimate.*` routes and the client preview both call `estimateOceanFreight`.
 * To refresh rates, edit LANES / ASSUMPTIONS here and bump RATES_AS_OF.
 */

export const RATES_AS_OF = "2026-08-09";
export const RATES_CURRENCY = "USD";

/** Container payload + volume limits, and the unit conversion the model runs on. */
export const ASSUMPTIONS = {
  /** Max legal payload for dense/dry product in a 40ft. */
  payload40DenseKg: 26_000,
  /** Retort pouches cube out before they weigh out — the conservative default. */
  payload40RetortKg: 18_000,
  payload20Kg: 21_000,
  volume40Cbm: 67,
  volume20Cbm: 33,
  kgPerLb: 0.4536,
  /** Which payload the cost-per-lb figures assume unless overridden. */
  defaultPayloadKg: 18_000,
} as const;

/** Everything charged on top of the base ocean freight. */
export const SURCHARGES = {
  /** Terminal handling at the load port, per container. */
  originThcUsd: 250,
  /** Terminal handling at the discharge port, per container. */
  destinationThcUsd: 300,
  /** Per bill of lading, per shipment. */
  documentationUsd: 120,
  /** Port-to-warehouse trucking, per container. */
  drayageUsUsd: 800,
  /** Shorter distances outside the US. */
  drayageNonUsUsd: 350,
  /** Typical all-risk marine cover, as a fraction of cargo value. */
  insuranceRate: 0.004,
  /** Aug-Oct uplift on base freight. */
  peakSeasonUplift: 0.5,
  peakSeasonMonths: [8, 9, 10] as readonly number[],
} as const;

/** Named rate scenarios for the multiplier applied to every base rate. */
export const RATE_SCENARIOS = [
  { id: "contract", label: "Contract", multiplier: 0.8, note: "Contracted rate, ~20% under spot" },
  { id: "base", label: "Base (spot)", multiplier: 1.0, note: "Market spot indication as published" },
  { id: "peak", label: "Peak season", multiplier: 1.5, note: "Aug-Oct capacity crunch" },
] as const;

export type RateScenarioId = (typeof RATE_SCENARIOS)[number]["id"];

export type ShippingMode = "fcl20" | "fcl40" | "lcl";

export const SHIPPING_MODES: { id: ShippingMode; label: string; description: string }[] = [
  { id: "fcl20", label: "20ft FCL", description: "Full container, 21,000 kg / 33 cbm" },
  { id: "fcl40", label: "40ft FCL", description: "Full container, up to 26,000 kg / 67 cbm" },
  { id: "lcl", label: "LCL", description: "Shared container, priced per revenue ton" },
];

export interface FreightLane {
  originCountry: string;
  loadPort: string;
  destination: string;
  dischargePort: string;
  /** Base port-to-port ocean freight, low/high of the indicative range. */
  fcl20Low: number;
  fcl20High: number;
  fcl40Low: number;
  fcl40High: number;
  /** LCL is quoted per cbm (billed on the greater of cbm or tonnes). */
  lclLowPerCbm: number;
  lclHighPerCbm: number;
  transitDays: number;
  /** True where no carrier indicative rate existed and the lane was interpolated. */
  interpolated?: boolean;
}

/**
 * Ocean freight matrix — base rates, spot, as of 9 Aug 2026.
 * All figures USD, port-to-port, base ocean freight only.
 */
export const LANES: FreightLane[] = [
  { originCountry: "India", loadPort: "Nhava Sheva", destination: "US West Coast", dischargePort: "Los Angeles", fcl20Low: 1620, fcl20High: 2500, fcl40Low: 2800, fcl40High: 4200, lclLowPerCbm: 50, lclHighPerCbm: 90, transitDays: 35 },
  { originCountry: "India", loadPort: "Nhava Sheva", destination: "US East Coast", dischargePort: "New York", fcl20Low: 1056, fcl20High: 3000, fcl40Low: 3300, fcl40High: 5500, lclLowPerCbm: 50, lclHighPerCbm: 90, transitDays: 32 },
  { originCountry: "India", loadPort: "Chennai", destination: "Japan", dischargePort: "Tokyo", fcl20Low: 1871, fcl20High: 1949, fcl40Low: 2400, fcl40High: 3200, lclLowPerCbm: 45, lclHighPerCbm: 80, transitDays: 16 },
  { originCountry: "India", loadPort: "Nhava Sheva", destination: "North Europe", dischargePort: "Rotterdam", fcl20Low: 1200, fcl20High: 2100, fcl40Low: 2010, fcl40High: 3400, lclLowPerCbm: 50, lclHighPerCbm: 90, transitDays: 28 },
  { originCountry: "India", loadPort: "Nhava Sheva", destination: "GCC", dischargePort: "Jebel Ali", fcl20Low: 450, fcl20High: 900, fcl40Low: 700, fcl40High: 1500, lclLowPerCbm: 30, lclHighPerCbm: 60, transitDays: 8 },
  { originCountry: "India", loadPort: "Chennai", destination: "Australia", dischargePort: "Sydney", fcl20Low: 1400, fcl20High: 2200, fcl40Low: 2200, fcl40High: 3400, lclLowPerCbm: 45, lclHighPerCbm: 85, transitDays: 22 },
  { originCountry: "India", loadPort: "Nhava Sheva", destination: "South Africa", dischargePort: "Durban", fcl20Low: 900, fcl20High: 1600, fcl40Low: 1500, fcl40High: 2600, lclLowPerCbm: 40, lclHighPerCbm: 75, transitDays: 20 },

  { originCountry: "Malaysia", loadPort: "Port Klang", destination: "US West Coast", dischargePort: "Los Angeles", fcl20Low: 1400, fcl20High: 2500, fcl40Low: 2000, fcl40High: 3800, lclLowPerCbm: 45, lclHighPerCbm: 90, transitDays: 21 },
  { originCountry: "Malaysia", loadPort: "Port Klang", destination: "US East Coast", dischargePort: "New York", fcl20Low: 2200, fcl20High: 3600, fcl40Low: 3500, fcl40High: 6000, lclLowPerCbm: 55, lclHighPerCbm: 100, transitDays: 35 },
  { originCountry: "Malaysia", loadPort: "Port Klang", destination: "Japan", dischargePort: "Osaka", fcl20Low: 505, fcl20High: 900, fcl40Low: 850, fcl40High: 1600, lclLowPerCbm: 25, lclHighPerCbm: 50, transitDays: 10 },
  { originCountry: "Malaysia", loadPort: "Port Klang", destination: "North Europe", dischargePort: "Rotterdam", fcl20Low: 1500, fcl20High: 2600, fcl40Low: 2400, fcl40High: 4200, lclLowPerCbm: 55, lclHighPerCbm: 95, transitDays: 32 },
  { originCountry: "Malaysia", loadPort: "Port Klang", destination: "GCC", dischargePort: "Jebel Ali", fcl20Low: 600, fcl20High: 1100, fcl40Low: 950, fcl40High: 1800, lclLowPerCbm: 32, lclHighPerCbm: 62, transitDays: 14 },
  { originCountry: "Malaysia", loadPort: "Port Klang", destination: "Australia", dischargePort: "Sydney", fcl20Low: 700, fcl20High: 1300, fcl40Low: 1100, fcl40High: 2100, lclLowPerCbm: 35, lclHighPerCbm: 70, transitDays: 16 },
  { originCountry: "Malaysia", loadPort: "Port Klang", destination: "South Africa", dischargePort: "Durban", fcl20Low: 1100, fcl20High: 1900, fcl40Low: 1800, fcl40High: 3100, lclLowPerCbm: 45, lclHighPerCbm: 85, transitDays: 24 },

  { originCountry: "Singapore", loadPort: "Singapore", destination: "US West Coast", dischargePort: "Los Angeles", fcl20Low: 1450, fcl20High: 2550, fcl40Low: 2100, fcl40High: 3600, lclLowPerCbm: 45, lclHighPerCbm: 90, transitDays: 20, interpolated: true },
  { originCountry: "Singapore", loadPort: "Singapore", destination: "US East Coast", dischargePort: "New York", fcl20Low: 2250, fcl20High: 3650, fcl40Low: 3600, fcl40High: 6100, lclLowPerCbm: 55, lclHighPerCbm: 100, transitDays: 34, interpolated: true },
  { originCountry: "Singapore", loadPort: "Singapore", destination: "Japan", dischargePort: "Tokyo", fcl20Low: 550, fcl20High: 950, fcl40Low: 900, fcl40High: 1500, lclLowPerCbm: 26, lclHighPerCbm: 52, transitDays: 9, interpolated: true },
  { originCountry: "Singapore", loadPort: "Singapore", destination: "North Europe", dischargePort: "Rotterdam", fcl20Low: 1550, fcl20High: 2650, fcl40Low: 2450, fcl40High: 4250, lclLowPerCbm: 55, lclHighPerCbm: 95, transitDays: 31, interpolated: true },
  { originCountry: "Singapore", loadPort: "Singapore", destination: "GCC", dischargePort: "Jebel Ali", fcl20Low: 620, fcl20High: 1150, fcl40Low: 980, fcl40High: 1850, lclLowPerCbm: 32, lclHighPerCbm: 62, transitDays: 13, interpolated: true },
  { originCountry: "Singapore", loadPort: "Singapore", destination: "Australia", dischargePort: "Sydney", fcl20Low: 720, fcl20High: 1350, fcl40Low: 1150, fcl40High: 2150, lclLowPerCbm: 35, lclHighPerCbm: 70, transitDays: 15, interpolated: true },
  { originCountry: "Singapore", loadPort: "Singapore", destination: "South Africa", dischargePort: "Durban", fcl20Low: 1050, fcl20High: 1850, fcl40Low: 1750, fcl40High: 3000, lclLowPerCbm: 45, lclHighPerCbm: 85, transitDays: 23, interpolated: true },

  { originCountry: "Indonesia", loadPort: "Tanjung Priok", destination: "US West Coast", dischargePort: "Los Angeles", fcl20Low: 1500, fcl20High: 2600, fcl40Low: 2200, fcl40High: 3600, lclLowPerCbm: 48, lclHighPerCbm: 92, transitDays: 24, interpolated: true },
  { originCountry: "Indonesia", loadPort: "Tanjung Priok", destination: "US East Coast", dischargePort: "New York", fcl20Low: 2300, fcl20High: 3700, fcl40Low: 3700, fcl40High: 6200, lclLowPerCbm: 58, lclHighPerCbm: 102, transitDays: 38, interpolated: true },
  { originCountry: "Indonesia", loadPort: "Tanjung Priok", destination: "Japan", dischargePort: "Tokyo", fcl20Low: 700, fcl20High: 1200, fcl40Low: 1200, fcl40High: 1900, lclLowPerCbm: 30, lclHighPerCbm: 58, transitDays: 14, interpolated: true },
  { originCountry: "Indonesia", loadPort: "Tanjung Priok", destination: "North Europe", dischargePort: "Rotterdam", fcl20Low: 1600, fcl20High: 2700, fcl40Low: 2550, fcl40High: 4350, lclLowPerCbm: 58, lclHighPerCbm: 98, transitDays: 34, interpolated: true },
  { originCountry: "Indonesia", loadPort: "Tanjung Priok", destination: "GCC", dischargePort: "Jebel Ali", fcl20Low: 700, fcl20High: 1250, fcl40Low: 1100, fcl40High: 2000, lclLowPerCbm: 34, lclHighPerCbm: 66, transitDays: 16, interpolated: true },
  { originCountry: "Indonesia", loadPort: "Tanjung Priok", destination: "Australia", dischargePort: "Sydney", fcl20Low: 650, fcl20High: 1250, fcl40Low: 1000, fcl40High: 2000, lclLowPerCbm: 33, lclHighPerCbm: 68, transitDays: 13, interpolated: true },
  { originCountry: "Indonesia", loadPort: "Tanjung Priok", destination: "South Africa", dischargePort: "Durban", fcl20Low: 1150, fcl20High: 1950, fcl40Low: 1850, fcl40High: 3150, lclLowPerCbm: 46, lclHighPerCbm: 86, transitDays: 25, interpolated: true },

  { originCountry: "Vietnam", loadPort: "Hai Phong", destination: "US West Coast", dischargePort: "Los Angeles", fcl20Low: 1350, fcl20High: 2450, fcl40Low: 1950, fcl40High: 3500, lclLowPerCbm: 44, lclHighPerCbm: 88, transitDays: 19, interpolated: true },
  { originCountry: "Vietnam", loadPort: "Hai Phong", destination: "US East Coast", dischargePort: "New York", fcl20Low: 2150, fcl20High: 3550, fcl40Low: 3450, fcl40High: 5900, lclLowPerCbm: 54, lclHighPerCbm: 98, transitDays: 33, interpolated: true },
  { originCountry: "Vietnam", loadPort: "Hai Phong", destination: "Japan", dischargePort: "Tokyo", fcl20Low: 400, fcl20High: 800, fcl40Low: 700, fcl40High: 1300, lclLowPerCbm: 22, lclHighPerCbm: 46, transitDays: 7, interpolated: true },
  { originCountry: "Vietnam", loadPort: "Hai Phong", destination: "North Europe", dischargePort: "Rotterdam", fcl20Low: 1500, fcl20High: 2600, fcl40Low: 2400, fcl40High: 4200, lclLowPerCbm: 55, lclHighPerCbm: 95, transitDays: 32, interpolated: true },
  { originCountry: "Vietnam", loadPort: "Hai Phong", destination: "GCC", dischargePort: "Jebel Ali", fcl20Low: 750, fcl20High: 1300, fcl40Low: 1200, fcl40High: 2100, lclLowPerCbm: 35, lclHighPerCbm: 68, transitDays: 18, interpolated: true },
  { originCountry: "Vietnam", loadPort: "Hai Phong", destination: "Australia", dischargePort: "Sydney", fcl20Low: 800, fcl20High: 1400, fcl40Low: 1250, fcl40High: 2250, lclLowPerCbm: 36, lclHighPerCbm: 72, transitDays: 18, interpolated: true },
  { originCountry: "Vietnam", loadPort: "Hai Phong", destination: "South Africa", dischargePort: "Durban", fcl20Low: 1250, fcl20High: 2050, fcl40Low: 2000, fcl40High: 3300, lclLowPerCbm: 48, lclHighPerCbm: 88, transitDays: 27, interpolated: true },

  { originCountry: "China", loadPort: "Qingdao", destination: "US West Coast", dischargePort: "Los Angeles", fcl20Low: 1400, fcl20High: 2400, fcl40Low: 2000, fcl40High: 3800, lclLowPerCbm: 45, lclHighPerCbm: 90, transitDays: 17 },
  { originCountry: "China", loadPort: "Qingdao", destination: "US East Coast", dischargePort: "New York", fcl20Low: 2400, fcl20High: 3800, fcl40Low: 4200, fcl40High: 7200, lclLowPerCbm: 58, lclHighPerCbm: 105, transitDays: 30 },
  { originCountry: "China", loadPort: "Qingdao", destination: "Japan", dischargePort: "Tokyo", fcl20Low: 350, fcl20High: 750, fcl40Low: 600, fcl40High: 1200, lclLowPerCbm: 20, lclHighPerCbm: 44, transitDays: 4 },
  { originCountry: "China", loadPort: "Qingdao", destination: "North Europe", dischargePort: "Rotterdam", fcl20Low: 1650, fcl20High: 2750, fcl40Low: 2700, fcl40High: 4500, lclLowPerCbm: 58, lclHighPerCbm: 100, transitDays: 35 },
  { originCountry: "China", loadPort: "Qingdao", destination: "GCC", dischargePort: "Jebel Ali", fcl20Low: 900, fcl20High: 1500, fcl40Low: 1400, fcl40High: 2400, lclLowPerCbm: 38, lclHighPerCbm: 72, transitDays: 22 },
  { originCountry: "China", loadPort: "Qingdao", destination: "Malaysia", dischargePort: "Port Klang", fcl20Low: 350, fcl20High: 650, fcl40Low: 590, fcl40High: 1000, lclLowPerCbm: 20, lclHighPerCbm: 42, transitDays: 10 },
  { originCountry: "China", loadPort: "Qingdao", destination: "Vietnam", dischargePort: "Hai Phong", fcl20Low: 150, fcl20High: 400, fcl40Low: 275, fcl40High: 700, lclLowPerCbm: 15, lclHighPerCbm: 35, transitDays: 6 },

  { originCountry: "South Africa", loadPort: "Durban", destination: "US East Coast", dischargePort: "New York", fcl20Low: 2600, fcl20High: 4200, fcl40Low: 4000, fcl40High: 6500, lclLowPerCbm: 60, lclHighPerCbm: 110, transitDays: 28, interpolated: true },
  { originCountry: "South Africa", loadPort: "Cape Town", destination: "North Europe", dischargePort: "Rotterdam", fcl20Low: 1700, fcl20High: 2900, fcl40Low: 2700, fcl40High: 4600, lclLowPerCbm: 58, lclHighPerCbm: 100, transitDays: 24, interpolated: true },
  { originCountry: "South Africa", loadPort: "Durban", destination: "GCC", dischargePort: "Jebel Ali", fcl20Low: 1200, fcl20High: 2000, fcl40Low: 1900, fcl40High: 3200, lclLowPerCbm: 48, lclHighPerCbm: 88, transitDays: 18, interpolated: true },
];

export const ORIGIN_COUNTRIES = Array.from(new Set(LANES.map((l) => l.originCountry)));
export const DESTINATIONS = Array.from(new Set(LANES.map((l) => l.destination)));

/** Lanes leaving a country, in matrix order. Empty when the origin is unknown. */
export function lanesForOrigin(originCountry: string): FreightLane[] {
  return LANES.filter((l) => l.originCountry === originCountry);
}

/**
 * Resolve one lane. `loadPort` only matters where a country ships the same
 * destination from more than one port; without it the first matrix row wins.
 */
export function findLane(originCountry: string, destination: string, loadPort?: string): FreightLane | undefined {
  return LANES.find(
    (l) =>
      l.originCountry === originCountry &&
      l.destination === destination &&
      (!loadPort || l.loadPort === loadPort),
  );
}

/** Drayage is only benchmarked at two levels: US destinations and everywhere else. */
export function drayageUsd(destination: string): number {
  return destination.startsWith("US ") ? SURCHARGES.drayageUsUsd : SURCHARGES.drayageNonUsUsd;
}

export function isPeakSeason(date: Date): boolean {
  return SURCHARGES.peakSeasonMonths.includes(date.getUTCMonth() + 1);
}

export interface OceanFreightEstimateInput {
  originCountry: string;
  destination: string;
  /** Optional — disambiguates multi-port origins (India, South Africa). */
  loadPort?: string;
  mode: ShippingMode;
  /** FCL only. Defaults to 1. */
  containers?: number;
  /** LCL only — gross volume. Billed on the greater of cbm and tonnes. */
  volumeCbm?: number;
  /** Cargo gross weight. Drives the capacity check and the cost-per-lb figures. */
  weightKg?: number;
  /** Commercial value, for the marine insurance line. */
  cargoValueUsd?: number;
  /** Scenario multiplier on base freight. Defaults to 1.0 (spot). */
  rateScenario?: number;
  /** ISO date of sailing. Drives the auto peak-season check and the ETA. */
  shipDate?: string;
  includeDrayage?: boolean;
  includeInsurance?: boolean;
  /** Override the Aug-Oct auto-detection either way. */
  applyPeakSeason?: boolean;
}

export interface CostRange {
  low: number;
  mid: number;
  high: number;
}

export interface CostLine {
  label: string;
  amount: number;
  note: string;
}

export interface OceanFreightEstimate {
  lane: FreightLane;
  mode: ShippingMode;
  containers: number;
  /** Revenue tons for LCL, container count for FCL. */
  chargeableUnits: number;
  chargeableUnitLabel: string;
  /** Scenario-adjusted base ocean freight for the whole shipment. */
  baseFreight: CostRange;
  /** Peak-season uplift on base freight, at the mid rate. */
  peakSurcharge: number;
  peakSeasonApplied: boolean;
  /** Fixed adders — THC, docs, drayage, insurance. */
  surcharges: CostLine[];
  surchargeTotal: number;
  /** Base + peak + surcharges. */
  total: CostRange;
  transitDays: number;
  /** ISO date, only when a shipDate was supplied. */
  etaDate?: string;
  /** Null when no weight is known. */
  perLb: { base: number; allIn: number; payloadLb: number } | null;
  rateScenario: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function baseRange(lane: FreightLane, mode: ShippingMode): { low: number; high: number } {
  if (mode === "fcl20") return { low: lane.fcl20Low, high: lane.fcl20High };
  if (mode === "fcl40") return { low: lane.fcl40Low, high: lane.fcl40High };
  return { low: lane.lclLowPerCbm, high: lane.lclHighPerCbm };
}

function payloadCapacityKg(mode: ShippingMode): number {
  if (mode === "fcl20") return ASSUMPTIONS.payload20Kg;
  if (mode === "fcl40") return ASSUMPTIONS.payload40DenseKg;
  return Infinity;
}

function volumeCapacityCbm(mode: ShippingMode): number {
  if (mode === "fcl20") return ASSUMPTIONS.volume20Cbm;
  if (mode === "fcl40") return ASSUMPTIONS.volume40Cbm;
  return Infinity;
}

/**
 * Price one shipment against the matrix.
 *
 * Base freight is the low/high band scaled by the rate scenario. On top of that
 * sit the per-container terminal charges, the per-shipment BL fee, optional
 * drayage and insurance, and the Aug-Oct peak uplift. Returns null when the
 * origin-destination pair isn't in the matrix — those lanes need a forwarder RFQ.
 */
export function estimateOceanFreight(input: OceanFreightEstimateInput): OceanFreightEstimate | null {
  const lane = findLane(input.originCountry, input.destination, input.loadPort);
  if (!lane) return null;

  const warnings: string[] = [];
  const scenario = input.rateScenario ?? 1;
  const containers = input.mode === "lcl" ? 0 : Math.max(1, Math.floor(input.containers ?? 1));
  const { low, high } = baseRange(lane, input.mode);

  // LCL bills on the greater of cbm and metric tonnes (the W/M revenue ton).
  let units: number;
  let unitLabel: string;
  if (input.mode === "lcl") {
    const cbm = input.volumeCbm ?? 0;
    const tonnes = (input.weightKg ?? 0) / 1000;
    units = Math.max(cbm, tonnes);
    unitLabel = "revenue ton (max of cbm and tonnes)";
    if (units <= 0) warnings.push("Enter a volume in cbm to price an LCL shipment.");
    if (tonnes > cbm && cbm > 0) warnings.push("Weight exceeds volume — billed on tonnage, not cbm.");
    if (units >= 15) warnings.push("At 15+ cbm an FCL 20ft usually prices below LCL. Compare both.");
  } else {
    units = containers;
    unitLabel = containers === 1 ? "container" : "containers";
  }

  const baseFreight: CostRange = {
    low: round2(low * units * scenario),
    high: round2(high * units * scenario),
    mid: round2(((low + high) / 2) * units * scenario),
  };

  const shipDate = input.shipDate ? new Date(input.shipDate) : undefined;
  const validShipDate = shipDate && !Number.isNaN(shipDate.getTime()) ? shipDate : undefined;
  const peakSeasonApplied =
    input.applyPeakSeason ?? (validShipDate ? isPeakSeason(validShipDate) : false);
  const peakSurcharge = peakSeasonApplied ? round2(baseFreight.mid * SURCHARGES.peakSeasonUplift) : 0;

  const surcharges: CostLine[] = [];
  if (input.mode === "lcl") {
    surcharges.push({
      label: "Documentation / BL fee",
      amount: SURCHARGES.documentationUsd,
      note: "Per bill of lading",
    });
    warnings.push(
      "LCL rates normally bundle terminal handling and destination charges — confirm what the forwarder's per-cbm figure includes.",
    );
  } else {
    surcharges.push({
      label: "Origin THC",
      amount: SURCHARGES.originThcUsd * containers,
      note: `Terminal handling at ${lane.loadPort}, $${SURCHARGES.originThcUsd}/container`,
    });
    surcharges.push({
      label: "Destination THC",
      amount: SURCHARGES.destinationThcUsd * containers,
      note: `Terminal handling at ${lane.dischargePort}, $${SURCHARGES.destinationThcUsd}/container`,
    });
    surcharges.push({
      label: "Documentation / BL fee",
      amount: SURCHARGES.documentationUsd,
      note: "Per bill of lading",
    });
    if (input.includeDrayage !== false) {
      const rate = drayageUsd(lane.destination);
      surcharges.push({
        label: "Destination drayage",
        amount: rate * containers,
        note: `Port to warehouse, $${rate}/container`,
      });
    }
  }

  if (input.includeInsurance !== false && (input.cargoValueUsd ?? 0) > 0) {
    surcharges.push({
      label: "Marine insurance",
      amount: round2((input.cargoValueUsd ?? 0) * SURCHARGES.insuranceRate),
      note: `${(SURCHARGES.insuranceRate * 100).toFixed(1)}% of cargo value, all-risk`,
    });
  }

  const surchargeTotal = round2(surcharges.reduce((sum, s) => sum + s.amount, 0));
  const fixed = surchargeTotal + peakSurcharge;
  const total: CostRange = {
    low: round2(baseFreight.low + fixed),
    mid: round2(baseFreight.mid + fixed),
    high: round2(baseFreight.high + fixed),
  };

  // Cost per pound of product, on the actual cargo weight when known and the
  // retort payload basis when it isn't.
  const capacity = payloadCapacityKg(input.mode) * Math.max(containers, 1);
  let payloadKg = input.weightKg && input.weightKg > 0 ? input.weightKg : undefined;
  if (input.mode !== "lcl") {
    if (payloadKg && payloadKg > capacity) {
      warnings.push(
        `${payloadKg.toLocaleString()} kg exceeds the ${capacity.toLocaleString()} kg legal payload for ${containers} x ${input.mode === "fcl20" ? "20ft" : "40ft"} — add a container.`,
      );
    }
    if (!payloadKg) payloadKg = ASSUMPTIONS.defaultPayloadKg * containers;
  }
  if (input.mode !== "lcl" && (input.volumeCbm ?? 0) > volumeCapacityCbm(input.mode) * containers) {
    warnings.push(
      `${input.volumeCbm} cbm exceeds the ${volumeCapacityCbm(input.mode) * containers} cbm capacity — the load cubes out before it weighs out.`,
    );
  }

  const perLb = payloadKg
    ? {
        payloadLb: Math.round(payloadKg / ASSUMPTIONS.kgPerLb),
        base: baseFreight.mid / (payloadKg / ASSUMPTIONS.kgPerLb),
        allIn: total.mid / (payloadKg / ASSUMPTIONS.kgPerLb),
      }
    : null;

  let etaDate: string | undefined;
  if (validShipDate) {
    const eta = new Date(validShipDate);
    eta.setUTCDate(eta.getUTCDate() + lane.transitDays);
    etaDate = eta.toISOString().slice(0, 10);
  }

  if (lane.interpolated) {
    warnings.push(
      "This lane was interpolated from comparable benchmarks rather than a carrier quote — treat it as directional.",
    );
  }

  return {
    lane,
    mode: input.mode,
    containers,
    chargeableUnits: round2(units),
    chargeableUnitLabel: unitLabel,
    baseFreight,
    peakSurcharge,
    peakSeasonApplied,
    surcharges,
    surchargeTotal,
    total,
    transitDays: lane.transitDays,
    etaDate,
    perLb,
    rateScenario: scenario,
    warnings,
  };
}

import { describe, it, expect } from "vitest";
import {
  estimateOceanFreight,
  findLane,
  lanesForOrigin,
  drayageUsd,
  isPeakSeason,
  LANES,
  ORIGIN_COUNTRIES,
  ASSUMPTIONS,
} from "../shared/oceanFreightRates";

/**
 * The sheet's "Cost per lb" tab is the reference output: 40ft mid rate,
 * all-in = mid + origin THC + destination THC + BL fee + destination drayage,
 * on the 18,000 kg retort payload basis at scenario 1.0.
 */
const sheetCostPerLb = [
  { origin: "India", destination: "US West Coast", mid: 3500, allIn: 4970, basePerLb: 0.088, allInPerLb: 0.125 },
  { origin: "India", destination: "GCC", mid: 1100, allIn: 2120, basePerLb: 0.028, allInPerLb: 0.053 },
  { origin: "China", destination: "US East Coast", mid: 5700, allIn: 7170, basePerLb: 0.144, allInPerLb: 0.181 },
  { origin: "China", destination: "Japan", mid: 900, allIn: 1920, basePerLb: 0.023, allInPerLb: 0.048 },
  { origin: "Vietnam", destination: "US West Coast", mid: 2725, allIn: 4195, basePerLb: 0.069, allInPerLb: 0.106 },
  { origin: "Malaysia", destination: "US East Coast", mid: 4750, allIn: 6220, basePerLb: 0.12, allInPerLb: 0.157 },
  { origin: "South Africa", destination: "North Europe", mid: 3650, allIn: 4670, basePerLb: 0.092, allInPerLb: 0.118 },
];

describe("ocean freight matrix", () => {
  it("carries every lane with a low <= high band", () => {
    expect(LANES.length).toBe(45);
    for (const lane of LANES) {
      expect(lane.fcl20Low).toBeLessThanOrEqual(lane.fcl20High);
      expect(lane.fcl40Low).toBeLessThanOrEqual(lane.fcl40High);
      expect(lane.lclLowPerCbm).toBeLessThanOrEqual(lane.lclHighPerCbm);
      expect(lane.transitDays).toBeGreaterThan(0);
    }
  });

  it("lists the seven origin countries and resolves multi-port origins", () => {
    expect(ORIGIN_COUNTRIES).toEqual([
      "India", "Malaysia", "Singapore", "Indonesia", "Vietnam", "China", "South Africa",
    ]);
    expect(lanesForOrigin("India")).toHaveLength(7);
    expect(findLane("India", "Japan")?.loadPort).toBe("Chennai");
    expect(findLane("South Africa", "North Europe")?.loadPort).toBe("Cape Town");
    expect(findLane("South Africa", "GCC")?.loadPort).toBe("Durban");
    expect(findLane("China", "Australia")).toBeUndefined();
  });

  it("charges US drayage only for US destinations", () => {
    expect(drayageUsd("US West Coast")).toBe(800);
    expect(drayageUsd("US East Coast")).toBe(800);
    expect(drayageUsd("Japan")).toBe(350);
    expect(drayageUsd("North Europe")).toBe(350);
  });

  it("flags Aug-Oct as peak season", () => {
    expect(isPeakSeason(new Date("2026-08-15T00:00:00Z"))).toBe(true);
    expect(isPeakSeason(new Date("2026-10-31T00:00:00Z"))).toBe(true);
    expect(isPeakSeason(new Date("2026-11-01T00:00:00Z"))).toBe(false);
    expect(isPeakSeason(new Date("2026-03-01T00:00:00Z"))).toBe(false);
  });
});

describe("estimateOceanFreight", () => {
  it("reproduces the sheet's cost-per-lb tab", () => {
    for (const row of sheetCostPerLb) {
      const est = estimateOceanFreight({
        originCountry: row.origin,
        destination: row.destination,
        mode: "fcl40",
        containers: 1,
        weightKg: ASSUMPTIONS.defaultPayloadKg,
      });
      expect(est, `${row.origin} -> ${row.destination}`).not.toBeNull();
      expect(Math.round(est!.baseFreight.mid)).toBe(row.mid);
      expect(Math.round(est!.total.mid)).toBe(row.allIn);
      expect(est!.perLb!.payloadLb).toBe(39_683);
      expect(est!.perLb!.base).toBeCloseTo(row.basePerLb, 3);
      expect(est!.perLb!.allIn).toBeCloseTo(row.allInPerLb, 3);
    }
  });

  it("returns null for a lane that isn't in the matrix", () => {
    expect(estimateOceanFreight({ originCountry: "Brazil", destination: "Japan", mode: "fcl40" })).toBeNull();
    expect(estimateOceanFreight({ originCountry: "China", destination: "Australia", mode: "fcl40" })).toBeNull();
  });

  it("scales base freight by the rate scenario but leaves fixed charges alone", () => {
    const base = estimateOceanFreight({ originCountry: "India", destination: "US West Coast", mode: "fcl40" })!;
    const contract = estimateOceanFreight({
      originCountry: "India", destination: "US West Coast", mode: "fcl40", rateScenario: 0.8,
    })!;
    expect(contract.baseFreight.mid).toBeCloseTo(base.baseFreight.mid * 0.8, 2);
    expect(contract.surchargeTotal).toBe(base.surchargeTotal);
    expect(contract.total.mid).toBeCloseTo(base.baseFreight.mid * 0.8 + base.surchargeTotal, 2);
  });

  it("multiplies per-container charges by container count", () => {
    const est = estimateOceanFreight({
      originCountry: "China", destination: "US West Coast", mode: "fcl40", containers: 3,
    })!;
    // 2000-3800 band, mid 2900, x3 containers
    expect(est.baseFreight.low).toBe(6000);
    expect(est.baseFreight.mid).toBe(8700);
    expect(est.baseFreight.high).toBe(11_400);
    // (250 + 300 + 800) x 3 containers + one BL fee
    expect(est.surchargeTotal).toBe(4170);
  });

  it("applies the peak-season uplift automatically for an Aug-Oct sailing", () => {
    const peak = estimateOceanFreight({
      originCountry: "Vietnam", destination: "North Europe", mode: "fcl40", shipDate: "2026-09-10",
    })!;
    expect(peak.peakSeasonApplied).toBe(true);
    expect(peak.peakSurcharge).toBeCloseTo(peak.baseFreight.mid * 0.5, 2);

    const offPeak = estimateOceanFreight({
      originCountry: "Vietnam", destination: "North Europe", mode: "fcl40", shipDate: "2026-02-10",
    })!;
    expect(offPeak.peakSeasonApplied).toBe(false);
    expect(offPeak.peakSurcharge).toBe(0);

    const forced = estimateOceanFreight({
      originCountry: "Vietnam", destination: "North Europe", mode: "fcl40",
      shipDate: "2026-09-10", applyPeakSeason: false,
    })!;
    expect(forced.peakSurcharge).toBe(0);
  });

  it("adds marine insurance at 0.4% of declared cargo value", () => {
    const est = estimateOceanFreight({
      originCountry: "India", destination: "North Europe", mode: "fcl40", cargoValueUsd: 250_000,
    })!;
    const insurance = est.surcharges.find((s) => s.label === "Marine insurance");
    expect(insurance?.amount).toBe(1000);
    expect(est.total.mid).toBe(2705 + 670 + 350 + 1000);
  });

  it("computes an ETA from the lane transit time", () => {
    const est = estimateOceanFreight({
      originCountry: "China", destination: "Japan", mode: "fcl40", shipDate: "2026-03-01",
    })!;
    expect(est.transitDays).toBe(4);
    expect(est.etaDate).toBe("2026-03-05");
  });

  it("bills LCL on the greater of cbm and tonnes", () => {
    const byVolume = estimateOceanFreight({
      originCountry: "Malaysia", destination: "Japan", mode: "lcl", volumeCbm: 8, weightKg: 2000,
    })!;
    expect(byVolume.chargeableUnits).toBe(8);
    expect(byVolume.baseFreight.mid).toBe(300); // (25 + 50) / 2 * 8 cbm
    expect(byVolume.surchargeTotal).toBe(120); // BL fee only

    const byWeight = estimateOceanFreight({
      originCountry: "Malaysia", destination: "Japan", mode: "lcl", volumeCbm: 4, weightKg: 9000,
    })!;
    expect(byWeight.chargeableUnits).toBe(9);
    expect(byWeight.warnings.some((w) => w.includes("billed on tonnage"))).toBe(true);
  });

  it("warns when the cargo weighs or cubes out the chosen container", () => {
    const overweight = estimateOceanFreight({
      originCountry: "India", destination: "GCC", mode: "fcl20", weightKg: 25_000,
    })!;
    expect(overweight.warnings.some((w) => w.includes("legal payload"))).toBe(true);

    const overVolume = estimateOceanFreight({
      originCountry: "India", destination: "GCC", mode: "fcl40", volumeCbm: 80,
    })!;
    expect(overVolume.warnings.some((w) => w.includes("cubes out"))).toBe(true);
  });

  it("marks interpolated lanes as directional", () => {
    const interpolated = estimateOceanFreight({
      originCountry: "Singapore", destination: "Japan", mode: "fcl40",
    })!;
    expect(interpolated.warnings.some((w) => w.includes("interpolated"))).toBe(true);

    const benchmarked = estimateOceanFreight({
      originCountry: "China", destination: "Japan", mode: "fcl40",
    })!;
    expect(benchmarked.warnings.some((w) => w.includes("interpolated"))).toBe(false);
  });
});

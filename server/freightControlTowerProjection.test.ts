import { describe, it, expect } from "vitest";
import {
  parseDay,
  burnRate,
  projectSku,
  projectAll,
  HORIZON,
} from "../shared/freight-control-tower/projection";
import { COVER, SHIPMENTS, TODAY, DAY } from "../shared/freight-control-tower/fixtures";

describe("parseDay", () => {
  it("parses a 'DD Mon' label to a UTC timestamp pinned to 2026", () => {
    expect(parseDay("04 Aug")).toBe(Date.UTC(2026, 7, 4));
    expect(parseDay("31 Jul")).toBe(Date.UTC(2026, 6, 31));
    expect(parseDay("11 Sep")).toBe(Date.UTC(2026, 8, 11));
  });
  it("returns null for empty / malformed input", () => {
    expect(parseDay(undefined)).toBeNull();
    expect(parseDay("—")).toBeNull();
    expect(parseDay("soon")).toBeNull();
  });
});

describe("burnRate", () => {
  it("spreads on-hand over the authored days of cover", () => {
    expect(burnRate({ days: 10, onHandN: 100, onHand: "", plant: "" })).toBe(10);
    expect(burnRate({ days: 9, onHandN: 118000, onHand: "", plant: "" })).toBeCloseTo(13111.11, 1);
  });
});

describe("projectSku — balance walk", () => {
  const cover = { days: 10, onHandN: 100, onHand: "100", plant: "X" };

  it("stocks out on the day the balance crosses zero with no inbound", () => {
    // burn 10/day, 100 on hand -> zero at day 10
    const p = projectSku("X", cover, [], { horizon: 46 });
    expect(p.burn).toBe(10);
    expect(p.stockoutDay).toBe(10);
    expect(p.hasGap).toBe(true);
    expect(p.resumeDay).toBeNull();
    expect(p.arrivalDays).toEqual([]);
  });

  it("an inbound extends cover but a still-insufficient supply gaps later", () => {
    // +50 landing day 5 buys 5 more days: 100 lasts to d10, refilled to ~110 at d5 -> zero ~d15
    const eta = fmt(TODAY + 5 * DAY);
    const p = projectSku("X", cover, [{ eta, qtyN: 50 }], { horizon: 46 });
    expect(p.arrivalDays).toEqual([5]);
    expect(p.stockoutDay).toBe(15);
    expect(p.resumeDay).toBeNull(); // no arrival strictly after the stockout day
  });

  it("reports resumeDay when an arrival lands after the stockout", () => {
    // tiny early arrival can't save it; a big late arrival recovers after stockout
    const early = fmt(TODAY + 3 * DAY);
    const late = fmt(TODAY + 20 * DAY);
    const p = projectSku("X", cover, [
      { eta: early, qtyN: 10 },
      { eta: late, qtyN: 500 },
    ], { horizon: 46 });
    expect(p.stockoutDay).not.toBeNull();
    expect(p.stockoutDay! < 20).toBe(true);
    expect(p.resumeDay).toBe(20);
  });

  it("stays covered when supply outlasts the horizon", () => {
    const big = { days: 200, onHandN: 2000, onHand: "", plant: "X" }; // burn 10/day, 200 days cover
    const p = projectSku("X", big, [], { horizon: 46 });
    expect(p.stockoutDay).toBeNull();
    expect(p.hasGap).toBe(false);
  });

  it("credits an inbound no earlier than tomorrow even if its ETA is in the past", () => {
    const past = fmt(TODAY - 2 * DAY);
    const p = projectSku("X", cover, [{ eta: past, qtyN: 30 }], { horizon: 46 });
    expect(p.arrivalDays).toEqual([1]); // clamped to day 1
  });
});

describe("projectAll — against the real fixtures", () => {
  const proj = projectAll(COVER, SHIPMENTS, {});

  it("HORIZON is 46 days", () => {
    expect(HORIZON).toBe(46);
  });

  it("excludes quarantined lots so hemp (its only inbound is QC Hold) runs dry", () => {
    // RM-HMP-50: 2,900 kg on hand, burn 2900/31, sole inbound SHP-260717 is QC Hold (prog 1)
    const hemp = proj["RM-HMP-50"];
    expect(hemp.arrivalDays).toEqual([]); // quarantined lot never credited
    expect(hemp.hasGap).toBe(true);
    expect(hemp.stockoutDay).toBe(32); // burn 2900/31 crosses zero on day 32
    expect(hemp.resumeDay).toBeNull();
  });

  it("keeps a deep-cover material (cartons, 74 days) covered", () => {
    expect(proj["PK-CTN-12"].hasGap).toBe(false);
  });

  it("flags at least one short SKU and every projection carries the SKU key", () => {
    const short = Object.values(proj).filter((p) => p.hasGap);
    expect(short.length).toBeGreaterThan(0);
    for (const sku of Object.keys(COVER)) expect(proj[sku].sku).toBe(sku);
  });
});

/** Format a UTC ms timestamp back to the "DD Mon" label parseDay expects. */
function fmt(ms: number): string {
  const d = new Date(ms);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${mon}`;
}

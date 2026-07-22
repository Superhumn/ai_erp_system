import { describe, it, expect } from "vitest";
import { buildMaterialSupplyView } from "./materialSupply";
import { SAMPLE_MATERIAL_SUPPLY } from "@shared/materialSupply";

describe("buildMaterialSupplyView", () => {
  const view = buildMaterialSupplyView(SAMPLE_MATERIAL_SUPPLY);

  it("computes top-line KPIs from the sample dataset", () => {
    expect(view.source).toBe("sample");
    expect(view.kpis.copackers).toBe(4);
    expect(view.kpis.inbound).toBe(14); // shipments
    expect(view.kpis.delayed).toBe(2); // S3, S13
  });

  it("renders one card per material with one row per copacker", () => {
    expect(view.materials).toHaveLength(4);
    expect(view.materials[3].name).toBe("Finished Formula");
    expect(view.materials[3].rows).toHaveLength(4);
  });

  it("applies the reorder math from the spec (PAC · Finished Formula)", () => {
    // onHand 300, dailyUsage 60, lead 30, inbound 2000 (S4)
    // target = 60*(30+30)=3600, total = 2300, reco = roundLot(1300)=1300
    // runway = 2300/60 = 38.3, orderByDays = 8.3 -> "order soon"
    const pac = view.materials[3].rows[0];
    expect(pac.short).toBe("Pacific Foods");
    expect(pac.orderKicker).toBe("Order soon");
    expect(pac.orderQty).toBe("1,300 kg");
  });

  it("draws a freight lane + origin for each region present", () => {
    expect(view.map.pins).toHaveLength(4);
    expect(view.map.routes.length).toBeGreaterThan(0);
    expect(view.map.origins.length).toBeGreaterThan(0);
  });

  it("falls back to auto-layout when copackers lack map coordinates", () => {
    const noCoords = {
      ...SAMPLE_MATERIAL_SUPPLY,
      copackers: SAMPLE_MATERIAL_SUPPLY.copackers.map(({ x, y, ...rest }) => rest),
    };
    const v = buildMaterialSupplyView(noCoords);
    expect(v.map.pins.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

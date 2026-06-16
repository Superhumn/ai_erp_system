import { describe, it, expect } from "vitest";
import { isNonMaterialLineItem } from "./documentImportService";

describe("isNonMaterialLineItem", () => {
  // The only real materials in the catalog — these must always be importable.
  const realMaterials = [
    "Shiitake Mushroom Shredded",
    "Shiitake Mushroom Chopped",
    "Hemp Protein",
    "Coconut Oil",
    "Formula 1",
    "Formula 2",
    "Formula 3",
    "Formula 4",
  ];

  it.each(realMaterials)("treats genuine material %s as a material", (description) => {
    expect(isNonMaterialLineItem({ description, unit: "kg" })).toBe(false);
  });

  // Bogus entries that previously leaked into the materials list.
  const nonMaterials = [
    "Agent Usage Apr 22 - Apr 27, 2026",
    "Build Minutes Apr 1 - Apr 18, 2026",
    "Disk (per GB / min) Mar 27 - Apr 27, 2026",
    "DUBAI PORT CHINA AND RETURN TO QINGDAO FREIGHT",
    "Hobby plan Apr 27 - May 27, 2026",
    "Max plan - 20x May 3 - Jun 3, 2026",
    "Memory (per MB / min) Mar 27 - Apr 27, 2026",
    "Network (per MB) Mar 27 - Apr 27, 2026",
    "OCEAN FREIGHT FROM QINGDAO TO JEBEL ALI",
    "One-time credit purchase",
    "Pro Apr 1 - Apr 30, 2026",
    "Fuel Surcharge",
    "Customs Brokerage Fee",
    "Import Duties",
    "VAT",
  ];

  it.each(nonMaterials)("skips non-material line %s", (description) => {
    expect(isNonMaterialLineItem({ description })).toBe(true);
  });

  it("skips empty / missing descriptions", () => {
    expect(isNonMaterialLineItem({ description: "" })).toBe(true);
    expect(isNonMaterialLineItem({ description: "   " })).toBe(true);
    expect(isNonMaterialLineItem({})).toBe(true);
  });

  it("skips metering units even with a neutral description", () => {
    expect(isNonMaterialLineItem({ description: "Compute", unit: "min" })).toBe(true);
    expect(isNonMaterialLineItem({ description: "Whatever", unit: "GB" })).toBe(true);
  });

  it("does not skip physical goods sold by weight/each", () => {
    expect(isNonMaterialLineItem({ description: "Organic Cocoa Powder", unit: "kg" })).toBe(false);
    expect(isNonMaterialLineItem({ description: "Glass Jar 16oz", unit: "EA" })).toBe(false);
  });
});

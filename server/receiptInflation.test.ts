import { describe, it, expect } from "vitest";
import {
  findMaterialCandidates,
  attributeLines,
  summarizeInflation,
  collapseLinkedLines,
  type LinkedLineRow,
  type MaterialRef,
  type RedundantLine,
  type LineAttribution,
} from "./receiptInflation";

const materials: MaterialRef[] = [
  { id: 1, name: "Citric Acid", sku: "CA-01" },
  { id: 2, name: "Sodium Citrate", sku: "SC-01" },
  { id: 3, name: "Acid", sku: "AC-01" },
];

const line = (over: Partial<RedundantLine> = {}): RedundantLine => ({
  purchaseOrderId: 10,
  poNumber: "INV-BS250605",
  description: "Citric Acid",
  quantity: 100,
  ...over,
});

describe("findMaterialCandidates", () => {
  it("matches on the description containing the material name", () => {
    const hits = findMaterialCandidates("Citric Acid 25kg bag", materials);
    expect(hits.map((m) => m.id)).toEqual([1, 3]);
  });

  it("matches on the material name containing the description", () => {
    expect(findMaterialCandidates("Citric", materials).map((m) => m.id)).toEqual([1]);
  });

  it("returns nothing for a blank description rather than matching everything", () => {
    // "".includes("") is true, so an unguarded substring test would attribute a
    // blank line to every material in the table.
    expect(findMaterialCandidates("", materials)).toEqual([]);
    expect(findMaterialCandidates("   ", materials)).toEqual([]);
  });

  it("ignores materials with a blank name for the same reason", () => {
    const withBlank: MaterialRef[] = [...materials, { id: 4, name: "  ", sku: null }];
    expect(findMaterialCandidates("Citric Acid", withBlank).map((m) => m.id)).toEqual([1, 3]);
  });

  it("is case and whitespace insensitive", () => {
    expect(findMaterialCandidates("  cItRiC aCiD  ", materials).map((m) => m.id)).toEqual([1, 3]);
  });
});

describe("attributeLines", () => {
  it("marks a single match as unique", () => {
    const [a] = attributeLines([line({ description: "Sodium Citrate" })], materials);
    expect(a.confidence).toBe("unique");
    expect(a.materialId).toBe(2);
    expect(a.candidateIds).toEqual([2]);
  });

  it("marks a multi-match as ambiguous but still picks the first, mirroring the importer", () => {
    const [a] = attributeLines([line({ description: "Citric Acid" })], materials);
    expect(a.confidence).toBe("ambiguous");
    expect(a.materialId).toBe(1);
    // Both candidates retained so the call can be audited.
    expect(a.candidateIds).toEqual([1, 3]);
  });

  it("marks an unmatched description and attributes it to nothing", () => {
    const [a] = attributeLines([line({ description: "Blue Dye No. 2" })], materials);
    expect(a.confidence).toBe("unmatched");
    expect(a.materialId).toBeNull();
  });

  it("prefers a persisted junction link over re-deriving from the description", () => {
    // Description would ambiguously match 1 and 3; the link settles it as 2.
    const [a] = attributeLines([line({ description: "Citric Acid", linkedMaterialId: 2 })], materials);
    expect(a.confidence).toBe("linked");
    expect(a.materialId).toBe(2);
    expect(a.candidateIds).toEqual([2]);
  });

  it("falls back to matching when the link points at a material that no longer exists", () => {
    const [a] = attributeLines([line({ description: "Sodium Citrate", linkedMaterialId: 999 })], materials);
    expect(a.confidence).toBe("unique");
    expect(a.materialId).toBe(2);
  });

  it("does not treat a linked line as ambiguous, so it never lands in review", () => {
    const report = summarizeInflation(
      attributeLines([line({ description: "Citric Acid", quantity: 10, linkedMaterialId: 1 })], materials),
      new Map([[1, 90]]),
    );
    expect(report.perMaterial[0].hasAmbiguity).toBe(false);
    expect(report.totals.materialsNeedingReview).toBe(0);
  });
});

const attribute = (lines: RedundantLine[]) => attributeLines(lines, materials);

describe("summarizeInflation", () => {
  it("sums every redundant receipt for a material and reports the corrected figure", () => {
    const attributions = attribute([
      line({ description: "Sodium Citrate", quantity: 40, purchaseOrderId: 11 }),
      line({ description: "Sodium Citrate", quantity: 60, purchaseOrderId: 12 }),
    ]);
    const report = summarizeInflation(attributions, new Map([[2, 250]]));

    expect(report.perMaterial).toHaveLength(1);
    const [m] = report.perMaterial;
    expect(m.overAdded).toBe(100);
    expect(m.currentReceived).toBe(250);
    expect(m.correctedReceived).toBe(150);
    expect(m.lineCount).toBe(2);
    expect(m.exceedsCurrent).toBe(false);
  });

  it("flags a material where the over-add exceeds what is on hand instead of silently zeroing it", () => {
    const attributions = attribute([line({ description: "Sodium Citrate", quantity: 400 })]);
    const report = summarizeInflation(attributions, new Map([[2, 250]]));

    const [m] = report.perMaterial;
    expect(m.exceedsCurrent).toBe(true);
    // Clamped, but the flag is what a caller must key off.
    expect(m.correctedReceived).toBe(0);
    expect(report.totals.materialsNeedingReview).toBe(1);
  });

  it("does not flag exceedsCurrent for a floating-point hair over the current figure", () => {
    const attributions = attribute([line({ description: "Sodium Citrate", quantity: 0.1 + 0.2 })]);
    const report = summarizeInflation(attributions, new Map([[2, 0.3]]));
    expect(report.perMaterial[0].exceedsCurrent).toBe(false);
  });

  it("carries ambiguity up to the material so a guess is never presented as fact", () => {
    const attributions = attribute([line({ description: "Citric Acid", quantity: 10 })]);
    const report = summarizeInflation(attributions, new Map([[1, 90]]));
    expect(report.perMaterial[0].hasAmbiguity).toBe(true);
    expect(report.totals.materialsNeedingReview).toBe(1);
  });

  it("collects unmatched lines separately rather than dropping them", () => {
    const attributions = attribute([
      line({ description: "Blue Dye No. 2", quantity: 5 }),
      line({ description: "Sodium Citrate", quantity: 5 }),
    ]);
    const report = summarizeInflation(attributions, new Map([[2, 50]]));

    expect(report.unattributed).toHaveLength(1);
    expect(report.unattributed[0].description).toBe("Blue Dye No. 2");
    expect(report.totals.redundantLines).toBe(2);
    expect(report.totals.attributedLines).toBe(1);
  });

  it("treats a material with no current figure as zero and flags the disagreement", () => {
    const attributions = attribute([line({ description: "Sodium Citrate", quantity: 5 })]);
    const report = summarizeInflation(attributions, new Map());
    expect(report.perMaterial[0].currentReceived).toBe(0);
    expect(report.perMaterial[0].exceedsCurrent).toBe(true);
  });

  it("orders by the largest discrepancy first", () => {
    const attributions: LineAttribution[] = [
      ...attribute([line({ description: "Sodium Citrate", quantity: 5 })]),
      ...attribute([line({ description: "Citric", quantity: 500 })]),
    ];
    const report = summarizeInflation(attributions, new Map([[1, 900], [2, 900]]));
    expect(report.perMaterial.map((m) => m.materialId)).toEqual([1, 2]);
  });

  it("returns an empty report for no duplicates at all", () => {
    const report = summarizeInflation([], new Map());
    expect(report.perMaterial).toEqual([]);
    expect(report.unattributed).toEqual([]);
    expect(report.totals.materialsAffected).toBe(0);
  });
});


describe("collapseLinkedLines", () => {
  const row = (over: Partial<LinkedLineRow> = {}): LinkedLineRow => ({
    itemId: 1,
    purchaseOrderId: 10,
    poNumber: "INV-1",
    description: "Sodium Citrate",
    quantity: 100,
    linkedMaterialId: null,
    ...over,
  });

  it("counts a line once even when the junction carries several links for it", () => {
    // The left join emits one row per link. Counting them all would add the
    // quantity twice — inflating the report that measures inflation.
    const lines = collapseLinkedLines([
      row({ linkedMaterialId: 2 }),
      row({ linkedMaterialId: 2 }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(100);
    expect(lines[0].linkedMaterialId).toBe(2);
  });

  it("treats conflicting links as no link rather than picking a winner", () => {
    const lines = collapseLinkedLines([
      row({ linkedMaterialId: 2 }),
      row({ linkedMaterialId: 3 }),
    ]);
    expect(lines).toHaveLength(1);
    // Falls through to description matching instead of trusting either link.
    expect(lines[0].linkedMaterialId).toBeNull();
  });

  it("keeps separate line items separate", () => {
    const lines = collapseLinkedLines([
      row({ itemId: 1, quantity: 10 }),
      row({ itemId: 2, quantity: 25 }),
    ]);
    expect(lines.map((l) => l.quantity)).toEqual([10, 25]);
  });

  it("keeps a line that has no link at all", () => {
    const lines = collapseLinkedLines([row()]);
    expect(lines).toHaveLength(1);
    expect(lines[0].linkedMaterialId).toBeNull();
  });

  it("drops zero and non-numeric quantities", () => {
    expect(collapseLinkedLines([row({ itemId: 1, quantity: 0 })])).toEqual([]);
    expect(collapseLinkedLines([row({ itemId: 2, quantity: NaN })])).toEqual([]);
  });

  it("a conflicting link no longer resolves silently once attributed", () => {
    const [line] = collapseLinkedLines([
      row({ description: "Citric Acid", linkedMaterialId: 1 }),
      row({ description: "Citric Acid", linkedMaterialId: 3 }),
    ]);
    const [attributed] = attributeLines([line], materials);
    expect(attributed.confidence).toBe("ambiguous");
  });
});

import { describe, it, expect } from "vitest";
import { parseFormulationSheet, parseQuantityToGrams, suggestColumnMapping } from "./recipeSheetImport";

describe("parseQuantityToGrams", () => {
  it("treats bare numbers as grams", () => {
    expect(parseQuantityToGrams(250)).toBe(250);
    expect(parseQuantityToGrams("1,250")).toBe(1250);
    expect(parseQuantityToGrams("12.5")).toBe(12.5);
  });

  it("converts units to grams", () => {
    expect(parseQuantityToGrams("2kg")).toBeCloseTo(2000);
    expect(parseQuantityToGrams("1 lb")).toBeCloseTo(453.59237);
    expect(parseQuantityToGrams("16 oz")).toBeCloseTo(453.592368);
    expect(parseQuantityToGrams("500 g")).toBe(500);
  });

  it("returns null for non-numeric values", () => {
    expect(parseQuantityToGrams("")).toBeNull();
    expect(parseQuantityToGrams("n/a")).toBeNull();
    expect(parseQuantityToGrams(undefined)).toBeNull();
  });
});

describe("parseFormulationSheet", () => {
  it("groups rows into recipes with lines and procedures", () => {
    const rows = [
      ["Recipe", "Recipe ID", "Category", "Ingredient", "SKU", "Quantity (g)", "Procedure"],
      ["Beef Blend", "BB-01", "beef", "Ground Beef", "GB-1", "800", "Mix dry spices"],
      ["Beef Blend", "", "", "Salt", "", "20", "Blend for 5 min"],
      ["Chicken Mix", "CM-02", "chicken", "Chicken Thigh", "", "1kg", ""],
    ];
    const { recipes, warnings } = parseFormulationSheet(rows);
    expect(recipes).toHaveLength(2);

    const beef = recipes.find((r) => r.name === "Beef Blend")!;
    expect(beef.recipeId).toBe("BB-01");
    expect(beef.category).toBe("beef");
    expect(beef.lines).toHaveLength(2);
    expect(beef.lines[0]).toMatchObject({ ingredientName: "Ground Beef", ingredientSku: "GB-1", quantityGrams: 800 });
    expect(beef.procedures).toEqual([
      { stepNumber: 1, instruction: "Mix dry spices" },
      { stepNumber: 2, instruction: "Blend for 5 min" },
    ]);

    const chicken = recipes.find((r) => r.name === "Chicken Mix")!;
    expect(chicken.category).toBe("chicken");
    expect(chicken.lines[0].quantityGrams).toBeCloseTo(1000);

    expect(warnings).toHaveLength(0);
  });

  it("uses defaultRecipeName for single-recipe sheets without a recipe column", () => {
    const rows = [
      ["Ingredient", "Quantity (g)"],
      ["Water", "500"],
      ["Flour", "300"],
    ];
    const { recipes } = parseFormulationSheet(rows, { defaultRecipeName: "House Dough" });
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe("House Dough");
    expect(recipes[0].lines).toHaveLength(2);
  });

  it("warns when no ingredient or procedure column exists", () => {
    const rows = [
      ["Recipe", "Notes"],
      ["X", "hello"],
    ];
    const { recipes, warnings } = parseFormulationSheet(rows);
    expect(recipes).toHaveLength(0);
    expect(warnings[0]).toMatch(/Ingredient.*Procedure/i);
  });

  it("defaults missing quantities to 0 and warns", () => {
    const rows = [
      ["Recipe", "Ingredient", "Quantity (g)"],
      ["R", "Mystery", "n/a"],
    ];
    const { recipes, warnings } = parseFormulationSheet(rows);
    expect(recipes[0].lines[0].quantityGrams).toBe(0);
    expect(warnings.some((w) => /no valid quantity/.test(w))).toBe(true);
  });

  it("skips rows with no recipe name and reports them", () => {
    const rows = [
      ["Recipe", "Ingredient", "Quantity (g)"],
      ["", "Orphan", "100"],
    ];
    const { recipes, warnings } = parseFormulationSheet(rows);
    expect(recipes).toHaveLength(0);
    expect(warnings.some((w) => /no recipe name/.test(w))).toBe(true);
  });

  it("auto-detects columns from fuzzy / aliased header titles", () => {
    const rows = [
      ["Formula", "Ingredients", "Qty (g)", "Steps"],
      ["Sauce", "Tomato", "500", "Simmer"],
      ["Sauce", "Basil", "10", "Season"],
    ];
    const { recipes, warnings } = parseFormulationSheet(rows);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe("Sauce");
    expect(recipes[0].lines.map((l) => l.ingredientName)).toEqual(["Tomato", "Basil"]);
    expect(recipes[0].lines[0].quantityGrams).toBe(500);
    expect(recipes[0].procedures.map((p) => p.instruction)).toEqual(["Simmer", "Season"]);
    expect(warnings).toHaveLength(0);
  });

  it("honours an explicit column mapping over the header names", () => {
    // Headers "A"/"B"/"C" match nothing automatically — mapping makes it work.
    const rows = [
      ["A", "B", "C"],
      ["My Recipe", "Cumin", "5"],
      ["My Recipe", "Paprika", "8"],
    ];
    const { recipes, warnings } = parseFormulationSheet(rows, {
      columnMapping: { recipeName: 0, ingredient: 1, quantity: 2 },
    });
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe("My Recipe");
    expect(recipes[0].lines).toHaveLength(2);
    expect(recipes[0].lines[1]).toMatchObject({ ingredientName: "Paprika", quantityGrams: 8 });
    expect(warnings).toHaveLength(0);
  });

  it("gives mapping-specific guidance when the mapping omits ingredient and procedure", () => {
    const rows = [
      ["A", "B"],
      ["R", "x"],
    ];
    const { recipes, warnings } = parseFormulationSheet(rows, { columnMapping: { recipeName: 0 } });
    expect(recipes).toHaveLength(0);
    expect(warnings[0]).toMatch(/Map at least/i);
  });
});

describe("suggestColumnMapping", () => {
  it("returns column indices for matched fields and -1 for the rest", () => {
    const m = suggestColumnMapping(["Formula", "Component", "Weight"]);
    expect(m.recipeName).toBe(0);
    expect(m.ingredient).toBe(1);
    expect(m.quantity).toBe(2);
    expect(m.procedure).toBe(-1);
    expect(m.recipeId).toBe(-1);
  });
});

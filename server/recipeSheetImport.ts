// Pure parsing for Google Sheet → recipe formulation imports.
//
// The sheet is expected to have a header row followed by one row per recipe
// line. A single sheet may describe many recipes; rows are grouped by recipe
// name (or recipe id). Each row contributes an ingredient line and/or a
// procedure step. Column matching is forgiving — header names are matched
// case-insensitively against a set of common aliases.
//
// This module has no DB or network dependencies so it can be unit-tested in
// isolation; persistence happens in the recipes router.

const RECIPE_CATEGORIES = ["beef", "pork", "chicken", "seafood", "dairy", "blend", "other"] as const;
type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export interface ParsedRecipeLine {
  ingredientName: string;
  ingredientSku?: string;
  quantityGrams: number;
  quantityGramsDry?: number;
}

export interface ParsedRecipeProcedure {
  stepNumber: number;
  instruction: string;
}

export interface ParsedRecipe {
  recipeId?: string;
  name: string;
  category: RecipeCategory;
  lines: ParsedRecipeLine[];
  procedures: ParsedRecipeProcedure[];
}

export interface ParseResult {
  recipes: ParsedRecipe[];
  warnings: string[];
}

type ColumnKey =
  | "recipeName"
  | "recipeId"
  | "category"
  | "ingredient"
  | "ingredientSku"
  | "quantity"
  | "quantityDry"
  | "procedure";

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  recipeName: ["recipe name", "recipe", "formulation", "formula", "product", "name"],
  recipeId: ["recipe id", "recipe code", "formula id", "formulation id", "code"],
  category: ["category", "protein", "type"],
  ingredient: ["ingredient", "ingredient name", "component", "material", "item", "raw material"],
  ingredientSku: ["ingredient sku", "sku", "ingredient code", "material code", "item code"],
  quantity: ["quantity (g)", "quantity grams", "quantity", "grams", "qty", "amount", "weight (g)", "weight", "mass"],
  quantityDry: ["dry quantity", "dry grams", "quantity dry", "dry weight", "quantity (g) dry", "dry"],
  procedure: ["procedure", "instruction", "instructions", "step", "steps", "directions", "method"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Build a map of ColumnKey → column index from the header row. */
function mapColumns(header: unknown[]): Partial<Record<ColumnKey, number>> {
  const normalized = header.map(normalizeHeader);
  const map: Partial<Record<ColumnKey, number>> = {};
  // Match most-specific aliases first so "ingredient sku" wins over "sku" etc.
  const order: ColumnKey[] = [
    "recipeId",
    "recipeName",
    "category",
    "ingredientSku",
    "ingredient",
    "quantityDry",
    "quantity",
    "procedure",
  ];
  for (const key of order) {
    for (const alias of HEADER_ALIASES[key]) {
      const idx = normalized.findIndex((h, i) => h === alias && !Object.values(map).includes(i));
      if (idx !== -1) {
        map[key] = idx;
        break;
      }
    }
  }
  return map;
}

/**
 * Parse a numeric quantity into grams. Bare numbers are treated as grams;
 * values suffixed with a unit (kg, lb, oz, g) are converted to grams.
 * Returns null when the value is not numeric.
 */
export function parseQuantityToGrams(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const str = String(raw).trim().toLowerCase().replace(/,/g, "");
  if (!str) return null;
  const match = str.match(/^(-?\d*\.?\d+)\s*(kg|kilograms?|g|grams?|lb|lbs|pounds?|oz|ounces?)?$/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2] ?? "g";
  if (unit.startsWith("kg") || unit.startsWith("kilo")) return value * 1000;
  if (unit.startsWith("lb") || unit.startsWith("pound")) return value * 453.59237;
  if (unit.startsWith("oz") || unit.startsWith("ounce")) return value * 28.349523;
  return value; // grams
}

function coerceCategory(raw: unknown): RecipeCategory {
  const v = normalizeHeader(raw);
  return (RECIPE_CATEGORIES as readonly string[]).includes(v) ? (v as RecipeCategory) : "other";
}

/**
 * Parse a sheet (array of rows; first row is the header) into grouped recipes.
 * When `defaultRecipeName` is supplied it is used for rows that omit a recipe
 * name — useful when importing a single-recipe sheet.
 */
export function parseFormulationSheet(
  rows: unknown[][],
  opts?: { defaultRecipeName?: string },
): ParseResult {
  const warnings: string[] = [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { recipes: [], warnings: ["The spreadsheet is empty."] };
  }

  const header = rows[0] ?? [];
  const cols = mapColumns(header as unknown[]);

  if (cols.ingredient === undefined && cols.procedure === undefined) {
    warnings.push(
      "Could not find an 'Ingredient' or 'Procedure' column in the header row. " +
        "Expected a header row with columns like Recipe, Ingredient, Quantity (g).",
    );
    return { recipes: [], warnings };
  }

  const byKey = new Map<string, ParsedRecipe>();
  const cell = (row: unknown[], key: ColumnKey): string => {
    const idx = cols[key];
    if (idx === undefined) return "";
    return String(row[idx] ?? "").trim();
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => String(c ?? "").trim() === "")) continue; // blank row

    const recipeName = cell(row, "recipeName") || opts?.defaultRecipeName?.trim() || "";
    const recipeIdVal = cell(row, "recipeId");
    const groupKey = recipeName || recipeIdVal;
    if (!groupKey) {
      warnings.push(`Row ${r + 1}: no recipe name — skipped.`);
      continue;
    }

    let recipe = byKey.get(groupKey);
    if (!recipe) {
      recipe = {
        recipeId: recipeIdVal || undefined,
        name: recipeName || recipeIdVal,
        category: coerceCategory(cell(row, "category")),
        lines: [],
        procedures: [],
      };
      byKey.set(groupKey, recipe);
    } else if (!recipe.recipeId && recipeIdVal) {
      recipe.recipeId = recipeIdVal;
    }

    const ingredientName = cell(row, "ingredient");
    if (ingredientName) {
      const grams = parseQuantityToGrams(cols.quantity !== undefined ? row[cols.quantity] : undefined);
      if (grams === null) {
        warnings.push(`Row ${r + 1}: ingredient "${ingredientName}" has no valid quantity — defaulted to 0 g.`);
      }
      const dry =
        cols.quantityDry !== undefined ? parseQuantityToGrams(row[cols.quantityDry]) : null;
      recipe.lines.push({
        ingredientName,
        ingredientSku: cell(row, "ingredientSku") || undefined,
        quantityGrams: grams ?? 0,
        quantityGramsDry: dry ?? undefined,
      });
    }

    const instruction = cell(row, "procedure");
    if (instruction) {
      recipe.procedures.push({ stepNumber: recipe.procedures.length + 1, instruction });
    }
  }

  const recipes = Array.from(byKey.values()).filter((rec) => {
    if (rec.lines.length === 0 && rec.procedures.length === 0) {
      warnings.push(`Recipe "${rec.name}" had no ingredient or procedure rows — skipped.`);
      return false;
    }
    return true;
  });

  return { recipes, warnings };
}

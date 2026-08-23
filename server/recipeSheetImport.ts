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

export type ColumnKey =
  | "recipeName"
  | "recipeId"
  | "category"
  | "ingredient"
  | "ingredientSku"
  | "quantity"
  | "quantityDry"
  | "procedure";

export const COLUMN_KEYS: ColumnKey[] = [
  "recipeName",
  "recipeId",
  "category",
  "ingredient",
  "ingredientSku",
  "quantity",
  "quantityDry",
  "procedure",
];

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  recipeName: ["recipe name", "recipe", "recipes", "formulation", "formula", "product", "product name", "item name", "name", "title", "recipe title"],
  recipeId: ["recipe id", "recipe code", "formula id", "formulation id", "sku id", "code", "id"],
  category: ["category", "categories", "protein", "protein type", "type", "meat"],
  ingredient: ["ingredient", "ingredients", "ingredient name", "component", "components", "material", "materials", "item", "raw material", "raw materials", "description"],
  ingredientSku: ["ingredient sku", "sku", "skus", "ingredient code", "material code", "item code", "part number", "part no"],
  quantity: ["quantity (g)", "quantity grams", "quantity", "quantities", "grams", "gram", "qty", "qty (g)", "amount", "amount (g)", "weight (g)", "weight", "mass", "batch qty", "batch quantity"],
  quantityDry: ["dry quantity", "dry grams", "quantity dry", "dry weight", "quantity (g) dry", "dry qty", "dry"],
  procedure: ["procedure", "procedures", "instruction", "instructions", "step", "steps", "directions", "direction", "method", "process", "prep", "preparation"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Strip everything but letters/digits, so "Quantity (g)" ≈ "quantityg". */
function alphaNum(s: string): string {
  return s.replace(/[^a-z0-9]/g, "");
}

/**
 * Score how well a header matches one of a field's aliases. Matching is
 * deliberately forgiving so real-world sheets don't need exact column titles:
 * exact match beats a prefix/suffix match, which beats a whole-word match,
 * which beats a loose substring. Returns 0 when nothing matches.
 */
function headerMatchScore(headerNorm: string, aliases: string[]): number {
  if (!headerNorm) return 0;
  const hp = alphaNum(headerNorm);
  const words = headerNorm.split(/[^a-z0-9]+/).filter(Boolean);
  let best = 0;
  for (const alias of aliases) {
    const ap = alphaNum(alias);
    if (headerNorm === alias || (hp && hp === ap)) return 100; // exact (punctuation-insensitive)
    if (!ap) continue;
    if (hp.startsWith(ap) || hp.endsWith(ap)) best = Math.max(best, 60);
    else if (words.includes(alias)) best = Math.max(best, 40); // alias appears as a whole word
    else if (ap.length >= 4 && hp.includes(ap)) best = Math.max(best, 20); // loose substring
  }
  return best;
}

/**
 * Build a best-effort map of ColumnKey → column index from the header row.
 * More specific fields are resolved first (e.g. "ingredient sku" claims the SKU
 * column before "ingredient" can), and each column is used at most once.
 */
function mapColumns(header: unknown[]): Partial<Record<ColumnKey, number>> {
  const normalized = header.map(normalizeHeader);
  const map: Partial<Record<ColumnKey, number>> = {};
  const used = new Set<number>();
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
    let bestIdx = -1;
    let bestScore = 0;
    normalized.forEach((h, i) => {
      if (used.has(i)) return;
      const score = headerMatchScore(h, HEADER_ALIASES[key]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    if (bestIdx !== -1 && bestScore > 0) {
      map[key] = bestIdx;
      used.add(bestIdx);
    }
  }
  return map;
}

/**
 * Suggest a column mapping for a header row, returning every field with a
 * column index (or -1 when nothing matched). Used to seed the import UI's
 * mapping controls so the user can review/adjust before importing.
 */
export function suggestColumnMapping(header: unknown[]): Record<ColumnKey, number> {
  const partial = mapColumns(header);
  const full = {} as Record<ColumnKey, number>;
  for (const key of COLUMN_KEYS) full[key] = partial[key] ?? -1;
  return full;
}

/** Keep only in-range, non-negative column indices from an explicit mapping. */
function normalizeColumnMapping(
  mapping: Partial<Record<ColumnKey, number>> | undefined,
  width: number,
): Partial<Record<ColumnKey, number>> | undefined {
  if (!mapping) return undefined;
  const out: Partial<Record<ColumnKey, number>> = {};
  for (const key of COLUMN_KEYS) {
    const idx = mapping[key];
    if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < width) out[key] = idx;
  }
  return out;
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
 * name — useful when importing a single-recipe sheet. When `columnMapping` is
 * supplied (field → column index) it overrides the automatic header detection,
 * so sheets with non-standard column titles can still be imported.
 */
export function parseFormulationSheet(
  rows: unknown[][],
  opts?: { defaultRecipeName?: string; columnMapping?: Partial<Record<ColumnKey, number>> },
): ParseResult {
  const warnings: string[] = [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { recipes: [], warnings: ["The spreadsheet is empty."] };
  }

  const header = rows[0] ?? [];
  const explicit = normalizeColumnMapping(opts?.columnMapping, (header as unknown[]).length);
  const cols = explicit ?? mapColumns(header as unknown[]);

  if (cols.ingredient === undefined && cols.procedure === undefined) {
    warnings.push(
      explicit
        ? "Map at least an 'Ingredient' or a 'Procedure' column before importing."
        : "Could not find an 'Ingredient' or 'Procedure' column in the header row. " +
            "Expected a header row with columns like Recipe, Ingredient, Quantity (g), " +
            "or use the column mapping to point at your sheet's columns.",
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

# Production Planning

Plan a production run from a target quantity, see every ingredient it consumes, and turn the
shortfall into purchase orders. Lives on **Operations → Forecasting → Production Plans**.

Two ways into a plan:

| Route | Starting point | Where |
|---|---|---|
| Manual | "I want to make 500 lb of X next month" | **New Production Plan** dialog |
| Forecast-driven | An AI demand forecast | **Create Plan** on a forecast row |

Both produce the same artefacts — a `productionPlans` row plus one `materialRequirements` row per
material — so the existing **Generate POs** → approve → real PO pipeline works either way.

## Manual plans

`forecasting.previewProductionPlan` (query, nothing is written) and
`forecasting.createProductionPlan` (mutation) share one input and one code path
(`buildManualProductionPlan` in `server/routers.ts`), so the preview in the dialog is exactly what
gets saved.

Inputs:

- **Source** — a recipe (materials come from the recipe's ingredient lines, sub-recipes included)
  or a BOM (the product's active BOM when none is named).
- **Quantity + unit** — `EA`, `CASE`, `BATCH`, `LB`, `KG`, `G`, `OZ`. Cases need a case size;
  moving between counts and weights needs a net weight per unit. The error message names whichever
  is missing.
- **Safety margin %** — extra cushion on top of the target.
- **Purchase buffer %** — extra added to what's actually ordered.
- **Net off finished stock** — subtract on-hand finished goods from the target.
- **Account for yield loss** (recipe source) — a recipe at 90% yield starts 1/0.9 as much so the
  finished output matches the target.

## What the explosion does

**Recipe source** (`explodeRecipeToIngredients` in `server/db/manufacturing.ts`): walks the recipe
tree, scaling each sub-recipe to the grams its parent line asks for, and aggregates leaf ingredients
by id. Wet/dry formulation is honoured, `per_each` ingredients stay item counts, and cyclic or
absurdly deep sub-recipe trees throw. Each ingredient is matched to a raw material by SKU/name — on
save, an unmatched ingredient gets a raw material created for it so it can be purchased.

**BOM source**: component quantities are stated per BOM batch, so they scale by the number of
batches the planned quantity represents (`plannedQuantity → batchUnit ÷ batchSize`), plus each
component's wastage percent. A recipe synced to a BOM records its base batch in grams, so a 50 lb
plan against a 1,000 g base batch is 22.68 batches — not 50.

Every requirement is then netted against raw material stock and open POs, restated in the raw
material's stocking unit, and given lead-time dates (latest order date, estimated delivery, an
urgency flag when the lead time no longer fits).

## Code map

| Piece | File |
|---|---|
| Unit conversion, margins, netting, lead-time maths (pure, unit-tested) | `server/productionPlanning.ts` |
| Tests for the above | `server/productionPlanning.test.ts` |
| Recipe → leaf ingredient explosion | `server/db/manufacturing.ts` |
| Plan building, preview/create routes, BOM explosion, persistence | `server/routers.ts` (`forecasting` router) |
| Plan + materials UI | `client/src/pages/operations/ProductionPlanDialog.tsx`, `Forecasting.tsx` |

## Known limits

- One product per plan (`productionPlans.productId`); a multi-product run is several plans.
- Labour isn't planned — only the BOM's flat `laborCost` exists today.
- Ingredients stocked in volume units (ml/l) are left in grams with a warning rather than guessed at.
- No print/export of a plan or its shopping list yet.

-- STEP 2 (03) — manufacturing_catalog: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).
-- Catalog note: ownerCompanyId NULL = shared/GLOBAL base product; existing rows default to US and
-- truly-shared base items are reassigned to GLOBAL operationally.

-- ============================== UP ==============================
-- recipes
UPDATE recipes SET ownerCompanyId = (SELECT id FROM companies WHERE code = 'US') WHERE ownerCompanyId IS NULL;
CREATE INDEX idx_recipes_ownerCompanyId ON recipes (ownerCompanyId);

-- recipeIngredients
UPDATE recipeIngredients SET ownerCompanyId = (SELECT id FROM companies WHERE code = 'US') WHERE ownerCompanyId IS NULL;
CREATE INDEX idx_recipeIngredients_ownerCompanyId ON recipeIngredients (ownerCompanyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_recipes_ownerCompanyId ON recipes;
-- DROP INDEX idx_recipeIngredients_ownerCompanyId ON recipeIngredients;

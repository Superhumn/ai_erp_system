-- STEP 2 (05) — forecasting: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- demandForecasts
UPDATE demandForecasts SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_demandForecasts_companyId ON demandForecasts (companyId);

-- productionPlans
UPDATE productionPlans SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_productionPlans_companyId ON productionPlans (companyId);

-- suggestedPurchaseOrders
UPDATE suggestedPurchaseOrders SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_suggestedPurchaseOrders_companyId ON suggestedPurchaseOrders (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_demandForecasts_companyId ON demandForecasts;
-- DROP INDEX idx_productionPlans_companyId ON productionPlans;
-- DROP INDEX idx_suggestedPurchaseOrders_companyId ON suggestedPurchaseOrders;

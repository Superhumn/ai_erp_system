-- STEP 2 (11) — investors: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- investment_commitments
UPDATE investment_commitments SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_investment_commitments_companyId ON investment_commitments (companyId);

-- financial_model
UPDATE financial_model SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_financial_model_companyId ON financial_model (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_investment_commitments_companyId ON investment_commitments;
-- DROP INDEX idx_financial_model_companyId ON financial_model;

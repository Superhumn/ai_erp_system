-- STEP 2 (02) — freight: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- freightRfqs
UPDATE freightRfqs SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_freightRfqs_companyId ON freightRfqs (companyId);

-- customsClearances
UPDATE customsClearances SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_customsClearances_companyId ON customsClearances (companyId);

-- freightBookings
UPDATE freightBookings SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_freightBookings_companyId ON freightBookings (companyId);

-- freight_quotes
UPDATE freight_quotes SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_freight_quotes_companyId ON freight_quotes (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_freightRfqs_companyId ON freightRfqs;
-- DROP INDEX idx_customsClearances_companyId ON customsClearances;
-- DROP INDEX idx_freightBookings_companyId ON freightBookings;
-- DROP INDEX idx_freight_quotes_companyId ON freight_quotes;

-- STEP 2 (04) — copacker: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- copacker_inventory_updates
UPDATE copacker_inventory_updates SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_copacker_inventory_updates_companyId ON copacker_inventory_updates (companyId);

-- copacker_invoices
UPDATE copacker_invoices SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_copacker_invoices_companyId ON copacker_invoices (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_copacker_inventory_updates_companyId ON copacker_inventory_updates;
-- DROP INDEX idx_copacker_invoices_companyId ON copacker_invoices;

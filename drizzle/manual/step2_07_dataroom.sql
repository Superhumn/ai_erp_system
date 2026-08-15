-- STEP 2 (07) — dataroom: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- data_rooms
UPDATE data_rooms SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_data_rooms_companyId ON data_rooms (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_data_rooms_companyId ON data_rooms;

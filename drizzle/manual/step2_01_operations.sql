-- STEP 2 (01) — operations: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- inventory_transfers
UPDATE inventory_transfers SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_inventory_transfers_companyId ON inventory_transfers (companyId);

-- rawMaterialInventory
UPDATE rawMaterialInventory SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_rawMaterialInventory_companyId ON rawMaterialInventory (companyId);

-- inventoryLots
UPDATE inventoryLots SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_inventoryLots_companyId ON inventoryLots (companyId);

-- inventoryBalances
UPDATE inventoryBalances SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_inventoryBalances_companyId ON inventoryBalances (companyId);

-- inventoryAllocations
UPDATE inventoryAllocations SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_inventoryAllocations_companyId ON inventoryAllocations (companyId);

-- salesOrders
UPDATE salesOrders SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_salesOrders_companyId ON salesOrders (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_inventory_transfers_companyId ON inventory_transfers;
-- DROP INDEX idx_rawMaterialInventory_companyId ON rawMaterialInventory;
-- DROP INDEX idx_inventoryLots_companyId ON inventoryLots;
-- DROP INDEX idx_inventoryBalances_companyId ON inventoryBalances;
-- DROP INDEX idx_inventoryAllocations_companyId ON inventoryAllocations;
-- DROP INDEX idx_salesOrders_companyId ON salesOrders;

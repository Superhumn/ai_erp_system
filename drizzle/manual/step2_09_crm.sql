-- STEP 2 (09) — crm: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- crm_deals
UPDATE crm_deals SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_crm_deals_companyId ON crm_deals (companyId);

-- crm_email_campaigns
UPDATE crm_email_campaigns SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_crm_email_campaigns_companyId ON crm_email_campaigns (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_crm_deals_companyId ON crm_deals;
-- DROP INDEX idx_crm_email_campaigns_companyId ON crm_email_campaigns;

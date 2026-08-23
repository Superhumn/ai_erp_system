-- STEP 2 (10) — marketing: stamp entity ownership + backfill to US + index.
--
-- The nullable column + FK come from drizzle/schema.ts (pnpm db:push). This migration backfills
-- existing rows to the US operating entity (today's data) and adds the entity-first index.
-- The column is nullable for now; NOT NULL is enforced in a later pass once STEP 3 wires inserts
-- to always set it (spec rule: never break existing behaviour).

-- ============================== UP ==============================
-- social_accounts
UPDATE social_accounts SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_social_accounts_companyId ON social_accounts (companyId);

-- marketing_campaigns
UPDATE marketing_campaigns SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_marketing_campaigns_companyId ON marketing_campaigns (companyId);

-- marketing_posts
UPDATE marketing_posts SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_marketing_posts_companyId ON marketing_posts (companyId);

-- influencers
UPDATE influencers SET companyId = (SELECT id FROM companies WHERE code = 'US') WHERE companyId IS NULL;
CREATE INDEX idx_influencers_companyId ON influencers (companyId);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP INDEX idx_social_accounts_companyId ON social_accounts;
-- DROP INDEX idx_marketing_campaigns_companyId ON marketing_campaigns;
-- DROP INDEX idx_marketing_posts_companyId ON marketing_posts;
-- DROP INDEX idx_influencers_companyId ON influencers;

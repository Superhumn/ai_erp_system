-- Multi-entity rollout — STEP 5: rollup + intercompany elimination + ownership.
-- These are VIEWS (queries over the live rows) — NEVER copied or synced tables. The group view is
-- always a live query. Drizzle-kit can't manage views, so this is hand-authored SQL with a
-- reversible DOWN. The pure-TS equivalents live in server/groupReporting.ts (unit-tested).
--
-- P&L model: transaction type 'invoice' = revenue; 'expense'/'payment' = expense. amountFunc is the
-- entity's functional currency; amountGroup is the group currency (USD), frozen at txn date (STEP 4).

-- ============================== UP ==============================

-- Per entity, in its functional currency.
CREATE OR REPLACE VIEW v_entity_pnl AS
SELECT
  companyId,
  SUM(CASE WHEN type = 'invoice'              THEN amountFunc ELSE 0 END) AS revenueFunc,
  SUM(CASE WHEN type IN ('expense','payment') THEN amountFunc ELSE 0 END) AS expenseFunc,
  SUM(CASE WHEN type = 'invoice'              THEN amountFunc ELSE 0 END)
    - SUM(CASE WHEN type IN ('expense','payment') THEN amountFunc ELSE 0 END) AS netFunc
FROM transactions
WHERE status = 'posted' AND companyId IS NOT NULL
GROUP BY companyId;

-- All entities, group currency (USD), intercompany eliminated: any transaction that appears in an
-- intercompany link is internal (e.g. SA→US sale ↔ US purchase) and excluded.
CREATE OR REPLACE VIEW v_group_pnl AS
SELECT
  SUM(CASE WHEN type = 'invoice'              THEN amountGroup ELSE 0 END) AS revenueGroup,
  SUM(CASE WHEN type IN ('expense','payment') THEN amountGroup ELSE 0 END) AS expenseGroup,
  SUM(CASE WHEN type = 'invoice'              THEN amountGroup ELSE 0 END)
    - SUM(CASE WHEN type IN ('expense','payment') THEN amountGroup ELSE 0 END) AS netGroup
FROM transactions
WHERE status = 'posted'
  AND id NOT IN (
    SELECT transaction_a_id FROM intercompany_links
    UNION
    SELECT transaction_b_id FROM intercompany_links
  );

-- Effective % the ultimate parent owns of each entity, walking the tree and multiplying each hop.
-- Depth cap guards against a cycle in parentCompanyId.
CREATE OR REPLACE VIEW v_group_ownership AS
WITH RECURSIVE own AS (
  SELECT id AS entity_id, CAST(100.0 AS DECIMAL(18,6)) AS effective_pct, 0 AS depth
  FROM companies WHERE parentCompanyId IS NULL
  UNION ALL
  SELECT c.id,
         o.effective_pct * COALESCE(c.ownershipPctOfParent, 100) / 100,
         o.depth + 1
  FROM own o
  JOIN companies c ON c.parentCompanyId = o.entity_id
  WHERE o.depth < 64
)
SELECT entity_id, effective_pct FROM own;

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP VIEW IF EXISTS v_group_ownership;
-- DROP VIEW IF EXISTS v_group_pnl;
-- DROP VIEW IF EXISTS v_entity_pnl;

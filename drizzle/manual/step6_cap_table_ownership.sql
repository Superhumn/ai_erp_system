-- Multi-entity rollout — STEP 6: cap-table effective global ownership.
-- Each fundraise vehicle is an entity; equity grants carry companyId (the entity). An investor's
-- effective GLOBAL ownership = their share of the entity × the group's effective % of that entity
-- (v_group_ownership from STEP 5, which already compounds every hop up the tree). A live query,
-- never a copied table. Pure-TS equivalent: computeInvestorGlobalOwnership in server/groupReporting.ts.

-- ============================== UP ==============================
CREATE OR REPLACE VIEW v_investor_global_ownership AS
SELECT
  g.stakeholderId,
  g.companyId AS entity_id,
  SUM(g.shares) / NULLIF(tot.total_shares, 0) * 100                          AS local_pct,
  SUM(g.shares) / NULLIF(tot.total_shares, 0) * COALESCE(o.effective_pct, 0) AS global_pct
FROM equityGrants g
JOIN (
  SELECT companyId, SUM(shares) AS total_shares
  FROM equityGrants
  WHERE companyId IS NOT NULL
  GROUP BY companyId
) tot ON tot.companyId = g.companyId
LEFT JOIN v_group_ownership o ON o.entity_id = g.companyId
WHERE g.companyId IS NOT NULL
GROUP BY g.stakeholderId, g.companyId, tot.total_shares, o.effective_pct;

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP VIEW IF EXISTS v_investor_global_ownership;

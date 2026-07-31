-- Multi-entity rollout — STEP 1: entity tree
-- `companies` IS the entity table. The holding company + regional operating companies live
-- there, linked by parentCompanyId. This file holds what drizzle-kit cannot manage:
-- the recursive `entity_tree` view. The new `companies` columns come from drizzle/schema.ts
-- via the normal `pnpm db:push` (drizzle-kit generate && migrate).
--
-- Apply order: (1) pnpm db:push  (2) this file's UP  (3) tsx scripts/seed-entities.ts
-- Every statement here has a matching reversal in the DOWN section.

-- ============================== UP ==============================

-- entity_tree(entity_id, ancestor_id, depth): for each entity, its full ancestor chain
-- (itself at depth 0). "All descendants of X" = SELECT entity_id FROM entity_tree WHERE ancestor_id = X.
CREATE OR REPLACE VIEW entity_tree AS
WITH RECURSIVE t AS (
  SELECT id AS entity_id, id AS ancestor_id, 0 AS depth
  FROM companies
  UNION ALL
  SELECT t.entity_id, c.parentCompanyId AS ancestor_id, t.depth + 1
  FROM t
  JOIN companies c ON c.id = t.ancestor_id
  WHERE c.parentCompanyId IS NOT NULL
)
SELECT entity_id, ancestor_id, depth FROM t;

-- ============================== DOWN ==============================
-- Reverses STEP 1 in full (view + the columns added via schema.ts). Run manually to roll back.
--
-- DROP VIEW IF EXISTS entity_tree;
-- ALTER TABLE companies
--   DROP COLUMN ownershipPctOfParent,
--   DROP COLUMN countryCode,
--   DROP COLUMN entityType,
--   DROP COLUMN code;

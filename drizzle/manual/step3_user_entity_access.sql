-- Multi-entity rollout — STEP 3: user_entity_access (many-to-many user↔entity membership).
-- `scopedProcedure` queries this table on every request. The table is normally created from
-- drizzle/schema.ts via `pnpm db:push`; this file is an explicit, idempotent artifact for
-- environments that apply SQL directly, and documents the reversible DOWN. Deploy the table
-- BEFORE the middleware change — though getUserEntityAccessCompanyIds() also degrades gracefully
-- (falls back to legacy single-home scoping) if the table is temporarily absent.

-- ============================== UP ==============================
CREATE TABLE IF NOT EXISTS user_entity_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  companyId INT NOT NULL,
  role ENUM('user','admin','finance','ops','legal','exec','sales','copacker','vendor','contractor','investor') NOT NULL DEFAULT 'user',
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_entity_access_user FOREIGN KEY (userId) REFERENCES users(id),
  CONSTRAINT fk_user_entity_access_company FOREIGN KEY (companyId) REFERENCES companies(id),
  UNIQUE KEY uq_user_entity_access_user_company (userId, companyId)
);

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- DROP TABLE IF EXISTS user_entity_access;

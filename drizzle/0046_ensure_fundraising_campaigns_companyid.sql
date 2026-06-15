-- Migration 0046: Ensure fundraising_campaigns schema is correct.
-- Migration 0041 (which itself re-applied the never-journaled 0027 fix) was
-- assigned a regenerated, out-of-order `when` timestamp during a journal
-- rewrite. Drizzle's mysql2 migrator decides what to run by comparing each
-- journal entry's `when` against the latest timestamp recorded in
-- `__drizzle_migrations`, so 0041 was silently skipped on databases whose
-- recorded timestamp was already newer. The result: the `companyId` column was
-- never added, and `INSERT INTO fundraising_campaigns (..., companyId, ...)`
-- fails with "Unknown column 'companyId'" when creating a fundraising round.
--
-- This migration has a fresh (newest) timestamp so it is guaranteed to run, and
-- it is fully idempotent (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so we use a
-- stored procedure to guard the change).

DROP PROCEDURE IF EXISTS `_ensure_fundraising_campaigns_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_fundraising_campaigns_schema`()
BEGIN
  -- Add companyId if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'fundraising_campaigns'
      AND COLUMN_NAME = 'companyId'
  ) THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `companyId` int AFTER `id`;
  END IF;

  -- Make createdBy nullable (was NOT NULL in the original 0023 migration)
  ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `createdBy` int NULL;

  -- Make targetAmount nullable (was NOT NULL in the original 0023 migration)
  ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `targetAmount` decimal(15,2) NULL;

  -- Ensure roundType has a DEFAULT 'seed'
  ALTER TABLE `fundraising_campaigns`
    MODIFY COLUMN `roundType` enum('pre_seed','seed','series_a','series_b','series_c','bridge','other') NOT NULL DEFAULT 'seed';
END;
--> statement-breakpoint
CALL `_ensure_fundraising_campaigns_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_fundraising_campaigns_schema`;

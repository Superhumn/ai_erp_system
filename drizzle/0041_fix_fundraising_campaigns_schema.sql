-- Migration 0041: Fix fundraising_campaigns schema.
-- The original fix migration (0027_fix_fundraising_campaigns.sql) was never
-- added to the Drizzle journal and therefore was never applied to the database.
-- This migration idempotently applies all those changes using stored procedures
-- (MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS).

DROP PROCEDURE IF EXISTS `_fix_fundraising_campaigns`;
--> statement-breakpoint
CREATE PROCEDURE `_fix_fundraising_campaigns`()
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

  -- Make createdBy nullable (was NOT NULL in the original migration)
  ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `createdBy` int NULL;

  -- Make targetAmount nullable (was NOT NULL in the original migration)
  ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `targetAmount` decimal(15,2) NULL;

  -- Add DEFAULT 'seed' to roundType if it doesn't already have one
  ALTER TABLE `fundraising_campaigns`
    MODIFY COLUMN `roundType` enum('pre_seed','seed','series_a','series_b','series_c','bridge','other') NOT NULL DEFAULT 'seed';
END;
--> statement-breakpoint
CALL `_fix_fundraising_campaigns`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_fix_fundraising_campaigns`;

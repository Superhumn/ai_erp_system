-- Migration 0046: Ensure the fundraising_campaigns table matches the schema.
--
-- The production table was created with only a subset of the columns defined in
-- drizzle/schema.ts (the original 0023 CREATE TABLE and the 0027/0041 fixes
-- never fully applied). As a result INSERTs that reference columns such as
-- `companyId` and `createdBy` fail with "Unknown column ...", so creating a
-- fundraising round errors out.
--
-- This migration is fully idempotent: for every column the schema expects it
-- adds the column only if it is missing (MySQL 8.0 has no ADD COLUMN IF NOT
-- EXISTS, so each is guarded via INFORMATION_SCHEMA), then normalizes the
-- nullability/defaults that earlier partial migrations were meant to set. It is
-- safe to run repeatedly and against a table in any partial state. `id` and
-- `name` are intentionally not touched — they are the table's primary key and
-- required name and are always present.

DROP PROCEDURE IF EXISTS `_ensure_fundraising_campaigns_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_fundraising_campaigns_schema`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'companyId') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `companyId` int;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'description') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `description` text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'targetAmount') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `targetAmount` decimal(15,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'raisedAmount') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `raisedAmount` decimal(15,2) DEFAULT '0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'minimumInvestment') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `minimumInvestment` decimal(15,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'valuation') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `valuation` decimal(15,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'roundType') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `roundType` enum('pre_seed','seed','series_a','series_b','series_c','bridge','other') NOT NULL DEFAULT 'seed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'equityOffered') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `equityOffered` decimal(5,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'startDate') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `startDate` timestamp NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'targetCloseDate') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `targetCloseDate` timestamp NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'actualCloseDate') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `actualCloseDate` timestamp NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'status') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `status` enum('planning','active','paused','closed','cancelled') NOT NULL DEFAULT 'planning';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'dataRoomId') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `dataRoomId` int;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'notes') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `notes` text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'createdBy') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `createdBy` int;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'createdAt') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fundraising_campaigns' AND COLUMN_NAME = 'updatedAt') THEN
    ALTER TABLE `fundraising_campaigns` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;
  END IF;

  -- Normalize columns that earlier partial migrations were meant to relax /
  -- default. Safe now that every column above is guaranteed to exist.
  ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `createdBy` int NULL;
  ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `targetAmount` decimal(15,2) NULL;
  ALTER TABLE `fundraising_campaigns`
    MODIFY COLUMN `roundType` enum('pre_seed','seed','series_a','series_b','series_c','bridge','other') NOT NULL DEFAULT 'seed';
END;
--> statement-breakpoint
CALL `_ensure_fundraising_campaigns_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_fundraising_campaigns_schema`;

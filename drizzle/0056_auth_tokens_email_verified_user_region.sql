-- Migration 0056: schema pieces required for signup / password reset / multi-region.
--
-- Commit 011b1970 moved email verification + password-reset tokens from an
-- in-memory Map into a DB-backed `authTokens` table and added
-- `users.emailVerified`, but never shipped a migration. Signup calls
-- `getUserByEmail` (which SELECTs every users column) and then
-- `createAuthToken`, so a production DB without these objects fails with
-- "Unknown column 'emailVerified'" or "Table 'authTokens' doesn't exist".
--
-- Commit eb251bbd similarly added `users.companyId` / `users.regionScope`
-- and the `regions` table + company multi-region columns without a SQL
-- migration (it assumed `pnpm db:push`). Those missing columns also break
-- every users SELECT, including the signup duplicate-email check.
--
-- Idempotent: each ADD / CREATE is guarded via INFORMATION_SCHEMA so re-runs
-- are safe. Foreign keys are intentionally omitted so a partial deploy
-- cannot fail the migration if a referenced table is mid-backfill.

DROP PROCEDURE IF EXISTS `_ensure_auth_and_user_region_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_auth_and_user_region_schema`()
BEGIN
  -- regions (multi-region foundation)
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'regions'
  ) THEN
    CREATE TABLE `regions` (
      `id` int AUTO_INCREMENT NOT NULL,
      `code` varchar(16) NOT NULL,
      `name` varchar(128) NOT NULL,
      `baseCurrency` varchar(3) NOT NULL DEFAULT 'USD',
      `status` enum('active','inactive') NOT NULL DEFAULT 'active',
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT `regions_id` PRIMARY KEY(`id`),
      CONSTRAINT `regions_code_unique` UNIQUE(`code`)
    );
  END IF;

  -- companies multi-region columns
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'regionId'
    ) THEN
      ALTER TABLE `companies` ADD COLUMN `regionId` int;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'functionalCurrency'
    ) THEN
      ALTER TABLE `companies` ADD COLUMN `functionalCurrency` varchar(3) NOT NULL DEFAULT 'USD';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'locale'
    ) THEN
      ALTER TABLE `companies` ADD COLUMN `locale` varchar(10) NOT NULL DEFAULT 'en-US';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'timezone'
    ) THEN
      ALTER TABLE `companies` ADD COLUMN `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'taxRegime'
    ) THEN
      ALTER TABLE `companies` ADD COLUMN `taxRegime` enum('vat','gst','sales_tax','none') NOT NULL DEFAULT 'none';
    END IF;
  END IF;

  -- users columns used by auth + multi-region scoping
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'emailVerified'
    ) THEN
      ALTER TABLE `users` ADD COLUMN `emailVerified` boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'companyId'
    ) THEN
      ALTER TABLE `users` ADD COLUMN `companyId` int;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'regionScope'
    ) THEN
      ALTER TABLE `users` ADD COLUMN `regionScope` enum('entity','region','global') NOT NULL DEFAULT 'global';
    END IF;
  END IF;

  -- authTokens (email verification + password reset)
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'authTokens'
  ) THEN
    CREATE TABLE `authTokens` (
      `token` varchar(128) NOT NULL,
      `type` enum('email_verification','password_reset') NOT NULL,
      `email` varchar(320) NOT NULL,
      `expiresAt` timestamp NOT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT `authTokens_token` PRIMARY KEY(`token`)
    );
  END IF;
END;
--> statement-breakpoint
CALL `_ensure_auth_and_user_region_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_auth_and_user_region_schema`;

-- Migration 0047: Ensure the subsidiary_fundraising_* tables match the schema.
--
-- Like fundraising_campaigns, the subsidiary_fundraising_rounds and
-- subsidiary_fundraising_investors tables were created with only a subset of
-- the columns defined in drizzle/schema.ts, so creating a subsidiary round
-- fails with "Unknown column ..." (e.g. parentCompanyId / valuations /
-- ownership percentages).
--
-- This migration is fully idempotent: it only touches a table if it exists, and
-- for each expected column it adds the column only when missing (MySQL 8.0 has
-- no ADD COLUMN IF NOT EXISTS, so each is guarded via INFORMATION_SCHEMA). All
-- added columns are nullable or have defaults, so existing rows are safe.
-- Foreign keys are intentionally NOT added here (not needed for inserts; avoids
-- failures if referenced rows/constraints differ). Core columns that must
-- already exist (id, subsidiaryCompanyId, name, roundType / roundId,
-- investorName) are left untouched.

DROP PROCEDURE IF EXISTS `_ensure_subsidiary_fundraising_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_subsidiary_fundraising_schema`()
BEGIN
  -- ---- subsidiary_fundraising_rounds ----
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds') THEN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'parentCompanyId') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `parentCompanyId` int;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'targetAmount') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `targetAmount` decimal(18,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'raisedAmount') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `raisedAmount` decimal(18,2) DEFAULT '0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'currency') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `currency` varchar(3) DEFAULT 'USD';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'preMoneyValuation') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `preMoneyValuation` decimal(18,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'postMoneyValuation') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `postMoneyValuation` decimal(18,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'parentOwnershipPctBefore') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `parentOwnershipPctBefore` decimal(6,3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'parentOwnershipPctAfter') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `parentOwnershipPctAfter` decimal(6,3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'leadInvestorName') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `leadInvestorName` varchar(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'openedDate') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `openedDate` timestamp NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'closedDate') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `closedDate` timestamp NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'status') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `status` enum('planning','open','closing','closed','cancelled') NOT NULL DEFAULT 'planning';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'notes') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `notes` text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'createdBy') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `createdBy` int;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'createdAt') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds' AND COLUMN_NAME = 'updatedAt') THEN
      ALTER TABLE `subsidiary_fundraising_rounds` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;
    END IF;
  END IF;

  -- ---- subsidiary_fundraising_investors ----
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors') THEN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'investorType') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `investorType` enum('individual','angel','vc','pe','corporate','government','family_office','crowd','strategic','employee','other') NOT NULL DEFAULT 'individual';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'email') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `email` varchar(320);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'phone') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `phone` varchar(32);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'country') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `country` varchar(8);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'commitmentAmount') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `commitmentAmount` decimal(18,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'fundedAmount') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `fundedAmount` decimal(18,2) DEFAULT '0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'currency') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `currency` varchar(3) DEFAULT 'USD';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'ownershipPct') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `ownershipPct` decimal(6,3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'status') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `status` enum('introduced','in_diligence','term_sheet','committed','wired','closed','declined','lapsed') NOT NULL DEFAULT 'introduced';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'contactId') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `contactId` int;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'notes') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `notes` text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'createdAt') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors' AND COLUMN_NAME = 'updatedAt') THEN
      ALTER TABLE `subsidiary_fundraising_investors` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;
    END IF;
  END IF;
END;
--> statement-breakpoint
CALL `_ensure_subsidiary_fundraising_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_subsidiary_fundraising_schema`;

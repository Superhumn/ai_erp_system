-- Migration 0055: Ensure investor_investments has the columns the schema expects.
--
-- investor_investments links a CRM investor to a fundraising round
-- (investorId + campaignId). Surfacing that link in the Fundraising UI inserts
-- rows referencing campaignId/currency/notes, so guard against the same
-- partial-table drift seen with fundraising_campaigns: idempotently add any
-- missing columns (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so each is
-- guarded via INFORMATION_SCHEMA). Core columns (id, investorId, amount) are
-- assumed present. Safe to re-run.

DROP PROCEDURE IF EXISTS `_ensure_investor_investments_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_investor_investments_schema`()
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investor_investments') THEN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investor_investments' AND COLUMN_NAME = 'campaignId') THEN
      ALTER TABLE `investor_investments` ADD COLUMN `campaignId` int;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investor_investments' AND COLUMN_NAME = 'currency') THEN
      ALTER TABLE `investor_investments` ADD COLUMN `currency` varchar(8) DEFAULT 'USD';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investor_investments' AND COLUMN_NAME = 'investedAt') THEN
      ALTER TABLE `investor_investments` ADD COLUMN `investedAt` timestamp NOT NULL DEFAULT (now());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investor_investments' AND COLUMN_NAME = 'notes') THEN
      ALTER TABLE `investor_investments` ADD COLUMN `notes` text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investor_investments' AND COLUMN_NAME = 'createdAt') THEN
      ALTER TABLE `investor_investments` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());
    END IF;
  END IF;
END;
--> statement-breakpoint
CALL `_ensure_investor_investments_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_investor_investments_schema`;

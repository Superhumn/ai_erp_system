-- 0070_bank_payment_reconciliation
--
-- Bank-to-payment reconciliation (appRouter.banking.reconciliation). Each
-- Mercury bank line can be tied to exactly one `payments` row
-- (`matchedPaymentId`, unique so one payment never clears two bank lines) and
-- carries a reconciliation status plus who/when reconciled it.
--
-- `bank_transactions` itself was never created by a migration (only by
-- scripts/ensure-tables.ts), so CREATE IF NOT EXISTS first for fresh
-- environments, then guarded ADD COLUMN / ADD INDEX for databases that already
-- carry the table (MySQL 8 has no ADD COLUMN IF NOT EXISTS). Re-runnable.

CREATE TABLE IF NOT EXISTS `bank_transactions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `externalId` varchar(128),
  `accountName` varchar(256),
  `accountId` varchar(128),
  `date` timestamp NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `type` enum('debit','credit') NOT NULL,
  `description` varchar(512),
  `counterpartyName` varchar(256),
  `status` varchar(64),
  `category` varchar(128),
  `accountCode` varchar(32),
  `categorizationStatus` enum('uncategorized','ai_suggested','confirmed','manual') DEFAULT 'uncategorized',
  `aiConfidence` int,
  `matchedInvoiceId` int,
  `matchedPurchaseOrderId` int,
  `matchedVendorId` int,
  `matchedCustomerId` int,
  `matchedPaymentId` int,
  `reconciliationStatus` enum('unreconciled','suggested','reconciled','excluded') NOT NULL DEFAULT 'unreconciled',
  `reconciledAt` timestamp NULL,
  `reconciledBy` int,
  `syncedToQuickbooks` boolean DEFAULT false,
  `source` enum('mercury','quickbooks','manual') DEFAULT 'mercury',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `bank_transactions_id` PRIMARY KEY(`id`),
  CONSTRAINT `bank_transactions_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0070_bank_payment_reconciliation`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0070_bank_payment_reconciliation`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_transactions' AND COLUMN_NAME = 'matchedPaymentId') THEN
    ALTER TABLE `bank_transactions` ADD COLUMN `matchedPaymentId` int AFTER `matchedCustomerId`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_transactions' AND COLUMN_NAME = 'reconciliationStatus') THEN
    ALTER TABLE `bank_transactions` ADD COLUMN `reconciliationStatus` enum('unreconciled','suggested','reconciled','excluded') NOT NULL DEFAULT 'unreconciled' AFTER `matchedPaymentId`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_transactions' AND COLUMN_NAME = 'reconciledAt') THEN
    ALTER TABLE `bank_transactions` ADD COLUMN `reconciledAt` timestamp NULL AFTER `reconciliationStatus`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_transactions' AND COLUMN_NAME = 'reconciledBy') THEN
    ALTER TABLE `bank_transactions` ADD COLUMN `reconciledBy` int AFTER `reconciledAt`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_transactions' AND INDEX_NAME = 'idx_bank_transactions_reconciliation_status') THEN
    ALTER TABLE `bank_transactions` ADD INDEX `idx_bank_transactions_reconciliation_status` (`reconciliationStatus`);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_transactions' AND INDEX_NAME = 'uq_bank_transactions_matched_payment') THEN
    ALTER TABLE `bank_transactions` ADD UNIQUE INDEX `uq_bank_transactions_matched_payment` (`matchedPaymentId`);
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0070_bank_payment_reconciliation`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0070_bank_payment_reconciliation`;

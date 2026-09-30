-- 0073_cash_forecast_channels
--
--  * cash_notification_channels: Slack / Google Chat / WhatsApp / email /
--    webhook destinations for the Monday cash digest and low-cash alerts.
--  * bills.autopay, vendors.autopay: direct-debit flags so the forecast
--    pays those bills on the due date exactly instead of on vendor behaviour.
--
-- Backed by drizzle/schema.ts. Re-runnable.

CREATE TABLE IF NOT EXISTS `cash_notification_channels` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `scopeKey` varchar(64) NOT NULL DEFAULT 'global',
  `type` enum('slack','google_chat','whatsapp','email','webhook') NOT NULL,
  `label` varchar(120),
  `target` varchar(1024) NOT NULL,
  `sendDigest` boolean NOT NULL DEFAULT true,
  `sendAlerts` boolean NOT NULL DEFAULT true,
  `isActive` boolean NOT NULL DEFAULT true,
  `lastSentAt` timestamp NULL,
  `lastError` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cash_notification_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0073_autopay`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0073_autopay`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bills' AND COLUMN_NAME = 'autopay') THEN
    ALTER TABLE `bills` ADD COLUMN `autopay` boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'autopay') THEN
    ALTER TABLE `vendors` ADD COLUMN `autopay` boolean NOT NULL DEFAULT false;
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0073_autopay`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0073_autopay`;

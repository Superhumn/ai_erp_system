-- 0072_cash_forecast
--
-- Rolling 13-week cash forecast, second pass:
--  * recurring_expenses: fixed outflows the ledger can't see (rent, SaaS,
--    insurance, retainers, loan payments).
--  * cash_forecast_scenarios: saved what-if cases with AR/AP slip knobs and
--    manual items, stored server-side instead of in the browser.
--  * cash_forecast_snapshots: one frozen forecast per week, graded later
--    against bank_transactions.
--  * bank_account_entity_map: which entity each Mercury account belongs to.
--  * cash_forecast_alert_settings: low-cash floor and who to email.
--
-- Backed by drizzle/schema.ts. Re-runnable.

CREATE TABLE IF NOT EXISTS `recurring_expenses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `name` varchar(255) NOT NULL,
  `category` varchar(64) NOT NULL DEFAULT 'other',
  `vendorId` int,
  `amount` decimal(15,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'USD',
  `frequency` enum('weekly','biweekly','monthly','quarterly','annually') NOT NULL,
  `dayOfMonth` int,
  `nextDate` timestamp NOT NULL,
  `endDate` timestamp NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recurring_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cash_forecast_scenarios` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `name` varchar(120) NOT NULL,
  `description` text,
  `params` json NOT NULL,
  `isDefault` boolean NOT NULL DEFAULT false,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cash_forecast_scenarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cash_forecast_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `scopeKey` varchar(64) NOT NULL DEFAULT 'global',
  `asOf` timestamp NOT NULL,
  `weekStart` timestamp NOT NULL,
  `startingCash` decimal(15,2) NOT NULL,
  `weeks` json NOT NULL,
  `totalIn` decimal(15,2) NOT NULL,
  `totalOut` decimal(15,2) NOT NULL,
  `endingCash` decimal(15,2) NOT NULL,
  `lowestCash` decimal(15,2) NOT NULL,
  `source` enum('scheduled','manual') NOT NULL DEFAULT 'scheduled',
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `cash_forecast_snapshots_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_cash_forecast_snapshots_scope_week` UNIQUE(`scopeKey`,`weekStart`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `bank_account_entity_map` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `provider` varchar(32) NOT NULL DEFAULT 'mercury',
  `externalAccountId` varchar(128) NOT NULL,
  `accountName` varchar(256),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bank_account_entity_map_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_bank_account_entity_map_account` UNIQUE(`provider`,`externalAccountId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cash_forecast_alert_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `scopeKey` varchar(64) NOT NULL DEFAULT 'global',
  `thresholdAmount` decimal(15,2) NOT NULL,
  `recipients` json NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `lastAlertedAt` timestamp NULL,
  `lastAlertLowestCash` decimal(15,2),
  `updatedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cash_forecast_alert_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_cash_forecast_alert_settings_scope` UNIQUE(`scopeKey`)
);

-- 0073_crm_upgrade
--
-- CRM upgrade, phase 1:
--  * entity scoping for the CRM reference tables (companyId on crm_tags,
--    crm_pipelines, crm_interactions, contact_captures)
--  * crm_accounts (customer organisations with hierarchy) + accountId on
--    crm_contacts / crm_deals
--
-- Backed by drizzle/schema.ts. Re-runnable: tables use CREATE IF NOT EXISTS
-- and column additions run inside a guarded procedure (MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS `crm_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `name` varchar(255) NOT NULL,
  `type` enum('district','school','distributor','operator','gpo','other') NOT NULL DEFAULT 'other',
  `parentAccountId` int,
  `region` varchar(128),
  `mealCount` int,
  `externalId` varchar(128),
  `customerId` int,
  `website` varchar(512),
  `notes` text,
  `assignedTo` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `crm_accounts_id` PRIMARY KEY(`id`),
  INDEX `idx_crm_accounts_company` (`companyId`),
  INDEX `idx_crm_accounts_parent` (`parentAccountId`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0073_crm_upgrade`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0073_crm_upgrade`()
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_tags')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_tags' AND COLUMN_NAME = 'companyId') THEN
    ALTER TABLE `crm_tags` ADD COLUMN `companyId` int AFTER `id`;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_pipelines')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_pipelines' AND COLUMN_NAME = 'companyId') THEN
    ALTER TABLE `crm_pipelines` ADD COLUMN `companyId` int AFTER `id`;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_interactions')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_interactions' AND COLUMN_NAME = 'companyId') THEN
    ALTER TABLE `crm_interactions` ADD COLUMN `companyId` int AFTER `id`;
    UPDATE `crm_interactions` i JOIN `crm_contacts` c ON c.`id` = i.`contactId` SET i.`companyId` = c.`companyId` WHERE i.`companyId` IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact_captures')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact_captures' AND COLUMN_NAME = 'companyId') THEN
    ALTER TABLE `contact_captures` ADD COLUMN `companyId` int AFTER `id`;
    UPDATE `contact_captures` cc JOIN `crm_contacts` c ON c.`id` = cc.`contactId` SET cc.`companyId` = c.`companyId` WHERE cc.`companyId` IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contacts')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contacts' AND COLUMN_NAME = 'accountId') THEN
    ALTER TABLE `crm_contacts` ADD COLUMN `accountId` int AFTER `organization`;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals' AND COLUMN_NAME = 'accountId') THEN
    ALTER TABLE `crm_deals` ADD COLUMN `accountId` int AFTER `contactId`;
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0073_crm_upgrade`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0073_crm_upgrade`;

-- 0074_crm_upgrade
--
-- CRM upgrade:
--  * entity scoping for the CRM reference tables (companyId on crm_tags,
--    crm_pipelines, crm_interactions, contact_captures)
--  * crm_accounts (customer organisations with hierarchy) + accountId on
--    crm_contacts / crm_deals, backfilled from crm_contacts.organization
--  * crm_pipeline_stages (typed stages replacing the JSON array, backfilled
--    below) and crm_deal_stage_history
--  * crm_deal_contacts, crm_deal_items, crm_loss_reasons (seeded), crm_tasks
--  * lossReasonId, wonReason, isStale on crm_deals
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
  `state` varchar(64),
  `mealsPerDay` int,
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
CREATE TABLE IF NOT EXISTS `crm_pipeline_stages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `pipelineId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `defaultProbability` int NOT NULL DEFAULT 10,
  `isWon` boolean NOT NULL DEFAULT false,
  `isLost` boolean NOT NULL DEFAULT false,
  `rottingDays` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `crm_pipeline_stages_id` PRIMARY KEY(`id`),
  INDEX `idx_crm_pipeline_stages_pipeline` (`pipelineId`,`sortOrder`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_deal_stage_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `dealId` int NOT NULL,
  `fromStage` varchar(64),
  `toStage` varchar(64) NOT NULL,
  `changedAt` timestamp NOT NULL DEFAULT (now()),
  `changedBy` int,
  CONSTRAINT `crm_deal_stage_history_id` PRIMARY KEY(`id`),
  INDEX `idx_crm_deal_stage_history_deal` (`dealId`,`changedAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_deal_contacts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `dealId` int NOT NULL,
  `contactId` int NOT NULL,
  `role` enum('decision_maker','champion','procurement','influencer','blocker','other') NOT NULL DEFAULT 'other',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `crm_deal_contacts_id` PRIMARY KEY(`id`),
  CONSTRAINT `crm_deal_contacts_deal_contact_uniq` UNIQUE(`dealId`,`contactId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_deal_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `dealId` int NOT NULL,
  `productId` int,
  `description` varchar(255) NOT NULL,
  `quantity` decimal(15,3) NOT NULL DEFAULT '1',
  `unit` varchar(32) DEFAULT 'case',
  `unitPrice` decimal(15,4) NOT NULL DEFAULT '0',
  `annualVolume` decimal(15,3),
  `totalAmount` decimal(15,2) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `crm_deal_items_id` PRIMARY KEY(`id`),
  INDEX `idx_crm_deal_items_deal` (`dealId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_loss_reasons` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `name` varchar(128) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `crm_loss_reasons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `title` varchar(255) NOT NULL,
  `type` enum('call','email','meeting','follow_up','todo') NOT NULL DEFAULT 'todo',
  `contactId` int,
  `dealId` int,
  `accountId` int,
  `dueAt` timestamp NULL,
  `reminderAt` timestamp NULL,
  `reminderSentAt` timestamp NULL,
  `assignedTo` int,
  `completedAt` timestamp NULL,
  `createdBy` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `crm_tasks_id` PRIMARY KEY(`id`),
  INDEX `idx_crm_tasks_assignee_due` (`assignedTo`,`completedAt`,`dueAt`),
  INDEX `idx_crm_tasks_deal` (`dealId`)
);
--> statement-breakpoint
INSERT INTO `crm_loss_reasons` (`companyId`, `name`, `sortOrder`)
SELECT NULL, v.name, v.ord FROM (
  SELECT 'Price' AS name, 0 AS ord UNION ALL
  SELECT 'Chose incumbent', 1 UNION ALL
  SELECT 'No budget this cycle', 2 UNION ALL
  SELECT 'Bid timing', 3 UNION ALL
  SELECT 'Product fit', 4 UNION ALL
  SELECT 'Distributor not carrying', 5 UNION ALL
  SELECT 'No decision', 6
) v
WHERE NOT EXISTS (SELECT 1 FROM `crm_loss_reasons` r WHERE r.`companyId` IS NULL AND r.`name` = v.name);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0074_crm_upgrade`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0074_crm_upgrade`()
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
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals' AND COLUMN_NAME = 'lossReasonId') THEN
    ALTER TABLE `crm_deals` ADD COLUMN `lossReasonId` int AFTER `lostReason`;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals' AND COLUMN_NAME = 'wonReason') THEN
    ALTER TABLE `crm_deals` ADD COLUMN `wonReason` varchar(500) AFTER `lossReasonId`;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals')
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals' AND COLUMN_NAME = 'isStale') THEN
    ALTER TABLE `crm_deals` ADD COLUMN `isStale` boolean NOT NULL DEFAULT false AFTER `wonReason`;
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0074_crm_upgrade`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0074_crm_upgrade`;
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0074_crm_stage_backfill`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0074_crm_stage_backfill`()
BEGIN
  -- One crm_pipeline_stages row per name in each pipeline's JSON `stages`
  -- array (pipelines that already have stage rows are skipped). Probabilities:
  -- first regular stage 10, then evenly up to 90; a stage whose name contains
  -- "won" gets 100, "lost" gets 0. A malformed JSON column must not break boot,
  -- so failures are swallowed — server/crmService.ts re-seeds lazily anyway.
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
  INSERT INTO `crm_pipeline_stages` (`companyId`, `pipelineId`, `name`, `sortOrder`, `defaultProbability`, `isWon`, `isLost`)
  SELECT x.companyId, x.pipelineId, x.name, x.sortOrder,
    CASE
      WHEN x.isWon THEN 100
      WHEN x.isLost THEN 0
      WHEN x.regularCount <= 1 THEN 10
      ELSE ROUND(10 + 80 * (x.regularIdx - 1) / (x.regularCount - 1))
    END,
    x.isWon, x.isLost
  FROM (
    SELECT p.companyId, p.id AS pipelineId, jt.name, jt.ord - 1 AS sortOrder,
      (LOWER(jt.name) LIKE '%won%') AS isWon,
      (LOWER(jt.name) LIKE '%lost%' AND LOWER(jt.name) NOT LIKE '%won%') AS isLost,
      SUM(CASE WHEN LOWER(jt.name) LIKE '%won%' OR LOWER(jt.name) LIKE '%lost%' THEN 0 ELSE 1 END) OVER (PARTITION BY p.id) AS regularCount,
      SUM(CASE WHEN LOWER(jt.name) LIKE '%won%' OR LOWER(jt.name) LIKE '%lost%' THEN 0 ELSE 1 END) OVER (PARTITION BY p.id ORDER BY jt.ord) AS regularIdx
    FROM (SELECT * FROM `crm_pipelines` WHERE JSON_VALID(`stages`) AND JSON_TYPE(`stages`) = 'ARRAY') p
    JOIN JSON_TABLE(p.stages, '$[*]' COLUMNS (`ord` FOR ORDINALITY, `name` VARCHAR(128) PATH '$')) jt
    WHERE jt.name IS NOT NULL AND jt.name <> ''
  ) x
  WHERE NOT EXISTS (SELECT 1 FROM `crm_pipeline_stages` s WHERE s.`pipelineId` = x.pipelineId);
END;
--> statement-breakpoint
CALL `_migrate_0074_crm_stage_backfill`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0074_crm_stage_backfill`;
--> statement-breakpoint
-- Accounts backfill: one crm_accounts row per distinct non-empty
-- crm_contacts.organization per companyId (case-insensitive, trimmed), then
-- link contacts and their deals. Re-runnable: existing accounts with the same
-- name + companyId are reused and already-linked rows are left alone.
-- crm.accounts.backfill runs the same logic on demand.
INSERT INTO `crm_accounts` (`companyId`, `name`, `type`)
SELECT o.companyId, o.name, 'other' FROM (
  SELECT c.`companyId` AS companyId, MIN(TRIM(c.`organization`)) AS name
  FROM `crm_contacts` c
  WHERE c.`organization` IS NOT NULL AND TRIM(c.`organization`) <> ''
  GROUP BY c.`companyId`, LOWER(TRIM(c.`organization`))
) o
WHERE NOT EXISTS (
  SELECT 1 FROM `crm_accounts` a
  WHERE a.`companyId` <=> o.companyId AND LOWER(a.`name`) = LOWER(o.name)
);
--> statement-breakpoint
UPDATE `crm_contacts` c
JOIN `crm_accounts` a
  ON a.`companyId` <=> c.`companyId` AND LOWER(a.`name`) = LOWER(TRIM(c.`organization`))
SET c.`accountId` = a.`id`
WHERE c.`accountId` IS NULL AND c.`organization` IS NOT NULL AND TRIM(c.`organization`) <> '';
--> statement-breakpoint
UPDATE `crm_deals` d
JOIN `crm_contacts` c ON c.`id` = d.`contactId`
SET d.`accountId` = c.`accountId`
WHERE d.`accountId` IS NULL AND c.`accountId` IS NOT NULL;

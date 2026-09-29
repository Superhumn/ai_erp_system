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
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0073_crm_stage_backfill`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0073_crm_stage_backfill`()
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
CALL `_migrate_0073_crm_stage_backfill`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0073_crm_stage_backfill`;

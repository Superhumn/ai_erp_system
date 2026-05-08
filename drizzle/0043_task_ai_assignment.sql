-- Migration 0043: Unified task assignment (Human + AI).
-- Extends project_tasks so any task can be assigned to a human user or to an
-- AI agent (tracked via aiAgentTasks). Also adds Lightfield-style CRM linkage
-- (account / opportunity) and source provenance (manual/email/meeting/...) so
-- tasks can be auto-generated from inbox threads, meeting transcripts, or CRM
-- deals while flowing through the same Projects UI and approval queue.
--
-- Originally numbered 0033 — collided with 0033_recipe_copacker_shares and was
-- silently dropped from the journal, so the columns were never added in prod.
-- Renumbered to 0043 and rewritten as INFORMATION_SCHEMA-guarded so a fresh-DB
-- replay reaches the same state and re-runs on prod are no-ops.

DROP PROCEDURE IF EXISTS `_add_task_ai_assignment`;
--> statement-breakpoint
CREATE PROCEDURE `_add_task_ai_assignment`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'assigneeType'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `assigneeType` enum('human','ai_agent') NOT NULL DEFAULT 'human' AFTER `assigneeId`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'assigneeAgentTaskId'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `assigneeAgentTaskId` int NULL AFTER `assigneeType`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'accountId'
  ) THEN
    ALTER TABLE `project_tasks` ADD COLUMN `accountId` int NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'opportunityId'
  ) THEN
    ALTER TABLE `project_tasks` ADD COLUMN `opportunityId` int NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceType'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `sourceType` enum('manual','email','meeting','ai_generated','crm_deal') NOT NULL DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceRefType'
  ) THEN
    ALTER TABLE `project_tasks` ADD COLUMN `sourceRefType` varchar(64) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceRefId'
  ) THEN
    ALTER TABLE `project_tasks` ADD COLUMN `sourceRefId` int NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'aiReasoning'
  ) THEN
    ALTER TABLE `project_tasks` ADD COLUMN `aiReasoning` text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'aiConfidence'
  ) THEN
    ALTER TABLE `project_tasks` ADD COLUMN `aiConfidence` decimal(5,2) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND INDEX_NAME = 'project_tasks_assigneeType_idx'
  ) THEN
    CREATE INDEX `project_tasks_assigneeType_idx` ON `project_tasks` (`assigneeType`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND INDEX_NAME = 'project_tasks_assigneeAgentTaskId_idx'
  ) THEN
    CREATE INDEX `project_tasks_assigneeAgentTaskId_idx` ON `project_tasks` (`assigneeAgentTaskId`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND INDEX_NAME = 'project_tasks_accountId_idx'
  ) THEN
    CREATE INDEX `project_tasks_accountId_idx` ON `project_tasks` (`accountId`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND INDEX_NAME = 'project_tasks_opportunityId_idx'
  ) THEN
    CREATE INDEX `project_tasks_opportunityId_idx` ON `project_tasks` (`opportunityId`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND INDEX_NAME = 'project_tasks_source_idx'
  ) THEN
    CREATE INDEX `project_tasks_source_idx` ON `project_tasks` (`sourceType`, `sourceRefType`, `sourceRefId`);
  END IF;

  -- Composite index on (sourceType, sourceExternalId) — sourceExternalId is
  -- added by 0034, sourceType by this migration, so the index has to live
  -- here to be safe on fresh-DB replay.
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND INDEX_NAME = 'project_tasks_sourceExternalId_idx'
  ) THEN
    CREATE INDEX `project_tasks_sourceExternalId_idx` ON `project_tasks` (`sourceType`, `sourceExternalId`);
  END IF;
END;
--> statement-breakpoint
CALL `_add_task_ai_assignment`();
--> statement-breakpoint
DROP PROCEDURE `_add_task_ai_assignment`;

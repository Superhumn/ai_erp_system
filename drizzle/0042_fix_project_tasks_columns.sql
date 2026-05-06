-- Migration 0042: Fix project_tasks missing columns.
-- The original migration (0033_task_ai_assignment.sql) was never added to the
-- Drizzle journal and therefore was never applied to the database.
-- This migration idempotently applies all those changes using stored procedures
-- (MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS).

DROP PROCEDURE IF EXISTS `_fix_project_tasks_columns`;
--> statement-breakpoint
CREATE PROCEDURE `_fix_project_tasks_columns`()
BEGIN
  -- assigneeType
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'assigneeType'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `assigneeType` enum('human','ai_agent') NOT NULL DEFAULT 'human';
  END IF;

  -- assigneeAgentTaskId
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'assigneeAgentTaskId'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `assigneeAgentTaskId` int NULL;
  END IF;

  -- accountId
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'accountId'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `accountId` int NULL;
  END IF;

  -- opportunityId
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'opportunityId'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `opportunityId` int NULL;
  END IF;

  -- sourceType
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceType'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `sourceType` enum('manual','email','meeting','ai_generated','crm_deal') NOT NULL DEFAULT 'manual';
  END IF;

  -- sourceRefType
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceRefType'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `sourceRefType` varchar(64) NULL;
  END IF;

  -- sourceRefId
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceRefId'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `sourceRefId` int NULL;
  END IF;

  -- aiReasoning
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'aiReasoning'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `aiReasoning` text NULL;
  END IF;

  -- aiConfidence
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'aiConfidence'
  ) THEN
    ALTER TABLE `project_tasks`
      ADD COLUMN `aiConfidence` decimal(5,2) NULL;
  END IF;

  -- Indexes (use IF NOT EXISTS on the STATISTICS table to guard against re-runs)
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

  -- Also ensure the index from 0034_task_source_external_id.sql exists.
  -- That migration referenced sourceType which may not have existed when it ran,
  -- causing the index creation to fail silently.
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceExternalId'
  ) AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND INDEX_NAME = 'project_tasks_sourceExternalId_idx'
  ) THEN
    CREATE INDEX `project_tasks_sourceExternalId_idx` ON `project_tasks` (`sourceType`, `sourceExternalId`);
  END IF;
END;
--> statement-breakpoint
CALL `_fix_project_tasks_columns`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_fix_project_tasks_columns`;

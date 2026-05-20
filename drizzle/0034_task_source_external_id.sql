-- Migration 0034: Add sourceExternalId for durable dedup of auto-generated tasks.
-- Email Message-IDs, Fireflies recording URLs, etc. are strings and can't fit
-- in project_tasks.sourceRefId (int). Dedup on (sourceType, sourceExternalId).
--
-- This migration was registered in the journal but its ALTER never reached the
-- live DB (it depended on the columns from 0033_task_ai_assignment, which was
-- silently dropped from the journal due to a migration-number collision and is
-- now reapplied as 0043). Rewritten as INFORMATION_SCHEMA-guarded so the
-- recovery run is idempotent.

DROP PROCEDURE IF EXISTS `_add_task_source_external_id`;
--> statement-breakpoint
CREATE PROCEDURE `_add_task_source_external_id`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_tasks'
      AND COLUMN_NAME = 'sourceExternalId'
  ) THEN
    ALTER TABLE `project_tasks` ADD COLUMN `sourceExternalId` varchar(255) NULL;
  END IF;

  -- The composite (sourceType, sourceExternalId) index is created in 0043
  -- once sourceType exists. Putting it here would fail on a fresh-DB replay
  -- because 0034 runs before 0043.
END;
--> statement-breakpoint
CALL `_add_task_source_external_id`();
--> statement-breakpoint
DROP PROCEDURE `_add_task_source_external_id`;

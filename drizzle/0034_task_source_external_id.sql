-- Migration 0034: Add sourceExternalId for durable dedup of auto-generated tasks
-- Email Message-IDs, Fireflies recording URLs, etc. are strings and can't fit
-- in project_tasks.sourceRefId (int). Dedup on (sourceType, sourceExternalId).

ALTER TABLE `project_tasks`
  ADD COLUMN `sourceExternalId` varchar(255) NULL;

CREATE INDEX `project_tasks_sourceExternalId_idx` ON `project_tasks` (`sourceType`, `sourceExternalId`);

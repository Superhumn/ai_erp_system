-- Migration 0053: Generic background-task tracking.
-- Adds the `background_tasks` table used to record long-running, user-initiated
-- operations (e.g. Data Room ↔ Google Drive sync) that run detached from the
-- originating request. The client polls this table so in-flight work is visible
-- anywhere in the app and survives navigating away from the page that started it.
--
-- Uses CREATE TABLE / INDEX IF NOT EXISTS so a fresh-DB replay reaches the same
-- end state and re-runs on prod are no-ops.

CREATE TABLE IF NOT EXISTS `background_tasks` (
  `id` varchar(36) NOT NULL,
  `userId` int NOT NULL,
  `type` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` varchar(500),
  `status` enum('queued','running','success','error','cancelled') NOT NULL DEFAULT 'queued',
  `progress` int NOT NULL DEFAULT 0,
  `processed` int NOT NULL DEFAULT 0,
  `total` int NOT NULL DEFAULT 0,
  `message` varchar(500),
  `entityType` varchar(64),
  `entityId` int,
  `link` varchar(512),
  `result` json,
  `errorMessage` text,
  `cancelRequested` boolean NOT NULL DEFAULT false,
  `dismissedAt` timestamp NULL,
  `startedAt` timestamp NULL,
  `finishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `background_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_add_background_tasks_indexes`;
--> statement-breakpoint
CREATE PROCEDURE `_add_background_tasks_indexes`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'background_tasks'
      AND INDEX_NAME = 'background_tasks_user_status_idx'
  ) THEN
    CREATE INDEX `background_tasks_user_status_idx`
      ON `background_tasks` (`userId`, `status`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'background_tasks'
      AND INDEX_NAME = 'background_tasks_user_updated_idx'
  ) THEN
    CREATE INDEX `background_tasks_user_updated_idx`
      ON `background_tasks` (`userId`, `updatedAt`);
  END IF;
END;
--> statement-breakpoint
CALL `_add_background_tasks_indexes`();
--> statement-breakpoint
DROP PROCEDURE `_add_background_tasks_indexes`;

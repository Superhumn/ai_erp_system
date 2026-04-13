-- Migration 0029: Fix fireflies_meetings schema.
-- Adds the columns from the current schema to databases where the table was
-- created with the old column set (companyId, transcript, aiSummary, etc.).
-- Uses stored procedures to guard against "Duplicate column" errors on MySQL 8.0,
-- which does not support ADD COLUMN IF NOT EXISTS (MariaDB-only syntax).

DROP PROCEDURE IF EXISTS `_add_fireflies_meetings_cols`;
--> statement-breakpoint
CREATE PROCEDURE `_add_fireflies_meetings_cols`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'organizerEmail') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `organizerEmail` varchar(320) AFTER `duration`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'organizerName') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `organizerName` varchar(255) AFTER `organizerEmail`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'shortSummary') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `shortSummary` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'keywords') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `keywords` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'topics') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `topics` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'sentimentAnalysis') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `sentimentAnalysis` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'transcriptUrl') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `transcriptUrl` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'transcriptText') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `transcriptText` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'actionItems') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `actionItems` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'processingStatus') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `processingStatus` enum('pending','contacts_created','tasks_created','project_created','fully_processed','skipped','error') NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'processedAt') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `processedAt` timestamp NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'processedBy') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `processedBy` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'processingNotes') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `processingNotes` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'autoCreatedProjectId') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `autoCreatedProjectId` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'autoCreatedTaskCount') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `autoCreatedTaskCount` int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'autoCreatedContactCount') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `autoCreatedContactCount` int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'meetingSource') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `meetingSource` varchar(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'calendarEventId') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `calendarEventId` varchar(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND COLUMN_NAME = 'recordingUrl') THEN
    ALTER TABLE `fireflies_meetings` ADD COLUMN `recordingUrl` text;
  END IF;
  -- Also ensure fireflies_meetings_firefliesId_unique constraint exists
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_meetings' AND CONSTRAINT_NAME = 'fireflies_meetings_firefliesId_unique') THEN
    ALTER TABLE `fireflies_meetings` ADD CONSTRAINT `fireflies_meetings_firefliesId_unique` UNIQUE (`firefliesId`);
  END IF;
END;
--> statement-breakpoint
CALL `_add_fireflies_meetings_cols`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_add_fireflies_meetings_cols`;
--> statement-breakpoint

DROP PROCEDURE IF EXISTS `_add_fireflies_action_items_cols`;
--> statement-breakpoint
CREATE PROCEDURE `_add_fireflies_action_items_cols`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_action_items' AND COLUMN_NAME = 'firefliesMeetingId') THEN
    ALTER TABLE `fireflies_action_items` ADD COLUMN `firefliesMeetingId` varchar(128) NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_action_items' AND COLUMN_NAME = 'assigneeEmail') THEN
    ALTER TABLE `fireflies_action_items` ADD COLUMN `assigneeEmail` varchar(320);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_action_items' AND COLUMN_NAME = 'projectTaskId') THEN
    ALTER TABLE `fireflies_action_items` ADD COLUMN `projectTaskId` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_action_items' AND COLUMN_NAME = 'crmContactId') THEN
    ALTER TABLE `fireflies_action_items` ADD COLUMN `crmContactId` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_action_items' AND COLUMN_NAME = 'convertedAt') THEN
    ALTER TABLE `fireflies_action_items` ADD COLUMN `convertedAt` timestamp NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_action_items' AND COLUMN_NAME = 'convertedBy') THEN
    ALTER TABLE `fireflies_action_items` ADD COLUMN `convertedBy` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fireflies_action_items' AND COLUMN_NAME = 'updatedAt') THEN
    ALTER TABLE `fireflies_action_items` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
  END IF;
END;
--> statement-breakpoint
CALL `_add_fireflies_action_items_cols`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_add_fireflies_action_items_cols`;

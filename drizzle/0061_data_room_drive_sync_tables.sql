-- Migration 0056: Ensure data-room Drive sync config + log tables exist.
-- These tables are defined in drizzle/schema.ts and appear in meta snapshots,
-- but were never shipped as a SQL migration. Fresh environments that only run
-- drizzle/*.sql therefore lack them, and every dataRoom.driveSync.* route fails.

CREATE TABLE IF NOT EXISTS `data_room_drive_sync_config` (
  `id` int AUTO_INCREMENT NOT NULL,
  `dataRoomId` int NOT NULL,
  `googleDriveFolderId` varchar(255) NOT NULL,
  `googleDriveFolderName` varchar(255),
  `googleDriveFolderUrl` varchar(512),
  `syncEnabled` boolean NOT NULL DEFAULT true,
  `syncFrequencyMinutes` int DEFAULT 60,
  `syncMode` enum('one_way_import','one_way_export','bidirectional') NOT NULL DEFAULT 'one_way_import',
  `syncSubfolders` boolean NOT NULL DEFAULT true,
  `includeFileTypes` text,
  `excludeFileTypes` text,
  `maxFileSizeMb` int DEFAULT 100,
  `folderMapping` text,
  `lastSyncAt` timestamp,
  `lastSyncStatus` enum('success','partial','failed','in_progress'),
  `lastSyncError` text,
  `lastSyncFilesAdded` int DEFAULT 0,
  `lastSyncFilesUpdated` int DEFAULT 0,
  `lastSyncFilesRemoved` int DEFAULT 0,
  `syncUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `data_room_drive_sync_config_id` PRIMARY KEY(`id`),
  CONSTRAINT `data_room_drive_sync_config_dataRoomId_unique` UNIQUE(`dataRoomId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `data_room_drive_sync_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `dataRoomId` int NOT NULL,
  `syncConfigId` int NOT NULL,
  `syncType` enum('manual','scheduled','webhook') NOT NULL,
  `status` enum('started','in_progress','completed','failed','cancelled') NOT NULL DEFAULT 'started',
  `filesScanned` int DEFAULT 0,
  `filesAdded` int DEFAULT 0,
  `filesUpdated` int DEFAULT 0,
  `filesRemoved` int DEFAULT 0,
  `filesSkipped` int DEFAULT 0,
  `foldersCreated` int DEFAULT 0,
  `errors` text,
  `warnings` text,
  `startedAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp,
  `durationMs` int,
  `triggeredBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `data_room_drive_sync_logs_id` PRIMARY KEY(`id`)
);

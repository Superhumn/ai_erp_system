-- Google Chat Integration & Email-to-Task Pipeline
-- Migration for Google Chat message sync, task extraction from chat and emails

-- Update integration_configs type enum to include google_chat
ALTER TABLE `integration_configs` MODIFY COLUMN `type` enum('quickbooks','shopify','stripe','slack','email','webhook','fireflies','google_chat') NOT NULL;

-- Google Chat synced messages table
CREATE TABLE IF NOT EXISTS `google_chat_messages` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `spaceName` varchar(255) NOT NULL,
  `spaceDisplayName` varchar(500),
  `spaceType` varchar(64),
  `messageName` varchar(500) NOT NULL UNIQUE,
  `senderName` varchar(255),
  `senderDisplayName` varchar(255),
  `senderType` varchar(64),
  `text` text,
  `threadName` varchar(500),
  `messageTimestamp` timestamp,
  `syncedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `hasExtractedTasks` boolean DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Google Chat spaces the user has synced
CREATE TABLE IF NOT EXISTS `google_chat_spaces` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `spaceName` varchar(255) NOT NULL UNIQUE,
  `displayName` varchar(500),
  `spaceType` varchar(64),
  `isSyncEnabled` boolean DEFAULT true,
  `lastSyncAt` timestamp,
  `lastSyncMessageTimestamp` timestamp,
  `totalMessagesSynced` int DEFAULT 0,
  `totalTasksExtracted` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Email-extracted tasks tracking table
CREATE TABLE IF NOT EXISTS `email_extracted_tasks` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `emailId` int NOT NULL,
  `projectTaskId` int,
  `taskText` varchar(255) NOT NULL,
  `taskDescription` text,
  `priority` enum('low','medium','high','critical') DEFAULT 'medium',
  `dueDate` timestamp,
  `assignee` varchar(255),
  `emailCategory` varchar(64),
  `extractionMethod` enum('pattern','ai') DEFAULT 'pattern',
  `confidence` decimal(5,2),
  `status` enum('pending','converted_to_task','skipped','completed') NOT NULL DEFAULT 'pending',
  `convertedAt` timestamp,
  `convertedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Chat-extracted tasks tracking table
CREATE TABLE IF NOT EXISTS `chat_extracted_tasks` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `spaceName` varchar(255) NOT NULL,
  `messageName` varchar(500),
  `projectTaskId` int,
  `taskText` varchar(255) NOT NULL,
  `taskDescription` text,
  `priority` enum('low','medium','high','critical') DEFAULT 'medium',
  `dueDate` timestamp,
  `assignee` varchar(255),
  `senderName` varchar(255),
  `messageTimestamp` timestamp,
  `extractionMethod` enum('pattern','ai') DEFAULT 'pattern',
  `confidence` decimal(5,2),
  `status` enum('pending','converted_to_task','skipped','completed') NOT NULL DEFAULT 'pending',
  `convertedAt` timestamp,
  `convertedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX `idx_gchat_messages_space` ON `google_chat_messages` (`spaceName`);
CREATE INDEX `idx_gchat_messages_timestamp` ON `google_chat_messages` (`messageTimestamp`);
CREATE INDEX `idx_gchat_messages_name` ON `google_chat_messages` (`messageName`);
CREATE INDEX `idx_gchat_spaces_name` ON `google_chat_spaces` (`spaceName`);
CREATE INDEX `idx_email_extracted_tasks_emailId` ON `email_extracted_tasks` (`emailId`);
CREATE INDEX `idx_email_extracted_tasks_status` ON `email_extracted_tasks` (`status`);
CREATE INDEX `idx_chat_extracted_tasks_space` ON `chat_extracted_tasks` (`spaceName`);
CREATE INDEX `idx_chat_extracted_tasks_status` ON `chat_extracted_tasks` (`status`);

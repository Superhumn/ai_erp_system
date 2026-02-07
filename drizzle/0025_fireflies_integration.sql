-- Fireflies.ai Integration
-- Migration for meeting sync, action item tracking, and contact mapping

-- Update integration_configs type enum to include fireflies
ALTER TABLE `integration_configs` MODIFY COLUMN `type` enum('quickbooks','shopify','stripe','slack','email','webhook','fireflies') NOT NULL;

-- Update crm_contacts source enum to include fireflies
ALTER TABLE `crm_contacts` MODIFY COLUMN `source` enum('iphone_bump','whatsapp','linkedin_scan','business_card','website','referral','event','cold_outreach','import','manual','fireflies') NOT NULL DEFAULT 'manual';

-- Fireflies meetings table - stores synced meeting transcripts
CREATE TABLE IF NOT EXISTS `fireflies_meetings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `firefliesId` varchar(128) NOT NULL UNIQUE,
  `title` varchar(500) NOT NULL,
  `date` timestamp,
  `duration` int,
  `organizerEmail` varchar(320),
  `organizerName` varchar(255),
  `participants` text,
  `summary` text,
  `shortSummary` text,
  `keywords` text,
  `topics` text,
  `sentimentAnalysis` text,
  `transcriptUrl` text,
  `transcriptText` text,
  `actionItems` text,
  `processingStatus` enum('pending','contacts_created','tasks_created','project_created','fully_processed','skipped','error') NOT NULL DEFAULT 'pending',
  `processedAt` timestamp,
  `processedBy` int,
  `processingNotes` text,
  `autoCreatedProjectId` int,
  `autoCreatedTaskCount` int DEFAULT 0,
  `autoCreatedContactCount` int DEFAULT 0,
  `meetingSource` varchar(64),
  `calendarEventId` varchar(255),
  `recordingUrl` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Fireflies action items - tracks individual action items from meetings
CREATE TABLE IF NOT EXISTS `fireflies_action_items` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `meetingId` int NOT NULL,
  `firefliesMeetingId` varchar(128) NOT NULL,
  `text` text NOT NULL,
  `assignee` varchar(255),
  `assigneeEmail` varchar(320),
  `dueDate` timestamp,
  `projectTaskId` int,
  `crmContactId` int,
  `status` enum('pending','converted_to_task','skipped','completed') NOT NULL DEFAULT 'pending',
  `convertedAt` timestamp,
  `convertedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Fireflies contact mappings - tracks participant-to-CRM-contact mapping
CREATE TABLE IF NOT EXISTS `fireflies_contact_mappings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `meetingId` int NOT NULL,
  `participantEmail` varchar(320) NOT NULL,
  `participantName` varchar(255),
  `crmContactId` int,
  `isNewContact` boolean DEFAULT false,
  `wasAutoCreated` boolean DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX `idx_fireflies_meetings_firefliesId` ON `fireflies_meetings` (`firefliesId`);
CREATE INDEX `idx_fireflies_meetings_status` ON `fireflies_meetings` (`processingStatus`);
CREATE INDEX `idx_fireflies_meetings_date` ON `fireflies_meetings` (`date`);
CREATE INDEX `idx_fireflies_action_items_meetingId` ON `fireflies_action_items` (`meetingId`);
CREATE INDEX `idx_fireflies_action_items_status` ON `fireflies_action_items` (`status`);
CREATE INDEX `idx_fireflies_contact_mappings_meetingId` ON `fireflies_contact_mappings` (`meetingId`);
CREATE INDEX `idx_fireflies_contact_mappings_email` ON `fireflies_contact_mappings` (`participantEmail`);

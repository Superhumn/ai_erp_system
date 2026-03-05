-- Email Messages - outbound email queue with full lifecycle tracking
CREATE TABLE IF NOT EXISTS `email_messages` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `toEmail` varchar(320) NOT NULL,
  `toName` varchar(255),
  `fromEmail` varchar(320) NOT NULL,
  `fromName` varchar(255),
  `replyTo` varchar(320),
  `subject` varchar(500) NOT NULL,
  `templateName` varchar(100),
  `payloadJson` json,
  `htmlBody` text,
  `textBody` text,
  `idempotencyKey` varchar(255) UNIQUE,
  `status` enum('queued','sending','sent','delivered','bounced','dropped','deferred','failed') NOT NULL DEFAULT 'queued',
  `providerMessageId` varchar(255),
  `relatedEntityType` varchar(50),
  `relatedEntityId` int,
  `triggeredBy` int,
  `aiGenerated` boolean DEFAULT false,
  `scheduledAt` timestamp NULL,
  `sentAt` timestamp NULL,
  `deliveredAt` timestamp NULL,
  `retryCount` int DEFAULT 0,
  `maxRetries` int DEFAULT 3,
  `errorJson` json,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX `idx_email_messages_status` ON `email_messages` (`status`);
CREATE INDEX `idx_email_messages_provider_id` ON `email_messages` (`providerMessageId`);
CREATE INDEX `idx_email_messages_entity` ON `email_messages` (`relatedEntityType`, `relatedEntityId`);
CREATE INDEX `idx_email_messages_created` ON `email_messages` (`createdAt`);

-- Email Events - raw webhook/provider events for audit trail
CREATE TABLE IF NOT EXISTS `email_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `emailMessageId` int,
  `providerEventType` varchar(50) NOT NULL,
  `providerMessageId` varchar(255),
  `providerTimestamp` timestamp NULL,
  `email` varchar(320),
  `reason` text,
  `bounceType` varchar(50),
  `url` varchar(2048),
  `userAgent` varchar(512),
  `ip` varchar(45),
  `rawEventJson` json,
  `processedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_email_events_message` ON `email_events` (`emailMessageId`);
CREATE INDEX `idx_email_events_provider_id` ON `email_events` (`providerMessageId`);
CREATE INDEX `idx_email_events_type` ON `email_events` (`providerEventType`);

-- Email Tracking Events - normalized open/click/engagement events
CREATE TABLE IF NOT EXISTS `email_tracking_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `emailMessageId` int NOT NULL,
  `eventType` enum('open','click','unsubscribe','spam_report') NOT NULL,
  `recipientEmail` varchar(320) NOT NULL,
  `url` varchar(2048),
  `userAgent` varchar(512),
  `ip` varchar(45),
  `deviceType` varchar(50),
  `os` varchar(100),
  `browser` varchar(100),
  `country` varchar(100),
  `region` varchar(100),
  `city` varchar(100),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_tracking_events_message` ON `email_tracking_events` (`emailMessageId`);
CREATE INDEX `idx_tracking_events_type` ON `email_tracking_events` (`eventType`);
CREATE INDEX `idx_tracking_events_email` ON `email_tracking_events` (`recipientEmail`);

-- Email Links - tracked links in outbound emails for click analytics
CREATE TABLE IF NOT EXISTS `email_links` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `emailMessageId` int NOT NULL,
  `trackingId` varchar(64) NOT NULL UNIQUE,
  `originalUrl` varchar(2048) NOT NULL,
  `clickCount` int DEFAULT 0,
  `firstClickedAt` timestamp NULL,
  `lastClickedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_email_links_message` ON `email_links` (`emailMessageId`);
CREATE INDEX `idx_email_links_tracking` ON `email_links` (`trackingId`);

-- Email Bounce List - suppression list for bounced/invalid addresses
CREATE TABLE IF NOT EXISTS `email_bounce_list` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `email` varchar(320) NOT NULL UNIQUE,
  `bounceType` enum('hard','soft','complaint','unsubscribe') NOT NULL,
  `reason` text,
  `provider` varchar(50),
  `bounceCount` int DEFAULT 1,
  `firstBouncedAt` timestamp NOT NULL,
  `lastBouncedAt` timestamp NOT NULL,
  `isSuppressed` boolean NOT NULL DEFAULT true,
  `unsuppressedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX `idx_bounce_list_email` ON `email_bounce_list` (`email`);
CREATE INDEX `idx_bounce_list_type` ON `email_bounce_list` (`bounceType`);
CREATE INDEX `idx_bounce_list_suppressed` ON `email_bounce_list` (`isSuppressed`);

-- Email Engagement Summary - aggregated per-message engagement metrics
CREATE TABLE IF NOT EXISTS `email_engagement_summary` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `emailMessageId` int NOT NULL UNIQUE,
  `recipientEmail` varchar(320) NOT NULL,
  `delivered` boolean DEFAULT false,
  `deliveredAt` timestamp NULL,
  `opened` boolean DEFAULT false,
  `openCount` int DEFAULT 0,
  `firstOpenedAt` timestamp NULL,
  `lastOpenedAt` timestamp NULL,
  `clicked` boolean DEFAULT false,
  `clickCount` int DEFAULT 0,
  `firstClickedAt` timestamp NULL,
  `lastClickedAt` timestamp NULL,
  `uniqueLinksClicked` int DEFAULT 0,
  `bounced` boolean DEFAULT false,
  `bounceType` varchar(50),
  `bouncedAt` timestamp NULL,
  `unsubscribed` boolean DEFAULT false,
  `unsubscribedAt` timestamp NULL,
  `spamReported` boolean DEFAULT false,
  `spamReportedAt` timestamp NULL,
  `engagementScore` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX `idx_engagement_message` ON `email_engagement_summary` (`emailMessageId`);
CREATE INDEX `idx_engagement_email` ON `email_engagement_summary` (`recipientEmail`);
CREATE INDEX `idx_engagement_score` ON `email_engagement_summary` (`engagementScore`);

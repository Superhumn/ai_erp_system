-- Migration 0035: Marketing & social media management
-- Tables: social_accounts, marketing_campaigns, marketing_posts,
--         marketing_engagements, marketing_metrics
-- Rationale: build social scheduling, engagement tracking, and campaign ROI
-- natively in the ERP so posts can be attributed to CRM contacts & orders.

CREATE TABLE IF NOT EXISTS `social_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platform` enum('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
  `handle` varchar(255) NOT NULL,
  `displayName` varchar(255),
  `avatarUrl` text,
  `provider` enum('ayrshare','direct','manual') NOT NULL DEFAULT 'ayrshare',
  `providerProfileKey` varchar(255),
  `status` enum('active','disconnected','error') NOT NULL DEFAULT 'active',
  `lastSyncedAt` timestamp NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `social_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE INDEX `social_accounts_platform_handle_idx` ON `social_accounts` (`platform`, `handle`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `marketing_campaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `goal` enum('awareness','engagement','leads','conversions','retention') NOT NULL DEFAULT 'engagement',
  `status` enum('draft','active','paused','completed','archived') NOT NULL DEFAULT 'draft',
  `startDate` timestamp NULL,
  `endDate` timestamp NULL,
  `budgetAmount` decimal(15,2),
  `spendAmount` decimal(15,2) DEFAULT '0',
  `currency` varchar(3) DEFAULT 'USD',
  `targetTags` text,
  `utmSource` varchar(128),
  `utmMedium` varchar(128),
  `utmCampaign` varchar(128),
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `marketing_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE INDEX `marketing_campaigns_status_idx` ON `marketing_campaigns` (`status`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `marketing_posts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int,
  `title` varchar(255),
  `body` text NOT NULL,
  `mediaUrls` text,
  `platforms` text NOT NULL,
  `accountIds` text,
  `status` enum('draft','scheduled','queued','posted','failed','cancelled') NOT NULL DEFAULT 'draft',
  `scheduledAt` timestamp NULL,
  `postedAt` timestamp NULL,
  `externalIds` text,
  `failureReason` text,
  `aiGenerated` boolean DEFAULT false,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `marketing_posts_id` PRIMARY KEY(`id`),
  CONSTRAINT `marketing_posts_campaignId_fk` FOREIGN KEY (`campaignId`) REFERENCES `marketing_campaigns`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE INDEX `marketing_posts_status_scheduledAt_idx` ON `marketing_posts` (`status`, `scheduledAt`);
--> statement-breakpoint
CREATE INDEX `marketing_posts_campaignId_idx` ON `marketing_posts` (`campaignId`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `marketing_engagements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `postId` int,
  `platform` enum('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
  `externalId` varchar(255) NOT NULL,
  `type` enum('like','comment','share','mention','dm','reaction') NOT NULL,
  `authorHandle` varchar(255),
  `authorName` varchar(255),
  `authorAvatarUrl` text,
  `body` text,
  `permalink` text,
  `sentiment` enum('positive','neutral','negative','unknown') DEFAULT 'unknown',
  `contactId` int,
  `repliedAt` timestamp NULL,
  `fetchedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `occurredAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `marketing_engagements_id` PRIMARY KEY(`id`),
  CONSTRAINT `marketing_engagements_postId_fk` FOREIGN KEY (`postId`) REFERENCES `marketing_posts`(`id`) ON DELETE SET NULL,
  CONSTRAINT `marketing_engagements_contactId_fk` FOREIGN KEY (`contactId`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE INDEX `marketing_engagements_post_platform_idx` ON `marketing_engagements` (`postId`, `platform`);
--> statement-breakpoint
CREATE INDEX `marketing_engagements_authorHandle_idx` ON `marketing_engagements` (`authorHandle`);
--> statement-breakpoint
CREATE INDEX `marketing_engagements_occurredAt_idx` ON `marketing_engagements` (`occurredAt`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `marketing_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `postId` int NOT NULL,
  `platform` enum('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
  `impressions` int DEFAULT 0,
  `reach` int DEFAULT 0,
  `clicks` int DEFAULT 0,
  `likes` int DEFAULT 0,
  `comments` int DEFAULT 0,
  `shares` int DEFAULT 0,
  `saves` int DEFAULT 0,
  `videoViews` int DEFAULT 0,
  `recordedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `marketing_metrics_id` PRIMARY KEY(`id`),
  CONSTRAINT `marketing_metrics_postId_fk` FOREIGN KEY (`postId`) REFERENCES `marketing_posts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE INDEX `marketing_metrics_post_platform_recorded_idx` ON `marketing_metrics` (`postId`, `platform`, `recordedAt`);

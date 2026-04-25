-- Migration 0036: Influencer CRM (creator relationships, outreach, deliverables)
-- Tables: influencers, influencer_campaign_participations,
--         influencer_deliverables, influencer_outreach
-- Builds on 0035 (marketing module). Tracks creators end-to-end: discovery →
-- outreach → negotiation → deliverables → performance, joined to existing
-- marketing_campaigns and crm_contacts.

CREATE TABLE IF NOT EXISTS `influencers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fullName` varchar(255) NOT NULL,
  `primaryHandle` varchar(255),
  `primaryPlatform` enum('linkedin','twitter','facebook','instagram','tiktok','youtube','threads'),
  `handles` text,
  `email` varchar(320),
  `phone` varchar(32),
  `agentName` varchar(255),
  `agentEmail` varchar(320),
  `websiteUrl` text,
  `avatarUrl` text,
  `followerCount` int DEFAULT 0,
  `engagementRatePct` decimal(6,3),
  `avgViews` int,
  `tier` enum('nano','micro','mid','macro','mega'),
  `niche` varchar(128),
  `tags` text,
  `language` varchar(16),
  `country` varchar(64),
  `city` varchar(128),
  `rateCard` text,
  `currency` varchar(3) DEFAULT 'USD',
  `preferredPaymentMethod` varchar(64),
  `status` enum('prospect','contacted','negotiating','agreed','active','completed','paused','blacklisted') NOT NULL DEFAULT 'prospect',
  `leadSource` enum('search','inbound','referral','agency','engagement_funnel','import','manual') DEFAULT 'manual',
  `lastOutreachAt` timestamp NULL,
  `notes` text,
  `crmContactId` int,
  `assignedTo` int,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `influencers_id` PRIMARY KEY(`id`),
  CONSTRAINT `influencers_crmContactId_fk` FOREIGN KEY (`crmContactId`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE INDEX `influencers_status_idx` ON `influencers` (`status`);
--> statement-breakpoint
CREATE INDEX `influencers_tier_idx` ON `influencers` (`tier`);
--> statement-breakpoint
CREATE INDEX `influencers_primaryPlatform_handle_idx` ON `influencers` (`primaryPlatform`, `primaryHandle`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `influencer_campaign_participations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `influencerId` int NOT NULL,
  `campaignId` int NOT NULL,
  `status` enum('invited','negotiating','agreed','in_progress','completed','cancelled') NOT NULL DEFAULT 'invited',
  `agreedFee` decimal(15,2),
  `currency` varchar(3) DEFAULT 'USD',
  `paymentStatus` enum('pending','invoiced','paid','refunded') DEFAULT 'pending',
  `productGifted` boolean DEFAULT false,
  `briefUrl` text,
  `contractUrl` text,
  `trackingCode` varchar(64),
  `notes` text,
  `startDate` timestamp NULL,
  `endDate` timestamp NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `influencer_campaign_participations_id` PRIMARY KEY(`id`),
  CONSTRAINT `influencer_campaign_participations_influencerId_fk` FOREIGN KEY (`influencerId`) REFERENCES `influencers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `influencer_campaign_participations_campaignId_fk` FOREIGN KEY (`campaignId`) REFERENCES `marketing_campaigns`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE INDEX `influencer_participations_campaign_idx` ON `influencer_campaign_participations` (`campaignId`);
--> statement-breakpoint
CREATE INDEX `influencer_participations_status_idx` ON `influencer_campaign_participations` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `influencer_participations_unique` ON `influencer_campaign_participations` (`influencerId`, `campaignId`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `influencer_deliverables` (
  `id` int AUTO_INCREMENT NOT NULL,
  `participationId` int NOT NULL,
  `type` enum('post','story','reel','video','live','blog','podcast') NOT NULL,
  `platform` enum('linkedin','twitter','facebook','instagram','tiktok','youtube','threads') NOT NULL,
  `status` enum('planned','submitted','approved','revision_requested','published','rejected') NOT NULL DEFAULT 'planned',
  `scheduledAt` timestamp NULL,
  `publishedAt` timestamp NULL,
  `postUrl` text,
  `marketingPostId` int,
  `impressions` int DEFAULT 0,
  `views` int DEFAULT 0,
  `likes` int DEFAULT 0,
  `comments` int DEFAULT 0,
  `shares` int DEFAULT 0,
  `saves` int DEFAULT 0,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `influencer_deliverables_id` PRIMARY KEY(`id`),
  CONSTRAINT `influencer_deliverables_participationId_fk` FOREIGN KEY (`participationId`) REFERENCES `influencer_campaign_participations`(`id`) ON DELETE CASCADE,
  CONSTRAINT `influencer_deliverables_marketingPostId_fk` FOREIGN KEY (`marketingPostId`) REFERENCES `marketing_posts`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE INDEX `influencer_deliverables_participation_idx` ON `influencer_deliverables` (`participationId`);
--> statement-breakpoint
CREATE INDEX `influencer_deliverables_status_idx` ON `influencer_deliverables` (`status`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `influencer_outreach` (
  `id` int AUTO_INCREMENT NOT NULL,
  `influencerId` int NOT NULL,
  `campaignId` int,
  `channel` enum('email','dm','phone','in_person','agent','platform_message') NOT NULL,
  `direction` enum('outbound','inbound') NOT NULL DEFAULT 'outbound',
  `subject` varchar(255),
  `body` text,
  `response` enum('pending','interested','not_interested','no_response','negotiating') DEFAULT 'pending',
  `sentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `respondedAt` timestamp NULL,
  `createdBy` int,
  CONSTRAINT `influencer_outreach_id` PRIMARY KEY(`id`),
  CONSTRAINT `influencer_outreach_influencerId_fk` FOREIGN KEY (`influencerId`) REFERENCES `influencers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `influencer_outreach_campaignId_fk` FOREIGN KEY (`campaignId`) REFERENCES `marketing_campaigns`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE INDEX `influencer_outreach_influencer_idx` ON `influencer_outreach` (`influencerId`);
--> statement-breakpoint
CREATE INDEX `influencer_outreach_campaign_idx` ON `influencer_outreach` (`campaignId`);

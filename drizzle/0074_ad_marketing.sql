-- 0074_ad_marketing
--
-- Paid-ads marketing module: platform connections, campaigns, daily spend,
-- inbound leads, tracking links, ad credits and the automation run log.
-- Cost per signup is spend ÷ signups, computed at read time.
--
-- Also adds `paid_ad` to crm_contacts.source so ad leads are tagged with
-- where they came from.
--
-- Backed by drizzle/schema.ts. Re-runnable.

CREATE TABLE IF NOT EXISTS `ad_platforms` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `name` enum('meta','linkedin','reddit','google','tiktok','other') NOT NULL,
  `label` varchar(128),
  `accountId` varchar(128),
  `pageId` varchar(128),
  `accessToken` text,
  `tokenExpiresAt` timestamp NULL,
  `connectionStatus` enum('disconnected','connected','error') NOT NULL DEFAULT 'disconnected',
  `lastSyncAt` timestamp NULL,
  `lastSyncError` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ad_platforms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ad_campaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `platformId` int NOT NULL,
  `externalId` varchar(128),
  `name` varchar(255) NOT NULL,
  `objective` varchar(128),
  `dailyBudgetUsd` decimal(12,2),
  `totalBudgetUsd` decimal(12,2),
  `targetCostPerSignupUsd` decimal(12,2),
  `startDate` timestamp NULL,
  `endDate` timestamp NULL,
  `status` enum('planned','active','paused','ended') NOT NULL DEFAULT 'planned',
  `ownerUserId` int,
  `utmCampaign` varchar(128),
  `welcomeSubject` varchar(255),
  `welcomeBody` text,
  `notes` text,
  `cpsAlertAt` timestamp NULL,
  `budgetAlertAt` timestamp NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ad_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ad_spend_daily` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `date` varchar(10) NOT NULL,
  `spendUsd` decimal(12,2) NOT NULL DEFAULT '0',
  `impressions` int NOT NULL DEFAULT 0,
  `clicks` int NOT NULL DEFAULT 0,
  `signups` int NOT NULL DEFAULT 0,
  `source` enum('sync','manual') NOT NULL DEFAULT 'sync',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ad_spend_daily_id` PRIMARY KEY(`id`),
  CONSTRAINT `ad_spend_daily_campaign_date_uniq` UNIQUE(`campaignId`,`date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ad_leads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `campaignId` int,
  `platformId` int,
  `contactId` int,
  `source` enum('meta','linkedin','reddit','google','tiktok','landing_page','manual','other') NOT NULL,
  `externalLeadId` varchar(128),
  `email` varchar(320),
  `fullName` varchar(255),
  `utmSource` varchar(128),
  `utmMedium` varchar(128),
  `utmCampaign` varchar(128),
  `utmContent` varchar(128),
  `answersJson` text,
  `receivedAt` timestamp NOT NULL DEFAULT (now()),
  `welcomeEmailSentAt` timestamp NULL,
  `welcomeEmailError` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ad_leads_id` PRIMARY KEY(`id`),
  CONSTRAINT `ad_leads_platform_external_uniq` UNIQUE(`platformId`,`externalLeadId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ad_tracking_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `campaignId` int,
  `label` varchar(255),
  `baseUrl` text NOT NULL,
  `fullUrl` text NOT NULL,
  `utmSource` varchar(128) NOT NULL,
  `utmMedium` varchar(128) NOT NULL,
  `utmCampaign` varchar(128) NOT NULL,
  `utmContent` varchar(128),
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ad_tracking_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ad_credits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `platformId` int,
  `offer` varchar(255) NOT NULL,
  `amountUsd` decimal(12,2) NOT NULL DEFAULT '0',
  `amountUsedUsd` decimal(12,2) NOT NULL DEFAULT '0',
  `conditions` text,
  `claimedAt` timestamp NULL,
  `expiresAt` timestamp NULL,
  `status` enum('available','claimed','active','used','expired') NOT NULL DEFAULT 'available',
  `expiryWarnedAt` timestamp NULL,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ad_credits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ad_sync_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platformId` int,
  `kind` enum('spend_sync','lead_sync','alert_check','weekly_summary') NOT NULL,
  `period` varchar(16) NOT NULL,
  `claimKey` varchar(64),
  `status` enum('running','success','failed','skipped') NOT NULL,
  `rowsAffected` int NOT NULL DEFAULT 0,
  `message` text,
  `ranAt` timestamp NOT NULL DEFAULT (now()),
  `finishedAt` timestamp NULL,
  CONSTRAINT `ad_sync_logs_id` PRIMARY KEY(`id`),
  CONSTRAINT `ad_sync_logs_claim_uniq` UNIQUE(`claimKey`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0074_crm_contact_source`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0074_crm_contact_source`()
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contacts') THEN
    ALTER TABLE `crm_contacts` MODIFY COLUMN `source` enum('iphone_bump','whatsapp','linkedin_scan','business_card','website','referral','event','cold_outreach','import','manual','fireflies','b2brocket','paid_ad') NOT NULL DEFAULT 'manual';
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0074_crm_contact_source`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0074_crm_contact_source`;

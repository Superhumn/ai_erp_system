-- Migration 0033: Marketing video publishing tables.
-- Adds tables for the Video Publishing tab: marketing_videos, social_posts, social_platform_credentials.
-- NOTE: Column set is a starting proposal — adjust before running if your UI/code expects different fields.

CREATE TABLE IF NOT EXISTS `marketing_videos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `videoUrl` text NOT NULL,
  `thumbnailUrl` text,
  `durationSeconds` int,
  `fileSizeBytes` bigint,
  `mimeType` varchar(64),
  `aspectRatio` varchar(16),
  `status` enum('draft','processing','ready','archived','failed') NOT NULL DEFAULT 'draft',
  `tags` json,
  `productId` int,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `marketing_videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `social_platform_credentials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platform` enum('youtube','tiktok','instagram','facebook','linkedin','twitter','threads') NOT NULL,
  `accountName` varchar(255) NOT NULL,
  `accountId` varchar(255),
  `accessToken` text NOT NULL,
  `refreshToken` text,
  `expiresAt` timestamp NULL,
  `scopes` text,
  `metadata` json,
  `isActive` boolean NOT NULL DEFAULT true,
  `userId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `social_platform_credentials_id` PRIMARY KEY(`id`),
  CONSTRAINT `social_platform_credentials_platform_account_unique` UNIQUE(`platform`, `accountName`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `social_posts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `marketingVideoId` int,
  `platformCredentialId` int,
  `platform` enum('youtube','tiktok','instagram','facebook','linkedin','twitter','threads') NOT NULL,
  `caption` text,
  `hashtags` text,
  `status` enum('draft','scheduled','publishing','published','failed','cancelled') NOT NULL DEFAULT 'draft',
  `scheduledAt` timestamp NULL,
  `publishedAt` timestamp NULL,
  `externalPostId` varchar(255),
  `externalUrl` text,
  `errorMessage` text,
  `metrics` json,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `social_posts_id` PRIMARY KEY(`id`),
  CONSTRAINT `social_posts_video_fk` FOREIGN KEY(`marketingVideoId`) REFERENCES `marketing_videos`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `social_posts_credential_fk` FOREIGN KEY(`platformCredentialId`) REFERENCES `social_platform_credentials`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
);
--> statement-breakpoint

CREATE INDEX `idx_social_posts_status` ON `social_posts`(`status`);
--> statement-breakpoint
CREATE INDEX `idx_social_posts_scheduled` ON `social_posts`(`scheduledAt`);
--> statement-breakpoint
CREATE INDEX `idx_marketing_videos_status` ON `marketing_videos`(`status`);

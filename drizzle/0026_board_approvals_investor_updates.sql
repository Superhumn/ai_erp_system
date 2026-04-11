CREATE TABLE `board_resolutions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `title` varchar(256) NOT NULL,
  `type` enum('equity_grant','officer_appointment','fundraising','budget_approval','contract','policy_change','compensation','option_pool','share_class','other') NOT NULL,
  `description` text,
  `documentUrl` text,
  `status` enum('draft','submitted','under_review','approved','rejected','signed','archived') DEFAULT 'draft',
  `requiredSignatures` int DEFAULT 1,
  `completedSignatures` int DEFAULT 0,
  `submittedAt` timestamp,
  `approvedAt` timestamp,
  `dueDate` timestamp,
  `relatedEntityType` varchar(64),
  `relatedEntityId` int,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `board_resolutions_id` PRIMARY KEY(`id`)
);

CREATE TABLE `board_signatures` (
  `id` int AUTO_INCREMENT NOT NULL,
  `resolutionId` int NOT NULL,
  `signerId` int NOT NULL,
  `signerName` varchar(256) NOT NULL,
  `signerEmail` varchar(320),
  `signerRole` varchar(128),
  `status` enum('pending','signed','declined') DEFAULT 'pending',
  `signedAt` timestamp,
  `declinedAt` timestamp,
  `declineReason` text,
  `signatureData` text,
  `ipAddress` varchar(45),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `board_signatures_id` PRIMARY KEY(`id`)
);

CREATE TABLE `investor_updates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `title` varchar(256) NOT NULL,
  `period` varchar(64),
  `type` enum('quarterly','monthly','annual','ad_hoc') DEFAULT 'quarterly',
  `content` text,
  `highlights` text,
  `asks` text,
  `callsToAction` text,
  `status` enum('draft','review','sent') DEFAULT 'draft',
  `sentAt` timestamp,
  `sentTo` text,
  `openCount` int DEFAULT 0,
  `clickCount` int DEFAULT 0,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `investor_updates_id` PRIMARY KEY(`id`)
);

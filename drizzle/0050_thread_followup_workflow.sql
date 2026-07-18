-- Migration 0050: Thread Follow-Up workflow.
-- Adds the email-thread follow-up tracking table and its structured audit log.
-- Uses CREATE TABLE IF NOT EXISTS so a fresh-DB replay reaches the same end
-- state and re-runs on prod are no-ops.

CREATE TABLE IF NOT EXISTS `email_thread_followups` (
  `id` int AUTO_INCREMENT NOT NULL,
  `threadId` varchar(255) NOT NULL,
  `gmailThreadId` varchar(255),
  `gmailMessageId` varchar(255),
  `subject` varchar(500),
  `contactEmail` varchar(320) NOT NULL,
  `contactName` varchar(255),
  `country` varchar(64),
  `timezone` varchar(64),
  `managerEmail` varchar(320),
  `vendorId` int,
  `threadOwnerId` int,
  `relatedEntityType` varchar(50),
  `relatedEntityId` int,
  `askSummary` varchar(500),
  `holdingUp` varchar(500),
  `isActiveVendor` boolean NOT NULL DEFAULT false,
  `nudgeCount` int NOT NULL DEFAULT 0,
  `nextNudgeAt` timestamp NULL,
  `status` enum('active','dropped_no_response','escalated_to_human','resolved') NOT NULL DEFAULT 'active',
  `pausedUntil` timestamp NULL,
  `lastInboundAt` timestamp NULL,
  `lastOutboundAt` timestamp NULL,
  `lastNudgeAt` timestamp NULL,
  `optedOut` boolean NOT NULL DEFAULT false,
  `manualReplyAt` timestamp NULL,
  `escalatedTaskId` int,
  `resolvedReason` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `email_thread_followups_id` PRIMARY KEY(`id`),
  CONSTRAINT `email_thread_followups_threadId_idx` UNIQUE(`threadId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `thread_followup_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `followupId` int,
  `threadId` varchar(255),
  `action` enum('enrolled','nudge_sent','nudge_skipped','dropped','escalated','paused','resumed','resolved','error') NOT NULL,
  `reason` varchar(128),
  `nudgeNumber` int,
  `dryRun` boolean NOT NULL DEFAULT false,
  `detail` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `thread_followup_logs_id` PRIMARY KEY(`id`)
);

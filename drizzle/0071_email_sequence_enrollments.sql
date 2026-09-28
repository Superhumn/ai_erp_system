-- 0071_email_sequence_enrollments
--
-- CRM email sending. Until now crm.campaigns could only be created and
-- scheduled (nothing ever sent) and email sequences had steps but no way to
-- put a contact on one.
--
--  * email_sequence_enrollments: one contact's progress through a sequence,
--    driven by server/sequenceRunner.ts every 5 minutes.
--  * crm_campaign_recipients: `sending` (claimed, never re-sent), `failed`
--    and `skipped` statuses plus the send error.
--  * crm_email_campaigns: `partially_failed` status.
--
-- Backed by drizzle/schema.ts. Re-runnable (MySQL 8 has no ADD COLUMN IF NOT
-- EXISTS, so column/enum changes run inside a guarded procedure).

CREATE TABLE IF NOT EXISTS `email_sequence_enrollments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `sequenceId` int NOT NULL,
  `contactId` int NOT NULL,
  `status` enum('active','paused','completed','stopped','failed') NOT NULL DEFAULT 'active',
  `currentStepOrder` int NOT NULL DEFAULT 0,
  `nextSendAt` timestamp NULL,
  `lastSentAt` timestamp NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `lastError` text,
  `enrolledBy` int,
  `stoppedReason` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `email_sequence_enrollments_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_email_sequence_enrollments_seq_contact` UNIQUE(`sequenceId`,`contactId`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0071_crm_campaign_sending`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0071_crm_campaign_sending`()
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_campaign_recipients') THEN
    ALTER TABLE `crm_campaign_recipients` MODIFY COLUMN `status` enum('pending','sending','sent','delivered','opened','clicked','bounced','unsubscribed','failed','skipped') DEFAULT 'pending';
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_campaign_recipients' AND COLUMN_NAME = 'error') THEN
      ALTER TABLE `crm_campaign_recipients` ADD COLUMN `error` text AFTER `messageId`;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_email_campaigns') THEN
    ALTER TABLE `crm_email_campaigns` MODIFY COLUMN `status` enum('draft','scheduled','sending','sent','partially_failed','paused','cancelled') DEFAULT 'draft';
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0071_crm_campaign_sending`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0071_crm_campaign_sending`;

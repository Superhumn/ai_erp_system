-- 0068_legal_cases
--
-- appRouter.legalCases (Legal → Case Tracker) read and wrote a `legal_cases`
-- table through a raw mysql2 handle that drizzle-orm no longer exposes, and
-- the table itself only ever existed in meta/0042_snapshot.json — no schema.ts
-- definition and no migration created it. Define it properly (drizzle/schema.ts
-- `legalCases`) and backfill: CREATE IF NOT EXISTS for fresh environments, plus
-- a guarded ADD COLUMN `companyId` for databases that already carry the
-- introspected table without the entity-scope column (MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS). Re-runnable.

CREATE TABLE IF NOT EXISTS `legal_cases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `caseNumber` varchar(64),
  `title` varchar(255) NOT NULL,
  `type` enum('trademark','litigation','compliance','contract_dispute','ip','regulatory','employment','other') DEFAULT 'other',
  `status` enum('open','pending','in_review','resolved','closed','dismissed') DEFAULT 'open',
  `priority` enum('low','medium','high','critical') DEFAULT 'medium',
  `opposingParty` varchar(255),
  `attorney` varchar(255),
  `lawFirm` varchar(255),
  `filedDate` timestamp NULL,
  `nextHearingDate` timestamp NULL,
  `jurisdiction` varchar(128),
  `description` text,
  `notes` text,
  `assignedTo` int,
  `createdBy` int,
  `createdAt` timestamp DEFAULT (now()),
  `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `legal_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0068_legal_cases`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0068_legal_cases`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'legal_cases' AND COLUMN_NAME = 'companyId') THEN
    ALTER TABLE `legal_cases` ADD COLUMN `companyId` int AFTER `id`;
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0068_legal_cases`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0068_legal_cases`;

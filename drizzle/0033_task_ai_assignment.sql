-- Migration 0033: Unified task assignment (Human + AI)
-- Extends project_tasks so any task can be assigned to a human user or to an
-- AI agent (tracked via aiAgentTasks). Also adds Lightfield-style CRM linkage
-- (account / opportunity) and source provenance (manual/email/meeting/...)
-- so tasks can be auto-generated from inbox threads, meeting transcripts, or
-- CRM deals while flowing through the same Projects UI and approval queue.

ALTER TABLE `project_tasks`
  ADD COLUMN `assigneeType` enum('human','ai_agent') NOT NULL DEFAULT 'human',
  ADD COLUMN `assigneeAgentTaskId` int NULL,
  ADD COLUMN `accountId` int NULL,
  ADD COLUMN `opportunityId` int NULL,
  ADD COLUMN `sourceType` enum('manual','email','meeting','ai_generated','crm_deal') NOT NULL DEFAULT 'manual',
  ADD COLUMN `sourceRefType` varchar(64) NULL,
  ADD COLUMN `sourceRefId` int NULL,
  ADD COLUMN `aiReasoning` text NULL,
  ADD COLUMN `aiConfidence` decimal(5,2) NULL;

CREATE INDEX `project_tasks_assigneeType_idx` ON `project_tasks` (`assigneeType`);
CREATE INDEX `project_tasks_assigneeAgentTaskId_idx` ON `project_tasks` (`assigneeAgentTaskId`);
CREATE INDEX `project_tasks_accountId_idx` ON `project_tasks` (`accountId`);
CREATE INDEX `project_tasks_opportunityId_idx` ON `project_tasks` (`opportunityId`);
CREATE INDEX `project_tasks_source_idx` ON `project_tasks` (`sourceType`, `sourceRefType`, `sourceRefId`);

-- Investment Grant Checklist Tables
-- Migration for Saudi Arabia investment incentive grant tracking (MISA, MODON, ZATCA)

CREATE TABLE `investment_grant_checklists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('not_started','in_progress','completed','on_hold') NOT NULL DEFAULT 'not_started',
	`totalCapex` decimal(15,2),
	`grantPercentage` decimal(5,2) DEFAULT '35',
	`estimatedGrant` decimal(15,2),
	`currency` varchar(3) DEFAULT 'SAR',
	`startDate` timestamp,
	`targetCompletionDate` timestamp,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `investment_grant_checklists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investment_grant_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checklistId` int NOT NULL,
	`category` enum('entity_entry_setup','project_definition','capex_financials','land_infrastructure','jobs_localization','incentive_application','construction_equipment','grant_disbursement') NOT NULL,
	`taskName` varchar(255) NOT NULL,
	`description` text,
	`status` enum('not_started','in_progress','completed','blocked') NOT NULL DEFAULT 'not_started',
	`assigneeId` int,
	`startMonth` int,
	`durationMonths` int,
	`completedDate` timestamp,
	`notes` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `investment_grant_items_id` PRIMARY KEY(`id`)
);

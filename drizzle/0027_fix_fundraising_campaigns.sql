ALTER TABLE `fundraising_campaigns` ADD COLUMN `companyId` int;
--> statement-breakpoint
ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `createdBy` int NULL;
--> statement-breakpoint
ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `targetAmount` decimal(15,2) NULL;
--> statement-breakpoint
ALTER TABLE `fundraising_campaigns` MODIFY COLUMN `roundType` enum('pre_seed','seed','series_a','series_b','series_c','bridge','other') NOT NULL DEFAULT 'seed';

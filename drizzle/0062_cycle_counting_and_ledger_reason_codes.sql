-- Migration 0062: cycle counting + structured adjustment reason codes.
--
-- Adds the physical-inventory verification workflow (`cycleCounts` /
-- `cycleCountLines`) and a `reasonCode` column on the inventory ledger so
-- adjust / scrap / count_adjust movements are attributable.
--
-- The `count_adjust` and `scrap` transaction types already existed in the
-- `inventoryTransactions` enum but had no code path writing them; approving a
-- cycle count and scrapping stock now post through them.
--
-- All statements are idempotent so this is safe to apply on databases that
-- already have the tables from an earlier `drizzle-kit push`.

CREATE TABLE IF NOT EXISTS `cycleCounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `countNumber` varchar(64) NOT NULL,
  `warehouseId` int NOT NULL,
  `countType` enum('full','cycle','spot','abc') NOT NULL DEFAULT 'cycle',
  `status` enum('draft','in_progress','pending_review','approved','cancelled') NOT NULL DEFAULT 'draft',
  `blindCount` boolean NOT NULL DEFAULT true,
  `scheduledDate` timestamp NULL,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `approvedBy` int,
  `approvedAt` timestamp NULL,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cycleCounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cycleCountLines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `countId` int NOT NULL,
  `productId` int NOT NULL,
  `lotId` int,
  `warehouseId` int NOT NULL,
  `zoneId` varchar(64),
  `binId` varchar(64),
  `systemQuantity` decimal(15,4) NOT NULL,
  `countedQuantity` decimal(15,4),
  `variance` decimal(15,4),
  `varianceValue` decimal(15,2),
  `unit` varchar(32) NOT NULL DEFAULT 'EA',
  `status` enum('pending','counted','recount','approved') NOT NULL DEFAULT 'pending',
  `reasonCode` varchar(64),
  `notes` text,
  `countedBy` int,
  `countedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cycleCountLines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0062_cycle_counting`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0062_cycle_counting`()
BEGIN
  -- MySQL 8.0 has no ADD COLUMN / CREATE INDEX "IF NOT EXISTS", so each
  -- statement is guarded against INFORMATION_SCHEMA.
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventoryTransactions' AND COLUMN_NAME = 'reasonCode') THEN
    ALTER TABLE `inventoryTransactions` ADD COLUMN `reasonCode` varchar(64) AFTER `referenceId`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cycleCounts' AND INDEX_NAME = 'cycleCounts_warehouse_status_idx') THEN
    CREATE INDEX `cycleCounts_warehouse_status_idx` ON `cycleCounts` (`warehouseId`, `status`);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cycleCountLines' AND INDEX_NAME = 'cycleCountLines_count_idx') THEN
    CREATE INDEX `cycleCountLines_count_idx` ON `cycleCountLines` (`countId`);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cycleCountLines' AND INDEX_NAME = 'cycleCountLines_product_warehouse_idx') THEN
    CREATE INDEX `cycleCountLines_product_warehouse_idx` ON `cycleCountLines` (`productId`, `warehouseId`);
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0062_cycle_counting`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0062_cycle_counting`;

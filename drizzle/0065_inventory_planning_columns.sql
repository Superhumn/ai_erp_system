-- 0065_inventory_planning_columns
--
-- Operations → Inventory Planning edits forecastedQuantity / poStatus /
-- freightStatus / freightTrackingNumber through inventoryManagement.update,
-- but `inventory` never had those columns: Drizzle dropped the unknown keys
-- and sent `UPDATE inventory SET WHERE id = ?`, a SQL syntax error, on every
-- save. Add them, guarded so the migration is re-runnable (MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS).

DROP PROCEDURE IF EXISTS `_migrate_0065_inventory_planning`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0065_inventory_planning`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'forecastedQuantity') THEN
    ALTER TABLE `inventory` ADD COLUMN `forecastedQuantity` decimal(15,4) AFTER `totalCostBasis`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'poStatus') THEN
    ALTER TABLE `inventory` ADD COLUMN `poStatus` varchar(64) AFTER `forecastedQuantity`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'freightStatus') THEN
    ALTER TABLE `inventory` ADD COLUMN `freightStatus` varchar(64) AFTER `poStatus`;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'freightTrackingNumber') THEN
    ALTER TABLE `inventory` ADD COLUMN `freightTrackingNumber` varchar(128) AFTER `freightStatus`;
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0065_inventory_planning`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0065_inventory_planning`;

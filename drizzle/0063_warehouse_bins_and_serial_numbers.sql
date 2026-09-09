-- 0063_warehouse_bins_and_serial_numbers
--
-- Two additions:
--
--   * warehouseZones / warehouseBins give the free-text `zoneId` / `binId`
--     columns on inventoryBalances a master table behind them. They key on the
--     *code*, not on an id, so values already written keep resolving.
--
--   * serialNumbers / serialNumberEvents add unit-level tracking beneath lots.
--
-- MySQL 8 has no ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, so the
-- index work goes through a guarded procedure — the same pattern as
-- 0029_fix_fireflies_meetings_schema.sql — to keep this migration re-runnable.

CREATE TABLE IF NOT EXISTS `warehouseZones` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `warehouseId` int NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `zoneType` enum('picking','bulk','receiving','staging','quarantine','returns') NOT NULL DEFAULT 'picking',
  `pickSequence` int NOT NULL DEFAULT 0,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `warehouseZones_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `warehouseBins` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `warehouseId` int NOT NULL,
  `zoneId` int,
  `code` varchar(64) NOT NULL,
  `name` varchar(255),
  `pickSequence` int NOT NULL DEFAULT 0,
  `capacity` decimal(15,4),
  `status` enum('active','inactive','blocked') NOT NULL DEFAULT 'active',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `warehouseBins_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `serialNumbers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `serialNumber` varchar(128) NOT NULL,
  `productId` int NOT NULL,
  `lotId` int,
  `warehouseId` int,
  `binCode` varchar(64),
  `status` enum('in_stock','allocated','shipped','returned','scrapped') NOT NULL DEFAULT 'in_stock',
  `sourceType` varchar(64),
  `sourceReferenceId` int,
  `outboundReferenceType` varchar(64),
  `outboundReferenceId` int,
  `receivedAt` timestamp NULL,
  `shippedAt` timestamp NULL,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `serialNumbers_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `serialNumberEvents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `serialId` int NOT NULL,
  `fromStatus` varchar(32),
  `toStatus` varchar(32) NOT NULL,
  `warehouseId` int,
  `referenceType` varchar(64),
  `referenceId` int,
  `notes` text,
  `performedBy` int,
  `performedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `serialNumberEvents_id` PRIMARY KEY(`id`)
);

DROP PROCEDURE IF EXISTS `_migrate_0063_bins_and_serials`;
DELIMITER //
CREATE PROCEDURE `_migrate_0063_bins_and_serials`()
BEGIN
  -- A zone code is unique within its warehouse; a bin code within its
  -- warehouse. That uniqueness is what lets inventoryBalances keep storing the
  -- code rather than an id.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'warehouseZones'
      AND index_name = 'warehouseZones_warehouse_code_idx'
  ) THEN
    CREATE UNIQUE INDEX `warehouseZones_warehouse_code_idx`
      ON `warehouseZones` (`warehouseId`, `code`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'warehouseBins'
      AND index_name = 'warehouseBins_warehouse_code_idx'
  ) THEN
    CREATE UNIQUE INDEX `warehouseBins_warehouse_code_idx`
      ON `warehouseBins` (`warehouseId`, `code`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'warehouseBins'
      AND index_name = 'warehouseBins_zone_idx'
  ) THEN
    CREATE INDEX `warehouseBins_zone_idx` ON `warehouseBins` (`zoneId`);
  END IF;

  -- A serial number identifies exactly one physical unit of a product. Two
  -- rows with the same serial for the same product would make traceability
  -- meaningless, which is the whole point of the table.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'serialNumbers'
      AND index_name = 'serialNumbers_product_serial_idx'
  ) THEN
    CREATE UNIQUE INDEX `serialNumbers_product_serial_idx`
      ON `serialNumbers` (`productId`, `serialNumber`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'serialNumbers'
      AND index_name = 'serialNumbers_lot_idx'
  ) THEN
    CREATE INDEX `serialNumbers_lot_idx` ON `serialNumbers` (`lotId`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'serialNumbers'
      AND index_name = 'serialNumbers_status_idx'
  ) THEN
    CREATE INDEX `serialNumbers_status_idx`
      ON `serialNumbers` (`status`, `warehouseId`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'serialNumberEvents'
      AND index_name = 'serialNumberEvents_serial_idx'
  ) THEN
    CREATE INDEX `serialNumberEvents_serial_idx`
      ON `serialNumberEvents` (`serialId`, `performedAt`);
  END IF;

  -- Bin-scoped balances: the write path now keys on
  -- (lotId, warehouseId, status, binId), so this index backs every lookup.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'inventoryBalances'
      AND index_name = 'inventoryBalances_lot_wh_status_bin_idx'
  ) THEN
    CREATE INDEX `inventoryBalances_lot_wh_status_bin_idx`
      ON `inventoryBalances` (`lotId`, `warehouseId`, `status`, `binId`);
  END IF;
END //
DELIMITER ;

CALL `_migrate_0063_bins_and_serials`();
DROP PROCEDURE IF EXISTS `_migrate_0063_bins_and_serials`;

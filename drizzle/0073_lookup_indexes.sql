-- 0073_lookup_indexes
--
-- The Sales hub loads payments and shipments for the orders on screen only. Without these
-- indexes each lookup scans the whole payments / shipments table.
--
-- Backed by drizzle/schema.ts. Re-runnable: each index is created only when missing.

DROP PROCEDURE IF EXISTS `_migrate_0073_add_index`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0073_add_index`(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl)
     AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx) THEN
    SET @ddl = CONCAT('CREATE INDEX `', idx, '` ON `', tbl, '` (', cols, ')');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0073_add_index`('payments', 'idx_payments_invoice', '`invoiceId`');
--> statement-breakpoint
CALL `_migrate_0073_add_index`('shipments', 'idx_shipments_order', '`orderId`');
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0073_add_index`;

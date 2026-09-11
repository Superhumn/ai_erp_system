-- Migration 0065: index purchase_orders (poNumber, vendorId).
--
-- Deliberately NOT unique. The table still holds the duplicate rows that
-- PR #396 shipped the tooling to clean up, so a unique key would fail to
-- create. It also can't be made unique inside a migration without the
-- migration deciding on its own which purchase orders to delete — and
-- deleting them destroys the line items the receipt-inflation report is
-- derived from. Clearing the duplicates stays a human decision.
--
-- A plain index is safe regardless of what is in the table, and it earns its
-- place twice over:
--
--   1. `createPurchaseOrderIfAbsent` serializes concurrent imports of the same
--      invoice with `SELECT ... FOR UPDATE`. Under InnoDB's REPEATABLE READ
--      that takes a gap lock on the empty range, which blocks a competing
--      insert of the same key. Without an index on the looked-up columns the
--      lock is far broader than intended.
--   2. `findPurchaseOrderByNumberExact` runs on every document import and was
--      scanning the table.
--
-- Once the duplicates are cleared, promoting this to UNIQUE is a one-line
-- follow-up and the lock above becomes belt-and-braces.
--
-- Idempotent: MySQL 8.0 has no CREATE INDEX IF NOT EXISTS, so the statement is
-- guarded against INFORMATION_SCHEMA.

DROP PROCEDURE IF EXISTS `_migrate_0065_po_number_vendor_index`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0065_po_number_vendor_index`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND INDEX_NAME = 'purchase_orders_poNumber_vendor_idx') THEN
    CREATE INDEX `purchase_orders_poNumber_vendor_idx` ON `purchase_orders` (`poNumber`, `vendorId`);
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0065_po_number_vendor_index`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0065_po_number_vendor_index`;

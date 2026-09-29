-- 0072_list_indexes
--
-- Indexes behind the high-volume list screens (orders, invoices, transactions,
-- customers, purchase orders) and their sortable columns. Without them every list, filter and customer
-- lookup scans the whole table: ~1 s per lookup at 1M orders.
--
-- Backed by drizzle/schema.ts. Re-runnable: each index is created only when
-- missing (MySQL 8 has no CREATE INDEX IF NOT EXISTS).

DROP PROCEDURE IF EXISTS `_migrate_0072_add_index`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0072_add_index`(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
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
CALL `_migrate_0072_add_index`('customers', 'idx_customers_created', '`createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('customers', 'idx_customers_company_created', '`companyId`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('orders', 'idx_orders_created', '`createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('orders', 'idx_orders_company_created', '`companyId`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('orders', 'idx_orders_customer_created', '`customerId`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('orders', 'idx_orders_status_created', '`status`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('orders', 'idx_orders_order_date', '`orderDate`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('orders', 'idx_orders_total', '`totalAmount`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('invoices', 'idx_invoices_created', '`createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('invoices', 'idx_invoices_company_created', '`companyId`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('invoices', 'idx_invoices_customer_created', '`customerId`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('invoices', 'idx_invoices_status_created', '`status`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('transactions', 'idx_transactions_date', '`date`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('transactions', 'idx_transactions_company_date', '`companyId`, `date`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('transactions', 'idx_transactions_type_date', '`type`, `date`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('transactions', 'idx_transactions_total', '`totalAmount`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('purchase_orders', 'idx_po_created', '`createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('purchase_orders', 'idx_po_company_created', '`companyId`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('purchase_orders', 'idx_po_vendor_created', '`vendorId`, `createdAt`');
--> statement-breakpoint
CALL `_migrate_0072_add_index`('purchase_orders', 'idx_po_status_created', '`status`, `createdAt`');
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0072_add_index`;

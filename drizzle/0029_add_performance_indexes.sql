-- Migration: Add performance indexes to ERP system tables
-- This migration adds indexes on foreign keys, status/enum columns,
-- date columns, and composite indexes for common query patterns.
-- MySQL does not support IF NOT EXISTS for CREATE INDEX, so these
-- are standard CREATE INDEX statements.

-- ============================================
-- FOREIGN KEY INDEXES
-- ============================================

-- customers
CREATE INDEX `idx_customers_companyId` ON `customers` (`companyId`);
--> statement-breakpoint

-- vendors
CREATE INDEX `idx_vendors_companyId` ON `vendors` (`companyId`);
--> statement-breakpoint

-- products
CREATE INDEX `idx_products_companyId` ON `products` (`companyId`);
--> statement-breakpoint

-- invoices
CREATE INDEX `idx_invoices_companyId` ON `invoices` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_customerId` ON `invoices` (`customerId`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_createdBy` ON `invoices` (`createdBy`);
--> statement-breakpoint

-- invoice_items
CREATE INDEX `idx_invoice_items_invoiceId` ON `invoice_items` (`invoiceId`);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_productId` ON `invoice_items` (`productId`);
--> statement-breakpoint

-- payments
CREATE INDEX `idx_payments_companyId` ON `payments` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_payments_invoiceId` ON `payments` (`invoiceId`);
--> statement-breakpoint
CREATE INDEX `idx_payments_vendorId` ON `payments` (`vendorId`);
--> statement-breakpoint
CREATE INDEX `idx_payments_customerId` ON `payments` (`customerId`);
--> statement-breakpoint

-- transactions
CREATE INDEX `idx_transactions_companyId` ON `transactions` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_createdBy` ON `transactions` (`createdBy`);
--> statement-breakpoint

-- transaction_lines
CREATE INDEX `idx_transaction_lines_transactionId` ON `transaction_lines` (`transactionId`);
--> statement-breakpoint
CREATE INDEX `idx_transaction_lines_accountId` ON `transaction_lines` (`accountId`);
--> statement-breakpoint

-- orders
CREATE INDEX `idx_orders_companyId` ON `orders` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_orders_customerId` ON `orders` (`customerId`);
--> statement-breakpoint
CREATE INDEX `idx_orders_invoiceId` ON `orders` (`invoiceId`);
--> statement-breakpoint

-- order_items
CREATE INDEX `idx_order_items_orderId` ON `order_items` (`orderId`);
--> statement-breakpoint
CREATE INDEX `idx_order_items_productId` ON `order_items` (`productId`);
--> statement-breakpoint

-- inventory
CREATE INDEX `idx_inventory_companyId` ON `inventory` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_productId` ON `inventory` (`productId`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_warehouseId` ON `inventory` (`warehouseId`);
--> statement-breakpoint

-- purchase_orders
CREATE INDEX `idx_purchase_orders_companyId` ON `purchase_orders` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_vendorId` ON `purchase_orders` (`vendorId`);
--> statement-breakpoint

-- purchase_order_items
CREATE INDEX `idx_purchase_order_items_purchaseOrderId` ON `purchase_order_items` (`purchaseOrderId`);
--> statement-breakpoint
CREATE INDEX `idx_purchase_order_items_productId` ON `purchase_order_items` (`productId`);
--> statement-breakpoint

-- shipments
CREATE INDEX `idx_shipments_companyId` ON `shipments` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_shipments_orderId` ON `shipments` (`orderId`);
--> statement-breakpoint
CREATE INDEX `idx_shipments_purchaseOrderId` ON `shipments` (`purchaseOrderId`);
--> statement-breakpoint

-- employees
CREATE INDEX `idx_employees_companyId` ON `employees` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_employees_userId` ON `employees` (`userId`);
--> statement-breakpoint
CREATE INDEX `idx_employees_departmentId` ON `employees` (`departmentId`);
--> statement-breakpoint

-- contracts
CREATE INDEX `idx_contracts_companyId` ON `contracts` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_contracts_partyId` ON `contracts` (`partyId`);
--> statement-breakpoint

-- projects
CREATE INDEX `idx_projects_companyId` ON `projects` (`companyId`);
--> statement-breakpoint

-- audit_logs
CREATE INDEX `idx_audit_logs_userId` ON `audit_logs` (`userId`);
--> statement-breakpoint

-- notifications
CREATE INDEX `idx_notifications_userId` ON `notifications` (`userId`);
--> statement-breakpoint

-- userPermissions
CREATE INDEX `idx_userPermissions_userId` ON `userPermissions` (`userId`);
--> statement-breakpoint

-- googleOAuthTokens
CREATE INDEX `idx_googleOAuthTokens_userId` ON `googleOAuthTokens` (`userId`);
--> statement-breakpoint

-- quickbooksOAuthTokens
CREATE INDEX `idx_quickbooksOAuthTokens_userId` ON `quickbooksOAuthTokens` (`userId`);
--> statement-breakpoint

-- inventory_transfers
CREATE INDEX `idx_inventory_transfers_fromWarehouseId` ON `inventory_transfers` (`fromWarehouseId`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_transfers_toWarehouseId` ON `inventory_transfers` (`toWarehouseId`);
--> statement-breakpoint

-- inventory_transfer_items
CREATE INDEX `idx_inventory_transfer_items_transferId` ON `inventory_transfer_items` (`transferId`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_transfer_items_productId` ON `inventory_transfer_items` (`productId`);
--> statement-breakpoint

-- production_batches
CREATE INDEX `idx_production_batches_companyId` ON `production_batches` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_production_batches_productId` ON `production_batches` (`productId`);
--> statement-breakpoint

-- workOrders
CREATE INDEX `idx_workOrders_bomId` ON `workOrders` (`bomId`);
--> statement-breakpoint
CREATE INDEX `idx_workOrders_warehouseId` ON `workOrders` (`warehouseId`);
--> statement-breakpoint

-- bomComponents
CREATE INDEX `idx_bomComponents_bomId` ON `bomComponents` (`bomId`);
--> statement-breakpoint
CREATE INDEX `idx_bomComponents_rawMaterialId` ON `bomComponents` (`rawMaterialId`);
--> statement-breakpoint

-- freightQuotes
CREATE INDEX `idx_freightQuotes_rfqId` ON `freightQuotes` (`rfqId`);
--> statement-breakpoint
CREATE INDEX `idx_freightQuotes_carrierId` ON `freightQuotes` (`carrierId`);
--> statement-breakpoint

-- inbound_emails
CREATE INDEX `idx_inbound_emails_companyId` ON `inbound_emails` (`companyId`);
--> statement-breakpoint

-- data_room_documents
CREATE INDEX `idx_data_room_documents_folderId` ON `data_room_documents` (`folderId`);
--> statement-breakpoint
CREATE INDEX `idx_data_room_documents_dataRoomId` ON `data_room_documents` (`dataRoomId`);
--> statement-breakpoint

-- crm_contacts
CREATE INDEX `idx_crm_contacts_companyId` ON `crm_contacts` (`companyId`);
--> statement-breakpoint

-- crm_deals
CREATE INDEX `idx_crm_deals_pipelineId` ON `crm_deals` (`pipelineId`);
--> statement-breakpoint
CREATE INDEX `idx_crm_deals_contactId` ON `crm_deals` (`contactId`);
--> statement-breakpoint

-- ai_conversations
CREATE INDEX `idx_ai_conversations_userId` ON `ai_conversations` (`userId`);
--> statement-breakpoint

-- ============================================
-- STATUS / ENUM INDEXES
-- ============================================

CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_orders_status` ON `orders` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_status` ON `purchase_orders` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_shipments_status` ON `shipments` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_contracts_status` ON `contracts` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_payments_status` ON `payments` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_transfers_status` ON `inventory_transfers` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_workOrders_status` ON `workOrders` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_customers_status` ON `customers` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_vendors_status` ON `vendors` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_products_status` ON `products` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_employees_status` ON `employees` (`status`);
--> statement-breakpoint

-- ============================================
-- DATE INDEXES (for range queries and sorting)
-- ============================================

CREATE INDEX `idx_invoices_createdAt` ON `invoices` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_orders_createdAt` ON `orders` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_payments_paymentDate` ON `payments` (`paymentDate`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`date`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_createdAt` ON `audit_logs` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_inbound_emails_createdAt` ON `inbound_emails` (`createdAt`);
--> statement-breakpoint

-- ============================================
-- COMPOSITE INDEXES (common query patterns)
-- ============================================

CREATE INDEX `idx_inventory_productId_warehouseId` ON `inventory` (`productId`, `warehouseId`);
--> statement-breakpoint
CREATE INDEX `idx_order_items_orderId_productId` ON `order_items` (`orderId`, `productId`);
--> statement-breakpoint
CREATE INDEX `idx_purchase_order_items_purchaseOrderId_productId` ON `purchase_order_items` (`purchaseOrderId`, `productId`);

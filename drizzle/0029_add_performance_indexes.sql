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

-- vendors
CREATE INDEX `idx_vendors_companyId` ON `vendors` (`companyId`);

-- products
CREATE INDEX `idx_products_companyId` ON `products` (`companyId`);

-- invoices
CREATE INDEX `idx_invoices_companyId` ON `invoices` (`companyId`);
CREATE INDEX `idx_invoices_customerId` ON `invoices` (`customerId`);
CREATE INDEX `idx_invoices_createdBy` ON `invoices` (`createdBy`);

-- invoice_items
CREATE INDEX `idx_invoice_items_invoiceId` ON `invoice_items` (`invoiceId`);
CREATE INDEX `idx_invoice_items_productId` ON `invoice_items` (`productId`);

-- payments
CREATE INDEX `idx_payments_companyId` ON `payments` (`companyId`);
CREATE INDEX `idx_payments_invoiceId` ON `payments` (`invoiceId`);
CREATE INDEX `idx_payments_vendorId` ON `payments` (`vendorId`);
CREATE INDEX `idx_payments_customerId` ON `payments` (`customerId`);

-- transactions
CREATE INDEX `idx_transactions_companyId` ON `transactions` (`companyId`);
CREATE INDEX `idx_transactions_createdBy` ON `transactions` (`createdBy`);

-- transaction_lines
CREATE INDEX `idx_transaction_lines_transactionId` ON `transaction_lines` (`transactionId`);
CREATE INDEX `idx_transaction_lines_accountId` ON `transaction_lines` (`accountId`);

-- orders
CREATE INDEX `idx_orders_companyId` ON `orders` (`companyId`);
CREATE INDEX `idx_orders_customerId` ON `orders` (`customerId`);
CREATE INDEX `idx_orders_invoiceId` ON `orders` (`invoiceId`);

-- order_items
CREATE INDEX `idx_order_items_orderId` ON `order_items` (`orderId`);
CREATE INDEX `idx_order_items_productId` ON `order_items` (`productId`);

-- inventory
CREATE INDEX `idx_inventory_companyId` ON `inventory` (`companyId`);
CREATE INDEX `idx_inventory_productId` ON `inventory` (`productId`);
CREATE INDEX `idx_inventory_warehouseId` ON `inventory` (`warehouseId`);

-- purchase_orders
CREATE INDEX `idx_purchase_orders_companyId` ON `purchase_orders` (`companyId`);
CREATE INDEX `idx_purchase_orders_vendorId` ON `purchase_orders` (`vendorId`);

-- purchase_order_items
CREATE INDEX `idx_purchase_order_items_purchaseOrderId` ON `purchase_order_items` (`purchaseOrderId`);
CREATE INDEX `idx_purchase_order_items_productId` ON `purchase_order_items` (`productId`);

-- shipments
CREATE INDEX `idx_shipments_companyId` ON `shipments` (`companyId`);
CREATE INDEX `idx_shipments_orderId` ON `shipments` (`orderId`);
CREATE INDEX `idx_shipments_purchaseOrderId` ON `shipments` (`purchaseOrderId`);

-- employees
CREATE INDEX `idx_employees_companyId` ON `employees` (`companyId`);
CREATE INDEX `idx_employees_userId` ON `employees` (`userId`);
CREATE INDEX `idx_employees_departmentId` ON `employees` (`departmentId`);

-- contracts
CREATE INDEX `idx_contracts_companyId` ON `contracts` (`companyId`);
CREATE INDEX `idx_contracts_partyId` ON `contracts` (`partyId`);

-- projects
CREATE INDEX `idx_projects_companyId` ON `projects` (`companyId`);

-- audit_logs
CREATE INDEX `idx_audit_logs_userId` ON `audit_logs` (`userId`);

-- notifications
CREATE INDEX `idx_notifications_userId` ON `notifications` (`userId`);

-- userPermissions
CREATE INDEX `idx_userPermissions_userId` ON `userPermissions` (`userId`);

-- googleOAuthTokens
CREATE INDEX `idx_googleOAuthTokens_userId` ON `googleOAuthTokens` (`userId`);

-- quickbooksOAuthTokens
CREATE INDEX `idx_quickbooksOAuthTokens_userId` ON `quickbooksOAuthTokens` (`userId`);

-- inventory_transfers
CREATE INDEX `idx_inventory_transfers_fromWarehouseId` ON `inventory_transfers` (`fromWarehouseId`);
CREATE INDEX `idx_inventory_transfers_toWarehouseId` ON `inventory_transfers` (`toWarehouseId`);

-- inventory_transfer_items
CREATE INDEX `idx_inventory_transfer_items_transferId` ON `inventory_transfer_items` (`transferId`);
CREATE INDEX `idx_inventory_transfer_items_productId` ON `inventory_transfer_items` (`productId`);

-- production_batches
CREATE INDEX `idx_production_batches_companyId` ON `production_batches` (`companyId`);
CREATE INDEX `idx_production_batches_productId` ON `production_batches` (`productId`);

-- workOrders
CREATE INDEX `idx_workOrders_bomId` ON `workOrders` (`bomId`);
CREATE INDEX `idx_workOrders_warehouseId` ON `workOrders` (`warehouseId`);

-- bomComponents
CREATE INDEX `idx_bomComponents_bomId` ON `bomComponents` (`bomId`);
CREATE INDEX `idx_bomComponents_rawMaterialId` ON `bomComponents` (`rawMaterialId`);

-- freightQuotes
CREATE INDEX `idx_freightQuotes_rfqId` ON `freightQuotes` (`rfqId`);
CREATE INDEX `idx_freightQuotes_carrierId` ON `freightQuotes` (`carrierId`);

-- inbound_emails
CREATE INDEX `idx_inbound_emails_companyId` ON `inbound_emails` (`companyId`);

-- data_room_documents
CREATE INDEX `idx_data_room_documents_folderId` ON `data_room_documents` (`folderId`);
CREATE INDEX `idx_data_room_documents_dataRoomId` ON `data_room_documents` (`dataRoomId`);

-- crm_contacts
CREATE INDEX `idx_crm_contacts_companyId` ON `crm_contacts` (`companyId`);

-- crm_deals
CREATE INDEX `idx_crm_deals_pipelineId` ON `crm_deals` (`pipelineId`);
CREATE INDEX `idx_crm_deals_contactId` ON `crm_deals` (`contactId`);

-- ai_conversations
CREATE INDEX `idx_ai_conversations_userId` ON `ai_conversations` (`userId`);

-- ============================================
-- STATUS / ENUM INDEXES
-- ============================================

CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);
CREATE INDEX `idx_orders_status` ON `orders` (`status`);
CREATE INDEX `idx_purchase_orders_status` ON `purchase_orders` (`status`);
CREATE INDEX `idx_shipments_status` ON `shipments` (`status`);
CREATE INDEX `idx_contracts_status` ON `contracts` (`status`);
CREATE INDEX `idx_payments_status` ON `payments` (`status`);
CREATE INDEX `idx_inventory_transfers_status` ON `inventory_transfers` (`status`);
CREATE INDEX `idx_workOrders_status` ON `workOrders` (`status`);
CREATE INDEX `idx_customers_status` ON `customers` (`status`);
CREATE INDEX `idx_vendors_status` ON `vendors` (`status`);
CREATE INDEX `idx_products_status` ON `products` (`status`);
CREATE INDEX `idx_employees_status` ON `employees` (`status`);

-- ============================================
-- DATE INDEXES (for range queries and sorting)
-- ============================================

CREATE INDEX `idx_invoices_createdAt` ON `invoices` (`createdAt`);
CREATE INDEX `idx_orders_createdAt` ON `orders` (`createdAt`);
CREATE INDEX `idx_payments_paymentDate` ON `payments` (`paymentDate`);
CREATE INDEX `idx_transactions_date` ON `transactions` (`date`);
CREATE INDEX `idx_audit_logs_createdAt` ON `audit_logs` (`createdAt`);
CREATE INDEX `idx_inbound_emails_createdAt` ON `inbound_emails` (`createdAt`);

-- ============================================
-- COMPOSITE INDEXES (common query patterns)
-- ============================================

CREATE INDEX `idx_inventory_productId_warehouseId` ON `inventory` (`productId`, `warehouseId`);
CREATE INDEX `idx_order_items_orderId_productId` ON `order_items` (`orderId`, `productId`);
CREATE INDEX `idx_purchase_order_items_purchaseOrderId_productId` ON `purchase_order_items` (`purchaseOrderId`, `productId`);

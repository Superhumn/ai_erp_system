-- Migration: Add critical indexes and foreign key constraints
-- This addresses missing indexes on FK columns, status fields, and natural keys

-- ============================================
-- INDEXES ON FOREIGN KEY COLUMNS (join performance)
-- ============================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_departmentId ON users (departmentId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_users_linkedVendorId ON users (linkedVendorId);
--> statement-breakpoint

-- Team Invitations
CREATE INDEX IF NOT EXISTS idx_teamInvitations_invitedBy ON teamInvitations (invitedBy);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_teamInvitations_status ON teamInvitations (status);
--> statement-breakpoint

-- User Permissions
CREATE INDEX IF NOT EXISTS idx_userPermissions_userId ON userPermissions (userId);
--> statement-breakpoint

-- Google/QuickBooks OAuth Tokens
CREATE INDEX IF NOT EXISTS idx_googleOAuthTokens_userId ON googleOAuthTokens (userId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_quickbooksOAuthTokens_userId ON quickbooksOAuthTokens (userId);
--> statement-breakpoint

-- QuickBooks Accounts & Mappings
CREATE INDEX IF NOT EXISTS idx_quickbooksAccounts_companyId ON quickbooksAccounts (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_quickbooksAccountMappings_companyId ON quickbooksAccountMappings (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_quickbooksItems_companyId ON quickbooksItems (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_quickbooksItems_productId ON quickbooksItems (productId);
--> statement-breakpoint

-- Companies
CREATE INDEX IF NOT EXISTS idx_companies_parentCompanyId ON companies (parentCompanyId);
--> statement-breakpoint

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_companyId ON customers (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name(191));
--> statement-breakpoint

-- Vendors
CREATE INDEX IF NOT EXISTS idx_vendors_companyId ON vendors (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors (name(191));
--> statement-breakpoint

-- Products
CREATE INDEX IF NOT EXISTS idx_products_companyId ON products (companyId);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
--> statement-breakpoint

-- Accounts
CREATE INDEX IF NOT EXISTS idx_accounts_companyId ON accounts (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_accounts_parentAccountId ON accounts (parentAccountId);
--> statement-breakpoint

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_companyId ON invoices (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoices_customerId ON invoices (customerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoices_dueDate ON invoices (dueDate);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoiceNumber ON invoices (invoiceNumber);
--> statement-breakpoint

-- Invoice Items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items (invoiceId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_invoice_items_productId ON invoice_items (productId);
--> statement-breakpoint

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_accountId ON payments (accountId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_payments_vendorId ON payments (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_payments_customerId ON payments (customerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_payments_invoiceId ON payments (invoiceId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
--> statement-breakpoint

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_companyId ON transactions (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_transactions_referenceType_referenceId ON transactions (referenceType, referenceId);
--> statement-breakpoint

-- Transaction Lines
CREATE INDEX IF NOT EXISTS idx_transaction_lines_transactionId ON transaction_lines (transactionId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_transaction_lines_accountId ON transaction_lines (accountId);
--> statement-breakpoint

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_companyId ON orders (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_orders_customerId ON orders (customerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_orderNumber ON orders (orderNumber);
--> statement-breakpoint

-- Order Items
CREATE INDEX IF NOT EXISTS idx_order_items_orderId ON order_items (orderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_order_items_productId ON order_items (productId);
--> statement-breakpoint

-- Inventory
CREATE INDEX IF NOT EXISTS idx_inventory_productId ON inventory (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventory_companyId ON inventory (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventory_warehouseId ON inventory (warehouseId);
--> statement-breakpoint

-- Warehouses
CREATE INDEX IF NOT EXISTS idx_warehouses_companyId ON warehouses (companyId);
--> statement-breakpoint

-- Inventory Transfers
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_fromWarehouseId ON inventory_transfers (fromWarehouseId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_toWarehouseId ON inventory_transfers (toWarehouseId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status ON inventory_transfers (status);
--> statement-breakpoint

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendorId ON purchase_orders (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_purchase_orders_companyId ON purchase_orders (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_poNumber ON purchase_orders (poNumber);
--> statement-breakpoint

-- Purchase Order Items
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_purchaseOrderId ON purchase_order_items (purchaseOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_productId ON purchase_order_items (productId);
--> statement-breakpoint

-- Shipments
CREATE INDEX IF NOT EXISTS idx_shipments_companyId ON shipments (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shipments_purchaseOrderId ON shipments (purchaseOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments (status);
--> statement-breakpoint

-- Departments
CREATE INDEX IF NOT EXISTS idx_departments_companyId ON departments (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_departments_parentDepartmentId ON departments (parentDepartmentId);
--> statement-breakpoint

-- Employees
CREATE INDEX IF NOT EXISTS idx_employees_companyId ON employees (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_employees_departmentId ON employees (departmentId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_employees_managerId ON employees (managerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees (email);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employeeNumber ON employees (employeeNumber);
--> statement-breakpoint

-- Compensation History
CREATE INDEX IF NOT EXISTS idx_compensation_history_employeeId ON compensation_history (employeeId);
--> statement-breakpoint

-- Employee Payments
CREATE INDEX IF NOT EXISTS idx_employee_payments_employeeId ON employee_payments (employeeId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_employee_payments_status ON employee_payments (status);
--> statement-breakpoint

-- Contracts
CREATE INDEX IF NOT EXISTS idx_contracts_companyId ON contracts (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contracts_customerId ON contracts (customerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contracts_vendorId ON contracts (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_contractNumber ON contracts (contractNumber);
--> statement-breakpoint

-- Contract Key Dates
CREATE INDEX IF NOT EXISTS idx_contract_key_dates_contractId ON contract_key_dates (contractId);
--> statement-breakpoint

-- Disputes
CREATE INDEX IF NOT EXISTS idx_disputes_companyId ON disputes (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);
--> statement-breakpoint

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_companyId ON documents (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_entityType_entityId ON documents (entityType, entityId);
--> statement-breakpoint

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_companyId ON projects (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_projectNumber ON projects (projectNumber);
--> statement-breakpoint

-- Project Tasks
CREATE INDEX IF NOT EXISTS idx_project_tasks_projectId ON project_tasks (projectId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_tasks_milestoneId ON project_tasks (milestoneId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigneeId ON project_tasks (assigneeId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks (status);
--> statement-breakpoint

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs (userId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_logs_entityType_entityId ON audit_logs (entityType, entityId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs (createdAt);
--> statement-breakpoint

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications (userId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_notifications_isRead ON notifications (isRead);
--> statement-breakpoint

-- AI Conversations & Messages
CREATE INDEX IF NOT EXISTS idx_ai_conversations_userId ON ai_conversations (userId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversationId ON ai_messages (conversationId);
--> statement-breakpoint

-- Inbound Emails
CREATE INDEX IF NOT EXISTS idx_inbound_emails_status ON inbound_emails (status);
--> statement-breakpoint

-- Parsed Documents
CREATE INDEX IF NOT EXISTS idx_parsed_documents_inboundEmailId ON parsed_documents (inboundEmailId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_parsed_documents_vendorId ON parsed_documents (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_parsed_documents_status ON parsed_documents (status);
--> statement-breakpoint

-- Sent Emails
CREATE INDEX IF NOT EXISTS idx_sent_emails_recipientEmail ON sent_emails (recipientEmail);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sent_emails_status ON sent_emails (status);
--> statement-breakpoint

-- Sales Orders
CREATE INDEX IF NOT EXISTS idx_salesOrders_customerId ON salesOrders (customerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_salesOrders_status ON salesOrders (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_salesOrders_shopifyOrderId ON salesOrders (shopifyOrderId);
--> statement-breakpoint

-- Sales Order Lines
CREATE INDEX IF NOT EXISTS idx_salesOrderLines_salesOrderId ON salesOrderLines (salesOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_salesOrderLines_productId ON salesOrderLines (productId);
--> statement-breakpoint

-- Data Rooms
CREATE INDEX IF NOT EXISTS idx_data_rooms_createdBy ON data_rooms (createdBy);
--> statement-breakpoint

-- Data Room Documents
CREATE INDEX IF NOT EXISTS idx_data_room_documents_dataRoomId ON data_room_documents (dataRoomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_room_documents_folderId ON data_room_documents (folderId);
--> statement-breakpoint

-- Data Room Visitors
CREATE INDEX IF NOT EXISTS idx_data_room_visitors_dataRoomId ON data_room_visitors (dataRoomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_room_visitors_email ON data_room_visitors (email);
--> statement-breakpoint

-- Data Room Links
CREATE INDEX IF NOT EXISTS idx_data_room_links_dataRoomId ON data_room_links (dataRoomId);
--> statement-breakpoint

-- CRM Contacts
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts (email);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assignedTo ON crm_contacts (assignedTo);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts (status);
--> statement-breakpoint

-- CRM Deals
CREATE INDEX IF NOT EXISTS idx_crm_deals_contactId ON crm_deals (contactId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_deals_pipelineId ON crm_deals (pipelineId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_deals_assignedTo ON crm_deals (assignedTo);
--> statement-breakpoint

-- Work Orders
CREATE INDEX IF NOT EXISTS idx_workOrders_bomId ON workOrders (bomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workOrders_status ON workOrders (status);
--> statement-breakpoint

-- BOM Components
CREATE INDEX IF NOT EXISTS idx_bomComponents_bomId ON bomComponents (bomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_bomComponents_rawMaterialId ON bomComponents (rawMaterialId);
--> statement-breakpoint

-- Supply Chain Workflows
CREATE INDEX IF NOT EXISTS idx_supplyChainWorkflows_status ON supplyChainWorkflows (status);
--> statement-breakpoint

-- Workflow Runs
CREATE INDEX IF NOT EXISTS idx_workflowRuns_workflowId ON workflowRuns (workflowId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workflowRuns_status ON workflowRuns (status);
--> statement-breakpoint

-- Vendor RFQs
CREATE INDEX IF NOT EXISTS idx_vendorRfqs_status ON vendorRfqs (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendorRfqs_createdBy ON vendorRfqs (createdBy);
--> statement-breakpoint

-- Vendor Quotes
CREATE INDEX IF NOT EXISTS idx_vendorQuotes_rfqId ON vendorQuotes (rfqId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendorQuotes_vendorId ON vendorQuotes (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendorQuotes_status ON vendorQuotes (status);
--> statement-breakpoint

-- EDI Transactions
CREATE INDEX IF NOT EXISTS idx_edi_transactions_partnerId ON edi_transactions (partnerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_transactions_status ON edi_transactions (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_transactions_transactionSetType ON edi_transactions (transactionSetType);
--> statement-breakpoint

-- ============================================
-- FOREIGN KEY CONSTRAINTS (referential integrity)
-- ============================================

-- Users
ALTER TABLE users ADD CONSTRAINT fk_users_departmentId FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT fk_users_linkedVendorId FOREIGN KEY (linkedVendorId) REFERENCES vendors(id) ON DELETE SET NULL;
--> statement-breakpoint

-- User Permissions
ALTER TABLE userPermissions ADD CONSTRAINT fk_userPermissions_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;
--> statement-breakpoint

-- Google/QuickBooks OAuth
ALTER TABLE googleOAuthTokens ADD CONSTRAINT fk_googleOAuthTokens_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE quickbooksOAuthTokens ADD CONSTRAINT fk_quickbooksOAuthTokens_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;
--> statement-breakpoint

-- Companies
ALTER TABLE companies ADD CONSTRAINT fk_companies_parentCompanyId FOREIGN KEY (parentCompanyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Customers
ALTER TABLE customers ADD CONSTRAINT fk_customers_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Vendors
ALTER TABLE vendors ADD CONSTRAINT fk_vendors_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Products
ALTER TABLE products ADD CONSTRAINT fk_products_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Accounts
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_parentAccountId FOREIGN KEY (parentAccountId) REFERENCES accounts(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Invoices
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customerId FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Invoice Items
ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_invoiceId FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_productId FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Payments
ALTER TABLE payments ADD CONSTRAINT fk_payments_accountId FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT fk_payments_vendorId FOREIGN KEY (vendorId) REFERENCES vendors(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT fk_payments_customerId FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT fk_payments_invoiceId FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Transaction Lines
ALTER TABLE transaction_lines ADD CONSTRAINT fk_transaction_lines_transactionId FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE transaction_lines ADD CONSTRAINT fk_transaction_lines_accountId FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Orders
ALTER TABLE orders ADD CONSTRAINT fk_orders_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT fk_orders_customerId FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Order Items
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_orderId FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_productId FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Inventory
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_productId FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_warehouseId FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Warehouses
ALTER TABLE warehouses ADD CONSTRAINT fk_warehouses_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Inventory Transfers
ALTER TABLE inventory_transfers ADD CONSTRAINT fk_inventory_transfers_fromWarehouseId FOREIGN KEY (fromWarehouseId) REFERENCES warehouses(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE inventory_transfers ADD CONSTRAINT fk_inventory_transfers_toWarehouseId FOREIGN KEY (toWarehouseId) REFERENCES warehouses(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Purchase Orders
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_vendorId FOREIGN KEY (vendorId) REFERENCES vendors(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Purchase Order Items
ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_purchaseOrderId FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_productId FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Shipments
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_purchaseOrderId FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Departments
ALTER TABLE departments ADD CONSTRAINT fk_departments_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE departments ADD CONSTRAINT fk_departments_parentDepartmentId FOREIGN KEY (parentDepartmentId) REFERENCES departments(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Employees
ALTER TABLE employees ADD CONSTRAINT fk_employees_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE employees ADD CONSTRAINT fk_employees_departmentId FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE employees ADD CONSTRAINT fk_employees_managerId FOREIGN KEY (managerId) REFERENCES employees(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Compensation History
ALTER TABLE compensation_history ADD CONSTRAINT fk_compensation_history_employeeId FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE;
--> statement-breakpoint

-- Employee Payments
ALTER TABLE employee_payments ADD CONSTRAINT fk_employee_payments_employeeId FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Contracts
ALTER TABLE contracts ADD CONSTRAINT fk_contracts_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE contracts ADD CONSTRAINT fk_contracts_customerId FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE contracts ADD CONSTRAINT fk_contracts_vendorId FOREIGN KEY (vendorId) REFERENCES vendors(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Contract Key Dates
ALTER TABLE contract_key_dates ADD CONSTRAINT fk_contract_key_dates_contractId FOREIGN KEY (contractId) REFERENCES contracts(id) ON DELETE CASCADE;
--> statement-breakpoint

-- Documents
ALTER TABLE documents ADD CONSTRAINT fk_documents_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Projects
ALTER TABLE projects ADD CONSTRAINT fk_projects_companyId FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Project Milestones
ALTER TABLE project_milestones ADD CONSTRAINT fk_project_milestones_projectId FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE;
--> statement-breakpoint

-- Project Tasks
ALTER TABLE project_tasks ADD CONSTRAINT fk_project_tasks_projectId FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE project_tasks ADD CONSTRAINT fk_project_tasks_milestoneId FOREIGN KEY (milestoneId) REFERENCES project_milestones(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Audit Logs
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Notifications
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;
--> statement-breakpoint

-- AI Conversations & Messages
ALTER TABLE ai_conversations ADD CONSTRAINT fk_ai_conversations_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ai_messages ADD CONSTRAINT fk_ai_messages_conversationId FOREIGN KEY (conversationId) REFERENCES ai_conversations(id) ON DELETE CASCADE;
--> statement-breakpoint

-- BOM
ALTER TABLE bomComponents ADD CONSTRAINT fk_bomComponents_bomId FOREIGN KEY (bomId) REFERENCES billOfMaterials(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE bomComponents ADD CONSTRAINT fk_bomComponents_rawMaterialId FOREIGN KEY (rawMaterialId) REFERENCES rawMaterials(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Work Orders
ALTER TABLE workOrders ADD CONSTRAINT fk_workOrders_bomId FOREIGN KEY (bomId) REFERENCES billOfMaterials(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE workOrderMaterials ADD CONSTRAINT fk_workOrderMaterials_workOrderId FOREIGN KEY (workOrderId) REFERENCES workOrders(id) ON DELETE CASCADE;
--> statement-breakpoint

-- Sales Orders
ALTER TABLE salesOrderLines ADD CONSTRAINT fk_salesOrderLines_salesOrderId FOREIGN KEY (salesOrderId) REFERENCES salesOrders(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE salesOrderLines ADD CONSTRAINT fk_salesOrderLines_productId FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Data Rooms
ALTER TABLE data_room_folders ADD CONSTRAINT fk_data_room_folders_dataRoomId FOREIGN KEY (dataRoomId) REFERENCES data_rooms(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE data_room_documents ADD CONSTRAINT fk_data_room_documents_dataRoomId FOREIGN KEY (dataRoomId) REFERENCES data_rooms(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE data_room_documents ADD CONSTRAINT fk_data_room_documents_folderId FOREIGN KEY (folderId) REFERENCES data_room_folders(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE data_room_links ADD CONSTRAINT fk_data_room_links_dataRoomId FOREIGN KEY (dataRoomId) REFERENCES data_rooms(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE data_room_visitors ADD CONSTRAINT fk_data_room_visitors_dataRoomId FOREIGN KEY (dataRoomId) REFERENCES data_rooms(id) ON DELETE CASCADE;
--> statement-breakpoint

-- CRM
ALTER TABLE crm_contact_tags ADD CONSTRAINT fk_crm_contact_tags_contactId FOREIGN KEY (contactId) REFERENCES crm_contacts(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE crm_contact_tags ADD CONSTRAINT fk_crm_contact_tags_tagId FOREIGN KEY (tagId) REFERENCES crm_tags(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE crm_deals ADD CONSTRAINT fk_crm_deals_contactId FOREIGN KEY (contactId) REFERENCES crm_contacts(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE crm_deals ADD CONSTRAINT fk_crm_deals_pipelineId FOREIGN KEY (pipelineId) REFERENCES crm_pipelines(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Vendor RFQs
ALTER TABLE vendorQuotes ADD CONSTRAINT fk_vendorQuotes_rfqId FOREIGN KEY (rfqId) REFERENCES vendorRfqs(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE vendorQuotes ADD CONSTRAINT fk_vendorQuotes_vendorId FOREIGN KEY (vendorId) REFERENCES vendors(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- EDI
ALTER TABLE edi_transactions ADD CONSTRAINT fk_edi_transactions_partnerId FOREIGN KEY (partnerId) REFERENCES edi_trading_partners(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE edi_transaction_items ADD CONSTRAINT fk_edi_transaction_items_transactionId FOREIGN KEY (transactionId) REFERENCES edi_transactions(id) ON DELETE CASCADE;
--> statement-breakpoint

-- Workflow
ALTER TABLE workflowRuns ADD CONSTRAINT fk_workflowRuns_workflowId FOREIGN KEY (workflowId) REFERENCES supplyChainWorkflows(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE workflowSteps ADD CONSTRAINT fk_workflowSteps_runId FOREIGN KEY (runId) REFERENCES workflowRuns(id) ON DELETE CASCADE;

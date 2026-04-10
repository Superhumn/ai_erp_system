-- Migration: Additional indexes and unique constraints
-- Covers remaining FK columns, status fields, date ranges, and natural keys
-- identified by comprehensive schema audit

-- ============================================
-- MISSING FK INDEXES (not covered in 0029)
-- ============================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_linkedWarehouseId ON users (linkedWarehouseId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_users_invitedBy ON users (invitedBy);
--> statement-breakpoint

-- Team Invitations
CREATE INDEX IF NOT EXISTS idx_teamInvitations_linkedVendorId ON teamInvitations (linkedVendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_teamInvitations_acceptedByUserId ON teamInvitations (acceptedByUserId);
--> statement-breakpoint

-- User Permissions
CREATE INDEX IF NOT EXISTS idx_userPermissions_grantedBy ON userPermissions (grantedBy);
--> statement-breakpoint

-- Products
CREATE INDEX IF NOT EXISTS idx_products_preferredVendorId ON products (preferredVendorId);
--> statement-breakpoint

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_createdBy ON invoices (createdBy);
--> statement-breakpoint

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_companyId ON payments (companyId);
--> statement-breakpoint

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_createdBy ON transactions (createdBy);
--> statement-breakpoint

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_invoiceId ON orders (invoiceId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_orders_createdBy ON orders (createdBy);
--> statement-breakpoint

-- Inventory Transfers
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_requestedBy ON inventory_transfers (requestedBy);
--> statement-breakpoint

-- Production Batches
CREATE INDEX IF NOT EXISTS idx_production_batches_companyId ON production_batches (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_production_batches_productId ON production_batches (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_production_batches_warehouseId ON production_batches (warehouseId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON production_batches (status);
--> statement-breakpoint

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_createdBy ON purchase_orders (createdBy);
--> statement-breakpoint

-- Shipments
CREATE INDEX IF NOT EXISTS idx_shipments_orderId ON shipments (orderId);
--> statement-breakpoint

-- Departments
CREATE INDEX IF NOT EXISTS idx_departments_managerId ON departments (managerId);
--> statement-breakpoint

-- Employees
CREATE INDEX IF NOT EXISTS idx_employees_userId ON employees (userId);
--> statement-breakpoint

-- Employee Payments
CREATE INDEX IF NOT EXISTS idx_employee_payments_companyId ON employee_payments (companyId);
--> statement-breakpoint

-- Contracts
CREATE INDEX IF NOT EXISTS idx_contracts_createdBy ON contracts (createdBy);
--> statement-breakpoint

-- Disputes
CREATE INDEX IF NOT EXISTS idx_disputes_contractId ON disputes (contractId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_disputes_assignedTo ON disputes (assignedTo);
--> statement-breakpoint

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_uploadedBy ON documents (uploadedBy);
--> statement-breakpoint

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_ownerId ON projects (ownerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_projects_departmentId ON projects (departmentId);
--> statement-breakpoint

-- Project Tasks
CREATE INDEX IF NOT EXISTS idx_project_tasks_createdBy ON project_tasks (createdBy);
--> statement-breakpoint

-- Email Attachments
CREATE INDEX IF NOT EXISTS idx_email_attachments_emailId ON email_attachments (emailId);
--> statement-breakpoint

-- Parsed Documents
CREATE INDEX IF NOT EXISTS idx_parsed_documents_purchaseOrderId ON parsed_documents (purchaseOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_parsed_documents_shipmentId ON parsed_documents (shipmentId);
--> statement-breakpoint

-- Sent Emails
CREATE INDEX IF NOT EXISTS idx_sent_emails_inboundEmailId ON sent_emails (inboundEmailId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sent_emails_sentBy ON sent_emails (sentBy);
--> statement-breakpoint

-- Parsed Document Line Items
CREATE INDEX IF NOT EXISTS idx_parsed_document_line_items_documentId ON parsed_document_line_items (documentId);
--> statement-breakpoint

-- Freight
CREATE INDEX IF NOT EXISTS idx_freightRfqs_purchaseOrderId ON freightRfqs (purchaseOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_freightRfqs_vendorId ON freightRfqs (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_freightQuotes_rfqId ON freightQuotes (rfqId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_freightQuotes_carrierId ON freightQuotes (carrierId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_freightEmails_rfqId ON freightEmails (rfqId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_freightBookings_rfqId ON freightBookings (rfqId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_freightBookings_carrierId ON freightBookings (carrierId);
--> statement-breakpoint

-- Customs
CREATE INDEX IF NOT EXISTS idx_customsClearances_shipmentId ON customsClearances (shipmentId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customsDocuments_clearanceId ON customsDocuments (clearanceId);
--> statement-breakpoint

-- BOM
CREATE INDEX IF NOT EXISTS idx_billOfMaterials_companyId ON billOfMaterials (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_billOfMaterials_productId ON billOfMaterials (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_bomVersionHistory_bomId ON bomVersionHistory (bomId);
--> statement-breakpoint

-- Work Order Materials
CREATE INDEX IF NOT EXISTS idx_workOrderMaterials_rawMaterialId ON workOrderMaterials (rawMaterialId);
--> statement-breakpoint

-- Raw Materials
CREATE INDEX IF NOT EXISTS idx_rawMaterials_companyId ON rawMaterials (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rawMaterials_preferredVendorId ON rawMaterials (preferredVendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rawMaterialInventory_rawMaterialId ON rawMaterialInventory (rawMaterialId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rawMaterialInventory_warehouseId ON rawMaterialInventory (warehouseId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rawMaterialTransactions_rawMaterialId ON rawMaterialTransactions (rawMaterialId);
--> statement-breakpoint

-- PO Receiving
CREATE INDEX IF NOT EXISTS idx_poReceivingRecords_purchaseOrderId ON poReceivingRecords (purchaseOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_poReceivingItems_receivingRecordId ON poReceivingItems (receivingRecordId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_purchaseOrderRawMaterials_purchaseOrderItemId ON purchaseOrderRawMaterials (purchaseOrderItemId);
--> statement-breakpoint

-- Demand Planning
CREATE INDEX IF NOT EXISTS idx_demandForecasts_productId ON demandForecasts (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_productionPlans_productId ON productionPlans (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_productionPlans_bomId ON productionPlans (bomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_materialRequirements_productionPlanId ON materialRequirements (productionPlanId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_materialRequirements_rawMaterialId ON materialRequirements (rawMaterialId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_suggestedPurchaseOrders_vendorId ON suggestedPurchaseOrders (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_suggestedPoItems_suggestedPoId ON suggestedPoItems (suggestedPoId);
--> statement-breakpoint

-- Inventory Lots & Costing
CREATE INDEX IF NOT EXISTS idx_inventoryLots_productId ON inventoryLots (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryLots_status ON inventoryLots (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryBalances_lotId ON inventoryBalances (lotId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryBalances_productId ON inventoryBalances (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryTransactions_lotId ON inventoryTransactions (lotId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryTransactions_productId ON inventoryTransactions (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cogsTransactions_salesOrderId ON cogsTransactions (salesOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cogsTransactions_productId ON cogsTransactions (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryCostLayers_productId ON inventoryCostLayers (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryCostLayers_warehouseId ON inventoryCostLayers (warehouseId);
--> statement-breakpoint

-- Freight Cost Allocations
CREATE INDEX IF NOT EXISTS idx_freightCostAllocations_purchaseOrderId ON freightCostAllocations (purchaseOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_freightCostAllocations_productId ON freightCostAllocations (productId);
--> statement-breakpoint

-- Work Order Outputs
CREATE INDEX IF NOT EXISTS idx_workOrderOutputs_workOrderId ON workOrderOutputs (workOrderId);
--> statement-breakpoint

-- Alerts & Recommendations
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_alerts_assignedTo ON alerts (assignedTo);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recommendations_alertId ON recommendations (alertId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations (status);
--> statement-breakpoint

-- Shopify
CREATE INDEX IF NOT EXISTS idx_shopifySkuMappings_storeId ON shopifySkuMappings (storeId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shopifySkuMappings_productId ON shopifySkuMappings (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shopifyLocationMappings_storeId ON shopifyLocationMappings (storeId);
--> statement-breakpoint

-- Inventory Reservations & Allocations
CREATE INDEX IF NOT EXISTS idx_inventoryReservations_salesOrderId ON inventoryReservations (salesOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryReservations_productId ON inventoryReservations (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryAllocations_storeId ON inventoryAllocations (storeId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_inventoryAllocations_productId ON inventoryAllocations (productId);
--> statement-breakpoint

-- Reconciliation
CREATE INDEX IF NOT EXISTS idx_reconciliationRuns_storeId ON reconciliationRuns (storeId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reconciliationRuns_status ON reconciliationRuns (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reconciliationLines_runId ON reconciliationLines (runId);
--> statement-breakpoint

-- Data Room extras
CREATE INDEX IF NOT EXISTS idx_data_room_folders_parentId ON data_room_folders (parentId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_document_views_documentId ON document_views (documentId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_document_views_visitorId ON document_views (visitorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_document_page_views_documentId ON document_page_views (documentId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_document_page_views_visitorId ON document_page_views (visitorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_room_invitations_dataRoomId ON data_room_invitations (dataRoomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_room_visitor_sessions_dataRoomId ON data_room_visitor_sessions (dataRoomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_room_visitor_sessions_visitorId ON data_room_visitor_sessions (visitorId);
--> statement-breakpoint

-- NDA
CREATE INDEX IF NOT EXISTS idx_nda_documents_dataRoomId ON nda_documents (dataRoomId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_nda_signatures_ndaDocumentId ON nda_signatures (ndaDocumentId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_nda_signatures_visitorId ON nda_signatures (visitorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_nda_signature_audit_log_signatureId ON nda_signature_audit_log (signatureId);
--> statement-breakpoint

-- Email Credentials & Scans
CREATE INDEX IF NOT EXISTS idx_emailCredentials_userId ON emailCredentials (userId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_emailCredentials_companyId ON emailCredentials (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_scheduledEmailScans_credentialId ON scheduledEmailScans (credentialId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_emailScanLogs_credentialId ON emailScanLogs (credentialId);
--> statement-breakpoint

-- IMAP
CREATE INDEX IF NOT EXISTS idx_imap_credentials_userId ON imap_credentials (userId);
--> statement-breakpoint

-- Recurring Invoices
CREATE INDEX IF NOT EXISTS idx_recurringInvoices_companyId ON recurringInvoices (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recurringInvoices_customerId ON recurringInvoices (customerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recurringInvoiceItems_recurringInvoiceId ON recurringInvoiceItems (recurringInvoiceId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recurringInvoiceHistory_recurringInvoiceId ON recurringInvoiceHistory (recurringInvoiceId);
--> statement-breakpoint

-- Supplier Portal
CREATE INDEX IF NOT EXISTS idx_supplierPortalSessions_purchaseOrderId ON supplierPortalSessions (purchaseOrderId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_supplierPortalSessions_vendorId ON supplierPortalSessions (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_supplierDocuments_portalSessionId ON supplierDocuments (portalSessionId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_supplierDocuments_vendorId ON supplierDocuments (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_supplierFreightInfo_portalSessionId ON supplierFreightInfo (portalSessionId);
--> statement-breakpoint

-- AI Agent
CREATE INDEX IF NOT EXISTS idx_aiAgentTasks_companyId ON aiAgentTasks (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_aiAgentTasks_status ON aiAgentTasks (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_aiAgentRules_companyId ON aiAgentRules (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_aiAgentLogs_taskId ON aiAgentLogs (taskId);
--> statement-breakpoint

-- Email Templates
CREATE INDEX IF NOT EXISTS idx_emailTemplates_companyId ON emailTemplates (companyId);
--> statement-breakpoint

-- Vendor RFQ Emails & Invitations
CREATE INDEX IF NOT EXISTS idx_vendorRfqEmails_rfqId ON vendorRfqEmails (rfqId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendorRfqEmails_vendorId ON vendorRfqEmails (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendorRfqInvitations_rfqId ON vendorRfqInvitations (rfqId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendorRfqInvitations_vendorId ON vendorRfqInvitations (vendorId);
--> statement-breakpoint

-- WhatsApp & CRM Interactions
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contactId ON whatsapp_messages (contactId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_interactions_contactId ON crm_interactions (contactId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contact_captures_contactId ON contact_captures (contactId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaignId ON crm_campaign_recipients (campaignId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_contactId ON crm_campaign_recipients (contactId);
--> statement-breakpoint

-- CRM Contacts
CREATE INDEX IF NOT EXISTS idx_crm_contacts_companyId ON crm_contacts (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_contacts_customerId ON crm_contacts (customerId);
--> statement-breakpoint

-- Supply Chain Workflows
CREATE INDEX IF NOT EXISTS idx_supplyChainWorkflows_companyId ON supplyChainWorkflows (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workflowApprovalQueue_runId ON workflowApprovalQueue (runId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workflowApprovalQueue_status ON workflowApprovalQueue (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_autonomousDecisions_runId ON autonomousDecisions (runId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_supplyChainEvents_eventType ON supplyChainEvents (eventType);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workflowMetrics_workflowId ON workflowMetrics (workflowId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_exceptionLog_runId ON exceptionLog (runId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_exceptionLog_status ON exceptionLog (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workflowNotifications_runId ON workflowNotifications (runId);
--> statement-breakpoint

-- Supplier Performance
CREATE INDEX IF NOT EXISTS idx_supplierPerformance_vendorId ON supplierPerformance (vendorId);
--> statement-breakpoint

-- Vendor Negotiations
CREATE INDEX IF NOT EXISTS idx_vendorNegotiations_vendorId ON vendorNegotiations (vendorId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vendorNegotiations_status ON vendorNegotiations (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_negotiationRounds_negotiationId ON negotiationRounds (negotiationId);
--> statement-breakpoint

-- Investment Grant
CREATE INDEX IF NOT EXISTS idx_investment_grant_checklists_companyId ON investment_grant_checklists (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_investment_grant_items_checklistId ON investment_grant_items (checklistId);
--> statement-breakpoint

-- EDI extras
CREATE INDEX IF NOT EXISTS idx_edi_trading_partners_companyId ON edi_trading_partners (companyId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_document_maps_tradingPartnerId ON edi_document_maps (tradingPartnerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_product_crosswalks_tradingPartnerId ON edi_product_crosswalks (tradingPartnerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_product_crosswalks_productId ON edi_product_crosswalks (productId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_ship_to_locations_tradingPartnerId ON edi_ship_to_locations (tradingPartnerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_compliance_scorecards_tradingPartnerId ON edi_compliance_scorecards (tradingPartnerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_control_numbers_tradingPartnerId ON edi_control_numbers (tradingPartnerId);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edi_settings_companyId ON edi_settings (companyId);
--> statement-breakpoint

-- ============================================
-- UNIQUE CONSTRAINTS ON NATURAL KEYS
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_paymentNumber ON payments (paymentNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_transactionNumber ON transactions (transactionNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_shipmentNumber ON shipments (shipmentNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_payments_paymentNumber ON employee_payments (paymentNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_disputeNumber ON disputes (disputeNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_batches_batchNumber ON production_batches (batchNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_transfers_transferNumber ON inventory_transfers (transferNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_salesOrders_orderNumber ON salesOrders (orderNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_workOrders_workOrderNumber ON workOrders (workOrderNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_demandForecasts_forecastNumber ON demandForecasts (forecastNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_productionPlans_planNumber ON productionPlans (planNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventoryLots_lotCode ON inventoryLots (lotCode);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendorRfqs_rfqNumber ON vendorRfqs (rfqNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendorNegotiations_negotiationNumber ON vendorNegotiations (negotiationNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_alertNumber ON alerts (alertNumber);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliationRuns_runNumber ON reconciliationRuns (runNumber);
--> statement-breakpoint

-- ============================================
-- KEY DATE INDEXES (for range queries)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_invoices_issueDate ON invoices (issueDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_payments_paymentDate ON payments (paymentDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_orders_orderDate ON orders (orderDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_purchase_orders_orderDate ON purchase_orders (orderDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expectedDate ON purchase_orders (expectedDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shipments_shipDate ON shipments (shipDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shipments_deliveryDate ON shipments (deliveryDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contracts_endDate ON contracts (endDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contracts_renewalDate ON contracts (renewalDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_employees_hireDate ON employees (hireDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_projects_targetEndDate ON projects (targetEndDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_tasks_dueDate ON project_tasks (dueDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_milestones_dueDate ON project_milestones (dueDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_salesOrders_orderDate ON salesOrders (orderDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recurringInvoices_nextGenerationDate ON recurringInvoices (nextGenerationDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workOrders_scheduledStartDate ON workOrders (scheduledStartDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_room_links_expiresAt ON data_room_links (expiresAt);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_contacts_nextFollowUpAt ON crm_contacts (nextFollowUpAt);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_crm_deals_expectedCloseDate ON crm_deals (expectedCloseDate);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workflowApprovalQueue_dueAt ON workflowApprovalQueue (dueAt);

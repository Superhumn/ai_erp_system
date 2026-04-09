-- Migration: Additional indexes and unique constraints
-- Covers remaining FK columns, status fields, date ranges, and natural keys
-- identified by comprehensive schema audit

-- ============================================
-- MISSING FK INDEXES (not covered in 0029)
-- ============================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_linkedWarehouseId ON users (linkedWarehouseId);
CREATE INDEX IF NOT EXISTS idx_users_invitedBy ON users (invitedBy);

-- Team Invitations
CREATE INDEX IF NOT EXISTS idx_teamInvitations_linkedVendorId ON teamInvitations (linkedVendorId);
CREATE INDEX IF NOT EXISTS idx_teamInvitations_acceptedByUserId ON teamInvitations (acceptedByUserId);

-- User Permissions
CREATE INDEX IF NOT EXISTS idx_userPermissions_grantedBy ON userPermissions (grantedBy);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_preferredVendorId ON products (preferredVendorId);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_createdBy ON invoices (createdBy);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_companyId ON payments (companyId);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_createdBy ON transactions (createdBy);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_invoiceId ON orders (invoiceId);
CREATE INDEX IF NOT EXISTS idx_orders_createdBy ON orders (createdBy);

-- Inventory Transfers
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_requestedBy ON inventory_transfers (requestedBy);

-- Production Batches
CREATE INDEX IF NOT EXISTS idx_production_batches_companyId ON production_batches (companyId);
CREATE INDEX IF NOT EXISTS idx_production_batches_productId ON production_batches (productId);
CREATE INDEX IF NOT EXISTS idx_production_batches_warehouseId ON production_batches (warehouseId);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON production_batches (status);

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_createdBy ON purchase_orders (createdBy);

-- Shipments
CREATE INDEX IF NOT EXISTS idx_shipments_orderId ON shipments (orderId);

-- Departments
CREATE INDEX IF NOT EXISTS idx_departments_managerId ON departments (managerId);

-- Employees
CREATE INDEX IF NOT EXISTS idx_employees_userId ON employees (userId);

-- Employee Payments
CREATE INDEX IF NOT EXISTS idx_employee_payments_companyId ON employee_payments (companyId);

-- Contracts
CREATE INDEX IF NOT EXISTS idx_contracts_createdBy ON contracts (createdBy);

-- Disputes
CREATE INDEX IF NOT EXISTS idx_disputes_contractId ON disputes (contractId);
CREATE INDEX IF NOT EXISTS idx_disputes_assignedTo ON disputes (assignedTo);

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_uploadedBy ON documents (uploadedBy);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_ownerId ON projects (ownerId);
CREATE INDEX IF NOT EXISTS idx_projects_departmentId ON projects (departmentId);

-- Project Tasks
CREATE INDEX IF NOT EXISTS idx_project_tasks_createdBy ON project_tasks (createdBy);

-- Email Attachments
CREATE INDEX IF NOT EXISTS idx_email_attachments_emailId ON email_attachments (emailId);

-- Parsed Documents
CREATE INDEX IF NOT EXISTS idx_parsed_documents_purchaseOrderId ON parsed_documents (purchaseOrderId);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_shipmentId ON parsed_documents (shipmentId);

-- Sent Emails
CREATE INDEX IF NOT EXISTS idx_sent_emails_inboundEmailId ON sent_emails (inboundEmailId);
CREATE INDEX IF NOT EXISTS idx_sent_emails_sentBy ON sent_emails (sentBy);

-- Parsed Document Line Items
CREATE INDEX IF NOT EXISTS idx_parsed_document_line_items_documentId ON parsed_document_line_items (documentId);

-- Freight
CREATE INDEX IF NOT EXISTS idx_freightRfqs_purchaseOrderId ON freightRfqs (purchaseOrderId);
CREATE INDEX IF NOT EXISTS idx_freightRfqs_vendorId ON freightRfqs (vendorId);
CREATE INDEX IF NOT EXISTS idx_freightQuotes_rfqId ON freightQuotes (rfqId);
CREATE INDEX IF NOT EXISTS idx_freightQuotes_carrierId ON freightQuotes (carrierId);
CREATE INDEX IF NOT EXISTS idx_freightEmails_rfqId ON freightEmails (rfqId);
CREATE INDEX IF NOT EXISTS idx_freightBookings_rfqId ON freightBookings (rfqId);
CREATE INDEX IF NOT EXISTS idx_freightBookings_carrierId ON freightBookings (carrierId);

-- Customs
CREATE INDEX IF NOT EXISTS idx_customsClearances_shipmentId ON customsClearances (shipmentId);
CREATE INDEX IF NOT EXISTS idx_customsDocuments_clearanceId ON customsDocuments (clearanceId);

-- BOM
CREATE INDEX IF NOT EXISTS idx_billOfMaterials_companyId ON billOfMaterials (companyId);
CREATE INDEX IF NOT EXISTS idx_billOfMaterials_productId ON billOfMaterials (productId);
CREATE INDEX IF NOT EXISTS idx_bomVersionHistory_bomId ON bomVersionHistory (bomId);

-- Work Order Materials
CREATE INDEX IF NOT EXISTS idx_workOrderMaterials_rawMaterialId ON workOrderMaterials (rawMaterialId);

-- Raw Materials
CREATE INDEX IF NOT EXISTS idx_rawMaterials_companyId ON rawMaterials (companyId);
CREATE INDEX IF NOT EXISTS idx_rawMaterials_preferredVendorId ON rawMaterials (preferredVendorId);
CREATE INDEX IF NOT EXISTS idx_rawMaterialInventory_rawMaterialId ON rawMaterialInventory (rawMaterialId);
CREATE INDEX IF NOT EXISTS idx_rawMaterialInventory_warehouseId ON rawMaterialInventory (warehouseId);
CREATE INDEX IF NOT EXISTS idx_rawMaterialTransactions_rawMaterialId ON rawMaterialTransactions (rawMaterialId);

-- PO Receiving
CREATE INDEX IF NOT EXISTS idx_poReceivingRecords_purchaseOrderId ON poReceivingRecords (purchaseOrderId);
CREATE INDEX IF NOT EXISTS idx_poReceivingItems_receivingRecordId ON poReceivingItems (receivingRecordId);
CREATE INDEX IF NOT EXISTS idx_purchaseOrderRawMaterials_purchaseOrderItemId ON purchaseOrderRawMaterials (purchaseOrderItemId);

-- Demand Planning
CREATE INDEX IF NOT EXISTS idx_demandForecasts_productId ON demandForecasts (productId);
CREATE INDEX IF NOT EXISTS idx_productionPlans_productId ON productionPlans (productId);
CREATE INDEX IF NOT EXISTS idx_productionPlans_bomId ON productionPlans (bomId);
CREATE INDEX IF NOT EXISTS idx_materialRequirements_productionPlanId ON materialRequirements (productionPlanId);
CREATE INDEX IF NOT EXISTS idx_materialRequirements_rawMaterialId ON materialRequirements (rawMaterialId);
CREATE INDEX IF NOT EXISTS idx_suggestedPurchaseOrders_vendorId ON suggestedPurchaseOrders (vendorId);
CREATE INDEX IF NOT EXISTS idx_suggestedPoItems_suggestedPoId ON suggestedPoItems (suggestedPoId);

-- Inventory Lots & Costing
CREATE INDEX IF NOT EXISTS idx_inventoryLots_productId ON inventoryLots (productId);
CREATE INDEX IF NOT EXISTS idx_inventoryLots_status ON inventoryLots (status);
CREATE INDEX IF NOT EXISTS idx_inventoryBalances_lotId ON inventoryBalances (lotId);
CREATE INDEX IF NOT EXISTS idx_inventoryBalances_productId ON inventoryBalances (productId);
CREATE INDEX IF NOT EXISTS idx_inventoryTransactions_lotId ON inventoryTransactions (lotId);
CREATE INDEX IF NOT EXISTS idx_inventoryTransactions_productId ON inventoryTransactions (productId);
CREATE INDEX IF NOT EXISTS idx_cogsTransactions_salesOrderId ON cogsTransactions (salesOrderId);
CREATE INDEX IF NOT EXISTS idx_cogsTransactions_productId ON cogsTransactions (productId);
CREATE INDEX IF NOT EXISTS idx_inventoryCostLayers_productId ON inventoryCostLayers (productId);
CREATE INDEX IF NOT EXISTS idx_inventoryCostLayers_warehouseId ON inventoryCostLayers (warehouseId);

-- Freight Cost Allocations
CREATE INDEX IF NOT EXISTS idx_freightCostAllocations_purchaseOrderId ON freightCostAllocations (purchaseOrderId);
CREATE INDEX IF NOT EXISTS idx_freightCostAllocations_productId ON freightCostAllocations (productId);

-- Work Order Outputs
CREATE INDEX IF NOT EXISTS idx_workOrderOutputs_workOrderId ON workOrderOutputs (workOrderId);

-- Alerts & Recommendations
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);
CREATE INDEX IF NOT EXISTS idx_alerts_assignedTo ON alerts (assignedTo);
CREATE INDEX IF NOT EXISTS idx_recommendations_alertId ON recommendations (alertId);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations (status);

-- Shopify
CREATE INDEX IF NOT EXISTS idx_shopifySkuMappings_storeId ON shopifySkuMappings (storeId);
CREATE INDEX IF NOT EXISTS idx_shopifySkuMappings_productId ON shopifySkuMappings (productId);
CREATE INDEX IF NOT EXISTS idx_shopifyLocationMappings_storeId ON shopifyLocationMappings (storeId);

-- Inventory Reservations & Allocations
CREATE INDEX IF NOT EXISTS idx_inventoryReservations_salesOrderId ON inventoryReservations (salesOrderId);
CREATE INDEX IF NOT EXISTS idx_inventoryReservations_productId ON inventoryReservations (productId);
CREATE INDEX IF NOT EXISTS idx_inventoryAllocations_storeId ON inventoryAllocations (storeId);
CREATE INDEX IF NOT EXISTS idx_inventoryAllocations_productId ON inventoryAllocations (productId);

-- Reconciliation
CREATE INDEX IF NOT EXISTS idx_reconciliationRuns_storeId ON reconciliationRuns (storeId);
CREATE INDEX IF NOT EXISTS idx_reconciliationRuns_status ON reconciliationRuns (status);
CREATE INDEX IF NOT EXISTS idx_reconciliationLines_runId ON reconciliationLines (runId);

-- Data Room extras
CREATE INDEX IF NOT EXISTS idx_data_room_folders_parentId ON data_room_folders (parentId);
CREATE INDEX IF NOT EXISTS idx_document_views_documentId ON document_views (documentId);
CREATE INDEX IF NOT EXISTS idx_document_views_visitorId ON document_views (visitorId);
CREATE INDEX IF NOT EXISTS idx_document_page_views_documentId ON document_page_views (documentId);
CREATE INDEX IF NOT EXISTS idx_document_page_views_visitorId ON document_page_views (visitorId);
CREATE INDEX IF NOT EXISTS idx_data_room_invitations_dataRoomId ON data_room_invitations (dataRoomId);
CREATE INDEX IF NOT EXISTS idx_data_room_visitor_sessions_dataRoomId ON data_room_visitor_sessions (dataRoomId);
CREATE INDEX IF NOT EXISTS idx_data_room_visitor_sessions_visitorId ON data_room_visitor_sessions (visitorId);

-- NDA
CREATE INDEX IF NOT EXISTS idx_nda_documents_dataRoomId ON nda_documents (dataRoomId);
CREATE INDEX IF NOT EXISTS idx_nda_signatures_ndaDocumentId ON nda_signatures (ndaDocumentId);
CREATE INDEX IF NOT EXISTS idx_nda_signatures_visitorId ON nda_signatures (visitorId);
CREATE INDEX IF NOT EXISTS idx_nda_signature_audit_log_signatureId ON nda_signature_audit_log (signatureId);

-- Email Credentials & Scans
CREATE INDEX IF NOT EXISTS idx_emailCredentials_userId ON emailCredentials (userId);
CREATE INDEX IF NOT EXISTS idx_emailCredentials_companyId ON emailCredentials (companyId);
CREATE INDEX IF NOT EXISTS idx_scheduledEmailScans_credentialId ON scheduledEmailScans (credentialId);
CREATE INDEX IF NOT EXISTS idx_emailScanLogs_credentialId ON emailScanLogs (credentialId);

-- IMAP
CREATE INDEX IF NOT EXISTS idx_imap_credentials_userId ON imap_credentials (userId);

-- Recurring Invoices
CREATE INDEX IF NOT EXISTS idx_recurringInvoices_companyId ON recurringInvoices (companyId);
CREATE INDEX IF NOT EXISTS idx_recurringInvoices_customerId ON recurringInvoices (customerId);
CREATE INDEX IF NOT EXISTS idx_recurringInvoiceItems_recurringInvoiceId ON recurringInvoiceItems (recurringInvoiceId);
CREATE INDEX IF NOT EXISTS idx_recurringInvoiceHistory_recurringInvoiceId ON recurringInvoiceHistory (recurringInvoiceId);

-- Supplier Portal
CREATE INDEX IF NOT EXISTS idx_supplierPortalSessions_purchaseOrderId ON supplierPortalSessions (purchaseOrderId);
CREATE INDEX IF NOT EXISTS idx_supplierPortalSessions_vendorId ON supplierPortalSessions (vendorId);
CREATE INDEX IF NOT EXISTS idx_supplierDocuments_portalSessionId ON supplierDocuments (portalSessionId);
CREATE INDEX IF NOT EXISTS idx_supplierDocuments_vendorId ON supplierDocuments (vendorId);
CREATE INDEX IF NOT EXISTS idx_supplierFreightInfo_portalSessionId ON supplierFreightInfo (portalSessionId);

-- AI Agent
CREATE INDEX IF NOT EXISTS idx_aiAgentTasks_companyId ON aiAgentTasks (companyId);
CREATE INDEX IF NOT EXISTS idx_aiAgentTasks_status ON aiAgentTasks (status);
CREATE INDEX IF NOT EXISTS idx_aiAgentRules_companyId ON aiAgentRules (companyId);
CREATE INDEX IF NOT EXISTS idx_aiAgentLogs_taskId ON aiAgentLogs (taskId);

-- Email Templates
CREATE INDEX IF NOT EXISTS idx_emailTemplates_companyId ON emailTemplates (companyId);

-- Vendor RFQ Emails & Invitations
CREATE INDEX IF NOT EXISTS idx_vendorRfqEmails_rfqId ON vendorRfqEmails (rfqId);
CREATE INDEX IF NOT EXISTS idx_vendorRfqEmails_vendorId ON vendorRfqEmails (vendorId);
CREATE INDEX IF NOT EXISTS idx_vendorRfqInvitations_rfqId ON vendorRfqInvitations (rfqId);
CREATE INDEX IF NOT EXISTS idx_vendorRfqInvitations_vendorId ON vendorRfqInvitations (vendorId);

-- WhatsApp & CRM Interactions
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contactId ON whatsapp_messages (contactId);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_contactId ON crm_interactions (contactId);
CREATE INDEX IF NOT EXISTS idx_contact_captures_contactId ON contact_captures (contactId);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaignId ON crm_campaign_recipients (campaignId);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_contactId ON crm_campaign_recipients (contactId);

-- CRM Contacts
CREATE INDEX IF NOT EXISTS idx_crm_contacts_companyId ON crm_contacts (companyId);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_customerId ON crm_contacts (customerId);

-- Supply Chain Workflows
CREATE INDEX IF NOT EXISTS idx_supplyChainWorkflows_companyId ON supplyChainWorkflows (companyId);
CREATE INDEX IF NOT EXISTS idx_workflowApprovalQueue_runId ON workflowApprovalQueue (runId);
CREATE INDEX IF NOT EXISTS idx_workflowApprovalQueue_status ON workflowApprovalQueue (status);
CREATE INDEX IF NOT EXISTS idx_autonomousDecisions_runId ON autonomousDecisions (runId);
CREATE INDEX IF NOT EXISTS idx_supplyChainEvents_eventType ON supplyChainEvents (eventType);
CREATE INDEX IF NOT EXISTS idx_workflowMetrics_workflowId ON workflowMetrics (workflowId);
CREATE INDEX IF NOT EXISTS idx_exceptionLog_runId ON exceptionLog (runId);
CREATE INDEX IF NOT EXISTS idx_exceptionLog_status ON exceptionLog (status);
CREATE INDEX IF NOT EXISTS idx_workflowNotifications_runId ON workflowNotifications (runId);

-- Supplier Performance
CREATE INDEX IF NOT EXISTS idx_supplierPerformance_vendorId ON supplierPerformance (vendorId);

-- Vendor Negotiations
CREATE INDEX IF NOT EXISTS idx_vendorNegotiations_vendorId ON vendorNegotiations (vendorId);
CREATE INDEX IF NOT EXISTS idx_vendorNegotiations_status ON vendorNegotiations (status);
CREATE INDEX IF NOT EXISTS idx_negotiationRounds_negotiationId ON negotiationRounds (negotiationId);

-- Investment Grant
CREATE INDEX IF NOT EXISTS idx_investment_grant_checklists_companyId ON investment_grant_checklists (companyId);
CREATE INDEX IF NOT EXISTS idx_investment_grant_items_checklistId ON investment_grant_items (checklistId);

-- EDI extras
CREATE INDEX IF NOT EXISTS idx_edi_trading_partners_companyId ON edi_trading_partners (companyId);
CREATE INDEX IF NOT EXISTS idx_edi_document_maps_tradingPartnerId ON edi_document_maps (tradingPartnerId);
CREATE INDEX IF NOT EXISTS idx_edi_product_crosswalks_tradingPartnerId ON edi_product_crosswalks (tradingPartnerId);
CREATE INDEX IF NOT EXISTS idx_edi_product_crosswalks_productId ON edi_product_crosswalks (productId);
CREATE INDEX IF NOT EXISTS idx_edi_ship_to_locations_tradingPartnerId ON edi_ship_to_locations (tradingPartnerId);
CREATE INDEX IF NOT EXISTS idx_edi_compliance_scorecards_tradingPartnerId ON edi_compliance_scorecards (tradingPartnerId);
CREATE INDEX IF NOT EXISTS idx_edi_control_numbers_tradingPartnerId ON edi_control_numbers (tradingPartnerId);
CREATE INDEX IF NOT EXISTS idx_edi_settings_companyId ON edi_settings (companyId);

-- ============================================
-- UNIQUE CONSTRAINTS ON NATURAL KEYS
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_paymentNumber ON payments (paymentNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_transactionNumber ON transactions (transactionNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_shipmentNumber ON shipments (shipmentNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_payments_paymentNumber ON employee_payments (paymentNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_disputeNumber ON disputes (disputeNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_batches_batchNumber ON production_batches (batchNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_transfers_transferNumber ON inventory_transfers (transferNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_salesOrders_orderNumber ON salesOrders (orderNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workOrders_workOrderNumber ON workOrders (workOrderNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_demandForecasts_forecastNumber ON demandForecasts (forecastNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_productionPlans_planNumber ON productionPlans (planNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventoryLots_lotCode ON inventoryLots (lotCode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendorRfqs_rfqNumber ON vendorRfqs (rfqNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendorNegotiations_negotiationNumber ON vendorNegotiations (negotiationNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_alertNumber ON alerts (alertNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliationRuns_runNumber ON reconciliationRuns (runNumber);

-- ============================================
-- KEY DATE INDEXES (for range queries)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_invoices_issueDate ON invoices (issueDate);
CREATE INDEX IF NOT EXISTS idx_payments_paymentDate ON payments (paymentDate);
CREATE INDEX IF NOT EXISTS idx_orders_orderDate ON orders (orderDate);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_orderDate ON purchase_orders (orderDate);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expectedDate ON purchase_orders (expectedDate);
CREATE INDEX IF NOT EXISTS idx_shipments_shipDate ON shipments (shipDate);
CREATE INDEX IF NOT EXISTS idx_shipments_deliveryDate ON shipments (deliveryDate);
CREATE INDEX IF NOT EXISTS idx_contracts_endDate ON contracts (endDate);
CREATE INDEX IF NOT EXISTS idx_contracts_renewalDate ON contracts (renewalDate);
CREATE INDEX IF NOT EXISTS idx_employees_hireDate ON employees (hireDate);
CREATE INDEX IF NOT EXISTS idx_projects_targetEndDate ON projects (targetEndDate);
CREATE INDEX IF NOT EXISTS idx_project_tasks_dueDate ON project_tasks (dueDate);
CREATE INDEX IF NOT EXISTS idx_project_milestones_dueDate ON project_milestones (dueDate);
CREATE INDEX IF NOT EXISTS idx_salesOrders_orderDate ON salesOrders (orderDate);
CREATE INDEX IF NOT EXISTS idx_recurringInvoices_nextGenerationDate ON recurringInvoices (nextGenerationDate);
CREATE INDEX IF NOT EXISTS idx_workOrders_scheduledStartDate ON workOrders (scheduledStartDate);
CREATE INDEX IF NOT EXISTS idx_data_room_links_expiresAt ON data_room_links (expiresAt);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_nextFollowUpAt ON crm_contacts (nextFollowUpAt);
CREATE INDEX IF NOT EXISTS idx_crm_deals_expectedCloseDate ON crm_deals (expectedCloseDate);
CREATE INDEX IF NOT EXISTS idx_workflowApprovalQueue_dueAt ON workflowApprovalQueue (dueAt);

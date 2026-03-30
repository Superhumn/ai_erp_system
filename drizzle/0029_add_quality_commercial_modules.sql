-- Quality Management & Food Safety: Certificates of Analysis
CREATE TABLE IF NOT EXISTS `certificates_of_analysis` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `coaNumber` varchar(64) NOT NULL,
  `lotId` int,
  `productId` int,
  `vendorId` int,
  `type` enum('incoming_raw_material','in_process','finished_product','third_party') NOT NULL,
  `status` enum('draft','pending_review','approved','rejected','expired') NOT NULL DEFAULT 'draft',
  `issueDate` timestamp,
  `expiryDate` timestamp,
  `reviewedBy` int,
  `reviewedAt` timestamp,
  `approvedBy` int,
  `approvedAt` timestamp,
  `documentUrl` text,
  `notes` text,
  `autoSendWithShipment` boolean NOT NULL DEFAULT true,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- COA Test Results
CREATE TABLE IF NOT EXISTS `coa_test_results` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `coaId` int NOT NULL,
  `testName` varchar(256) NOT NULL,
  `testCategory` enum('microbiological','chemical','physical','allergen','nutritional','sensory','other') NOT NULL,
  `testMethod` varchar(256),
  `specification` varchar(256),
  `result` varchar(256) NOT NULL,
  `unit` varchar(64),
  `minLimit` decimal(12,4),
  `maxLimit` decimal(12,4),
  `passed` boolean,
  `testedBy` varchar(256),
  `testedAt` timestamp,
  `labName` varchar(256),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Non-Conformance Reports
CREATE TABLE IF NOT EXISTS `non_conformance_reports` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `ncrNumber` varchar(64) NOT NULL,
  `title` varchar(512) NOT NULL,
  `description` text,
  `type` enum('incoming_material','in_process','finished_product','customer_complaint','audit_finding','environmental','equipment','other') NOT NULL,
  `severity` enum('critical','major','minor','observation') NOT NULL,
  `status` enum('open','investigating','containment','corrective_action','verification','closed') NOT NULL DEFAULT 'open',
  `source` enum('internal_audit','external_audit','customer_complaint','supplier_issue','process_deviation','lab_result','other') NOT NULL,
  `lotId` int,
  `productId` int,
  `vendorId` int,
  `customerId` int,
  `detectedDate` timestamp NOT NULL,
  `containmentAction` text,
  `containmentDate` timestamp,
  `dispositionDecision` enum('use_as_is','rework','regrade','return_to_supplier','scrap','pending') DEFAULT 'pending',
  `quantityAffected` decimal(12,4),
  `quantityUnit` varchar(32),
  `costImpact` decimal(12,2),
  `assignedTo` int,
  `closedBy` int,
  `closedAt` timestamp,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- CAPA Actions
CREATE TABLE IF NOT EXISTS `capa_actions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `capaNumber` varchar(64) NOT NULL,
  `ncrId` int,
  `type` enum('corrective','preventive') NOT NULL,
  `title` varchar(512) NOT NULL,
  `description` text,
  `rootCauseAnalysis` text,
  `rootCauseMethod` enum('five_whys','fishbone','fault_tree','pareto','other'),
  `proposedAction` text,
  `status` enum('open','root_cause_analysis','action_planned','in_progress','verification','closed','closed_ineffective') NOT NULL DEFAULT 'open',
  `priority` enum('critical','high','medium','low') DEFAULT 'medium' NOT NULL,
  `dueDate` timestamp,
  `completedDate` timestamp,
  `verificationMethod` text,
  `verificationResult` text,
  `verifiedBy` int,
  `verifiedAt` timestamp,
  `effectivenessCheck` boolean DEFAULT false,
  `effectivenessDate` timestamp,
  `effectivenessNotes` text,
  `assignedTo` int,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Lab Testing Logs
CREATE TABLE IF NOT EXISTS `lab_testing_logs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `testNumber` varchar(64) NOT NULL,
  `lotId` int,
  `productId` int,
  `rawMaterialId` int,
  `testType` enum('microbiological','chemical','physical','allergen','nutritional','environmental','water','other') NOT NULL,
  `testName` varchar(256) NOT NULL,
  `testMethod` varchar(256),
  `sampleId` varchar(128),
  `sampleDate` timestamp,
  `sampleLocation` varchar(256),
  `result` varchar(256),
  `resultNumeric` decimal(12,4),
  `unit` varchar(64),
  `specMin` decimal(12,4),
  `specMax` decimal(12,4),
  `specTarget` decimal(12,4),
  `passed` boolean,
  `status` enum('pending','in_progress','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `labName` varchar(256),
  `labReference` varchar(128),
  `analystName` varchar(256),
  `completedAt` timestamp,
  `notes` text,
  `attachmentUrl` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Lot Traceability Links
CREATE TABLE IF NOT EXISTS `lot_traceability_links` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `sourceLotId` int NOT NULL,
  `sourceType` enum('raw_material','intermediate','finished_product') NOT NULL,
  `destinationLotId` int NOT NULL,
  `destinationType` enum('intermediate','finished_product') NOT NULL,
  `workOrderId` int,
  `productionBatchId` int,
  `quantityUsed` decimal(12,4),
  `quantityUnit` varchar(32),
  `linkDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Lot Shipment Records
CREATE TABLE IF NOT EXISTS `lot_shipment_records` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `lotId` int NOT NULL,
  `orderId` int,
  `shipmentId` int,
  `customerId` int NOT NULL,
  `productId` int NOT NULL,
  `quantityShipped` decimal(12,4) NOT NULL,
  `quantityUnit` varchar(32),
  `shipDate` timestamp,
  `deliveryDate` timestamp,
  `coaId` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Product Specifications
CREATE TABLE IF NOT EXISTS `product_specifications` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `productId` int NOT NULL,
  `specNumber` varchar(64) NOT NULL,
  `specName` varchar(256) NOT NULL,
  `version` varchar(32) NOT NULL DEFAULT '1.0',
  `status` enum('draft','active','superseded','archived') NOT NULL DEFAULT 'draft',
  `effectiveDate` timestamp,
  `expiryDate` timestamp,
  `description` text,
  `ingredientDeclaration` text,
  `allergenStatement` text,
  `allergens` json,
  `storageRequirements` text,
  `shelfLifeDays` int,
  `shelfLifeUnit` enum('days','weeks','months','years') DEFAULT 'days',
  `packagingDescription` text,
  `countryOfOrigin` varchar(128),
  `regulatoryStatus` text,
  `documentUrl` text,
  `approvedBy` int,
  `approvedAt` timestamp,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Spec Parameters
CREATE TABLE IF NOT EXISTS `spec_parameters` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `specId` int NOT NULL,
  `category` enum('physical','chemical','microbiological','allergen','nutritional','sensory','other') NOT NULL,
  `parameterName` varchar(256) NOT NULL,
  `testMethod` varchar(256),
  `unit` varchar(64),
  `targetValue` varchar(128),
  `minValue` decimal(12,4),
  `maxValue` decimal(12,4),
  `isRequired` boolean NOT NULL DEFAULT true,
  `sortOrder` int DEFAULT 0,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Customer Specifications
CREATE TABLE IF NOT EXISTS `customer_specifications` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `customerId` int NOT NULL,
  `productId` int NOT NULL,
  `baseSpecId` int,
  `specName` varchar(256) NOT NULL,
  `customerSpecNumber` varchar(128),
  `version` varchar(32) NOT NULL DEFAULT '1.0',
  `status` enum('draft','pending_approval','active','superseded','archived') NOT NULL DEFAULT 'draft',
  `effectiveDate` timestamp,
  `expiryDate` timestamp,
  `customRequirements` text,
  `customAllergenStatement` text,
  `customLabelRequirements` text,
  `overrides` json,
  `documentUrl` text,
  `approvedBy` int,
  `approvedAt` timestamp,
  `customerApprovedDate` timestamp,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Price Books
CREATE TABLE IF NOT EXISTS `price_books` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(256) NOT NULL,
  `description` text,
  `type` enum('standard','customer_specific','volume_discount','promotional','market_based','broker') NOT NULL,
  `customerId` int,
  `brokerId` int,
  `status` enum('draft','active','expired','archived') NOT NULL DEFAULT 'draft',
  `effectiveDate` timestamp,
  `expiryDate` timestamp,
  `currency` varchar(8) DEFAULT 'USD',
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Price Book Entries
CREATE TABLE IF NOT EXISTS `price_book_entries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `priceBookId` int NOT NULL,
  `productId` int NOT NULL,
  `unitPrice` decimal(12,4) NOT NULL,
  `minQuantity` decimal(12,4) DEFAULT 0,
  `maxQuantity` decimal(12,4),
  `pricingUnit` varchar(32) DEFAULT 'lb',
  `discountPercent` decimal(5,2),
  `effectiveDate` timestamp,
  `expiryDate` timestamp,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Broker Commissions
CREATE TABLE IF NOT EXISTS `broker_commissions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `brokerId` int NOT NULL,
  `brokerName` varchar(256) NOT NULL,
  `customerId` int,
  `productId` int,
  `commissionType` enum('percentage','flat_per_unit','flat_per_order','tiered') NOT NULL,
  `commissionRate` decimal(8,4),
  `tierRules` json,
  `status` enum('active','inactive','pending') NOT NULL DEFAULT 'active',
  `effectiveDate` timestamp,
  `expiryDate` timestamp,
  `paymentTerms` varchar(128),
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Commission Transactions
CREATE TABLE IF NOT EXISTS `commission_transactions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `brokerCommissionId` int NOT NULL,
  `orderId` int,
  `invoiceId` int,
  `orderAmount` decimal(12,2),
  `commissionAmount` decimal(12,2) NOT NULL,
  `status` enum('pending','approved','paid','disputed','cancelled') NOT NULL DEFAULT 'pending',
  `periodStart` timestamp,
  `periodEnd` timestamp,
  `paidDate` timestamp,
  `paymentReference` varchar(128),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Customer Deductions & Claims
CREATE TABLE IF NOT EXISTS `customer_deductions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `deductionNumber` varchar(64) NOT NULL,
  `customerId` int NOT NULL,
  `invoiceId` int,
  `orderId` int,
  `type` enum('shortage','quality_claim','pricing_discrepancy','damage','late_delivery','unauthorized_deduction','promotion','freight_claim','other') NOT NULL,
  `status` enum('open','investigating','approved','partially_approved','denied','credited','written_off') NOT NULL DEFAULT 'open',
  `claimAmount` decimal(12,2) NOT NULL,
  `approvedAmount` decimal(12,2),
  `claimDate` timestamp NOT NULL,
  `description` text,
  `lotId` int,
  `productId` int,
  `quantityClaimed` decimal(12,4),
  `quantityUnit` varchar(32),
  `customerReference` varchar(128),
  `rootCause` text,
  `resolution` text,
  `creditMemoNumber` varchar(64),
  `creditMemoDate` timestamp,
  `assignedTo` int,
  `resolvedBy` int,
  `resolvedAt` timestamp,
  `documentUrl` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Shelf Life Alerts
CREATE TABLE IF NOT EXISTS `shelf_life_alerts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `lotId` int NOT NULL,
  `productId` int NOT NULL,
  `warehouseId` int,
  `expirationDate` timestamp NOT NULL,
  `currentQuantity` decimal(12,4),
  `quantityUnit` varchar(32),
  `daysUntilExpiry` int,
  `alertLevel` enum('green','yellow','orange','red','expired') NOT NULL DEFAULT 'green',
  `alertThresholdDays` int DEFAULT 30,
  `status` enum('active','acknowledged','resolved','disposed') NOT NULL DEFAULT 'active',
  `action` enum('none','discount_sale','rework','donate','dispose','return_to_vendor'),
  `actionDate` timestamp,
  `actionBy` int,
  `actionNotes` text,
  `notifiedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

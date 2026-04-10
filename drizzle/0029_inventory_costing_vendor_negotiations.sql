-- Add inventory costing, COGS tracking, and vendor negotiations tables

-- Inventory costing configuration per product
CREATE TABLE IF NOT EXISTS `inventoryCostingConfig` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `productId` int NOT NULL,
  `costingMethod` enum('fifo','lifo','weighted_average') DEFAULT 'weighted_average' NOT NULL,
  `isActive` boolean DEFAULT true NOT NULL,
  `effectiveDate` timestamp,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  KEY `idx_costing_config_product` (`productId`),
  KEY `idx_costing_config_company` (`companyId`)
);
--> statement-breakpoint

-- Inventory cost layers (purchase lots) for FIFO/LIFO/Weighted Average
CREATE TABLE IF NOT EXISTS `inventoryCostLayers` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `productId` int NOT NULL,
  `warehouseId` int,
  `purchaseOrderId` int,
  `lotId` int,
  `layerDate` timestamp NOT NULL,
  `originalQuantity` decimal(15,4) NOT NULL,
  `remainingQuantity` decimal(15,4) NOT NULL,
  `unitCost` decimal(15,4) NOT NULL,
  `totalCost` decimal(15,2) NOT NULL,
  `currency` varchar(3) DEFAULT 'USD',
  `status` enum('active','depleted') DEFAULT 'active' NOT NULL,
  `referenceType` varchar(64),
  `referenceId` int,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  KEY `idx_cost_layers_product` (`productId`, `status`),
  KEY `idx_cost_layers_warehouse` (`warehouseId`),
  KEY `idx_cost_layers_date` (`layerDate`)
);
--> statement-breakpoint

-- COGS (Cost of Goods Sold) records per sale
CREATE TABLE IF NOT EXISTS `cogsRecords` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `productId` int NOT NULL,
  `warehouseId` int,
  `orderId` int,
  `salesOrderLineId` int,
  `costingMethod` enum('fifo','lifo','weighted_average') NOT NULL,
  `quantitySold` decimal(15,4) NOT NULL,
  `unitCogs` decimal(15,4) NOT NULL,
  `totalCogs` decimal(15,2) NOT NULL,
  `unitRevenue` decimal(15,2),
  `totalRevenue` decimal(15,2),
  `grossMargin` decimal(15,2),
  `grossMarginPercent` decimal(8,4),
  `periodDate` timestamp NOT NULL,
  `layerBreakdown` json,
  `calculatedBy` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  KEY `idx_cogs_records_product` (`productId`),
  KEY `idx_cogs_records_period` (`periodDate`),
  KEY `idx_cogs_records_order` (`orderId`)
);
--> statement-breakpoint

-- COGS period summaries for reporting
CREATE TABLE IF NOT EXISTS `cogsPeriodSummary` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `productId` int,
  `periodType` enum('daily','weekly','monthly','quarterly','yearly') NOT NULL,
  `periodStart` timestamp NOT NULL,
  `periodEnd` timestamp NOT NULL,
  `totalQuantitySold` decimal(15,4) NOT NULL,
  `totalCogs` decimal(15,2) NOT NULL,
  `totalRevenue` decimal(15,2) NOT NULL,
  `averageUnitCogs` decimal(15,4),
  `grossMargin` decimal(15,2),
  `grossMarginPercent` decimal(8,4),
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  KEY `idx_cogs_summary_period` (`periodType`, `periodStart`, `periodEnd`),
  KEY `idx_cogs_summary_product` (`productId`)
);
--> statement-breakpoint

-- Vendor negotiations
CREATE TABLE IF NOT EXISTS `vendorNegotiations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `vendorId` int NOT NULL,
  `negotiationNumber` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `type` enum('price_reduction','volume_discount','payment_terms','lead_time','contract_renewal','new_contract') NOT NULL,
  `status` enum('draft','ready','in_progress','counter_offered','analyzing','accepted','rejected','expired') DEFAULT 'draft' NOT NULL,
  `priority` enum('low','medium','high') DEFAULT 'medium' NOT NULL,
  `productIds` text,
  `rawMaterialIds` text,
  `currentUnitPrice` decimal(15,4),
  `currentPaymentTerms` int,
  `currentLeadTimeDays` int,
  `currentMinOrderAmount` decimal(15,2),
  `currentAnnualVolume` decimal(15,2),
  `targetUnitPrice` decimal(15,4),
  `targetPaymentTerms` int,
  `targetLeadTimeDays` int,
  `estimatedSavings` decimal(15,2),
  `estimatedSavingsPercent` decimal(8,4),
  `aiAnalysis` text,
  `aiStrategy` text,
  `aiConfidenceScore` decimal(5,2),
  `initiatedBy` int,
  `completedAt` timestamp,
  `expiresAt` timestamp,
  `notes` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  KEY `idx_vendor_negotiations_vendor` (`vendorId`),
  KEY `idx_vendor_negotiations_status` (`status`)
);
--> statement-breakpoint

-- Negotiation rounds
CREATE TABLE IF NOT EXISTS `negotiationRounds` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `negotiationId` int NOT NULL,
  `roundNumber` int NOT NULL,
  `direction` enum('outbound','inbound') NOT NULL,
  `messageType` enum('initial_offer','counter_offer','acceptance','rejection','info_request','final_offer') NOT NULL,
  `proposedUnitPrice` decimal(15,4),
  `proposedPaymentTerms` int,
  `proposedLeadTimeDays` int,
  `proposedMinOrderAmount` decimal(15,2),
  `proposedVolume` decimal(15,2),
  `messageContent` text,
  `aiGeneratedDraft` text,
  `aiReasoning` text,
  `sentAt` timestamp,
  `receivedAt` timestamp,
  `sentBy` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  KEY `idx_negotiation_rounds_negotiation` (`negotiationId`),
  UNIQUE KEY `unique_negotiation_round` (`negotiationId`, `roundNumber`)
);

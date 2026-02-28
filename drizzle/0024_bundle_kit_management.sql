-- Bundle/Kit Management Module
-- Supports variety packs, multipaks, and kit SKU management
-- with automatic component inventory deduction on sale

CREATE TABLE `bundles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `sku` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `type` enum('bundle','kit','variety_pack','multipak') NOT NULL DEFAULT 'bundle',
  `unitPrice` decimal(15,2) NOT NULL,
  `costPrice` decimal(15,2),
  `currency` varchar(3) DEFAULT 'USD',
  `status` enum('active','inactive','discontinued') NOT NULL DEFAULT 'active',
  `shopifyProductId` varchar(64),
  `shopifyVariantId` varchar(64),
  `trackInventory` boolean DEFAULT true,
  `autoDeductComponents` boolean DEFAULT true,
  `availableQuantity` decimal(15,4) DEFAULT '0',
  `category` varchar(128),
  `imageUrl` text,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bundles_id` PRIMARY KEY(`id`)
);

CREATE TABLE `bundleComponents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `bundleId` int NOT NULL,
  `productId` int NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `unit` varchar(32) NOT NULL DEFAULT 'EA',
  `sortOrder` int DEFAULT 0,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bundleComponents_id` PRIMARY KEY(`id`)
);

CREATE TABLE `bundleDeductionLogs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `bundleId` int NOT NULL,
  `salesOrderId` int,
  `salesOrderLineId` int,
  `shopifyOrderId` varchar(64),
  `bundleQuantity` decimal(15,4) NOT NULL,
  `status` enum('pending','deducted','reversed','failed') NOT NULL DEFAULT 'pending',
  `errorMessage` text,
  `deductedAt` timestamp,
  `reversedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `bundleDeductionLogs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `bundleDeductionItems` (
  `id` int AUTO_INCREMENT NOT NULL,
  `deductionLogId` int NOT NULL,
  `productId` int NOT NULL,
  `warehouseId` int,
  `quantityDeducted` decimal(15,4) NOT NULL,
  `unit` varchar(32) NOT NULL DEFAULT 'EA',
  `previousQuantity` decimal(15,4),
  `newQuantity` decimal(15,4),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `bundleDeductionItems_id` PRIMARY KEY(`id`)
);

-- Add QuickBooks integration tables for COGS data sourcing

-- QuickBooks Chart of Accounts
CREATE TABLE IF NOT EXISTS `quickbooksAccounts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `quickbooksAccountId` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `accountType` varchar(64),
  `accountSubType` varchar(64),
  `classification` varchar(64),
  `fullyQualifiedName` text,
  `active` boolean DEFAULT true,
  `currentBalance` decimal(15,2),
  `currency` varchar(3) DEFAULT 'USD',
  `lastSyncedAt` timestamp,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `idx_qb_account_id` (`companyId`, `quickbooksAccountId`)
);

-- QuickBooks Account Mappings for COGS categories
CREATE TABLE IF NOT EXISTS `quickbooksAccountMappings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `mappingType` enum('cogs_product','cogs_freight','cogs_customs','inventory_asset','freight_expense','income_sales','expense_other') NOT NULL,
  `quickbooksAccountId` varchar(64) NOT NULL,
  `erpCategoryName` varchar(255),
  `isDefault` boolean DEFAULT false,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  KEY `idx_mapping_type` (`companyId`, `mappingType`)
);

-- QuickBooks Items (Products)
CREATE TABLE IF NOT EXISTS `quickbooksItems` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `quickbooksItemId` varchar(64) NOT NULL,
  `productId` int,
  `name` varchar(255) NOT NULL,
  `sku` varchar(64),
  `type` varchar(32),
  `description` text,
  `unitPrice` decimal(15,2),
  `purchaseCost` decimal(15,2),
  `quantityOnHand` decimal(15,4),
  `incomeAccountId` varchar(64),
  `expenseAccountId` varchar(64),
  `assetAccountId` varchar(64),
  `active` boolean DEFAULT true,
  `lastSyncedAt` timestamp,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `idx_qb_item_id` (`companyId`, `quickbooksItemId`),
  KEY `idx_product_id` (`productId`)
);

-- Add indexes for performance
CREATE INDEX `idx_qb_accounts_classification` ON `quickbooksAccounts` (`classification`, `active`);
CREATE INDEX `idx_qb_items_sku` ON `quickbooksItems` (`sku`);

-- Add COGS (Cost of Goods Sold) tracking infrastructure

-- Add cost tracking fields to inventory table
ALTER TABLE `inventory` ADD COLUMN `averageCost` decimal(15,4);
ALTER TABLE `inventory` ADD COLUMN `totalCostBasis` decimal(15,2);

-- Create COGS transactions table
CREATE TABLE IF NOT EXISTS `cogsTransactions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `transactionNumber` varchar(64) NOT NULL,
  `salesOrderId` int NOT NULL,
  `salesOrderLineId` int NOT NULL,
  `productId` int NOT NULL,
  `lotId` int,
  `warehouseId` int,
  `quantitySold` decimal(15,4) NOT NULL,
  `unitCost` decimal(15,4) NOT NULL,
  `productCost` decimal(15,2) NOT NULL,
  `freightCostAllocated` decimal(15,2) DEFAULT 0,
  `customsCostAllocated` decimal(15,2) DEFAULT 0,
  `insuranceCostAllocated` decimal(15,2) DEFAULT 0,
  `otherCostAllocated` decimal(15,2) DEFAULT 0,
  `totalCOGS` decimal(15,2) NOT NULL,
  `revenueAmount` decimal(15,2) NOT NULL,
  `grossProfit` decimal(15,2) NOT NULL,
  `costingMethod` enum('fifo','lifo','average','specific') DEFAULT 'fifo' NOT NULL,
  `notes` text,
  `transactionDate` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create freight cost allocations table
CREATE TABLE IF NOT EXISTS `freightCostAllocations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `purchaseOrderId` int,
  `shipmentId` int,
  `productId` int NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `freightCost` decimal(15,2) NOT NULL,
  `customsDuties` decimal(15,2) DEFAULT 0,
  `insuranceCost` decimal(15,2) DEFAULT 0,
  `handlingFees` decimal(15,2) DEFAULT 0,
  `totalAllocatedCost` decimal(15,2) NOT NULL,
  `allocationMethod` enum('weight','volume','quantity','value','manual') DEFAULT 'quantity' NOT NULL,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

-- Add COGS tracking fields to salesOrders table
ALTER TABLE `salesOrders` ADD COLUMN `totalCOGS` decimal(15,2);
ALTER TABLE `salesOrders` ADD COLUMN `grossProfit` decimal(15,2);
ALTER TABLE `salesOrders` ADD COLUMN `grossProfitMargin` decimal(5,2);

-- Add COGS tracking fields to salesOrderLines table
ALTER TABLE `salesOrderLines` ADD COLUMN `costOfGoodsSold` decimal(15,2);
ALTER TABLE `salesOrderLines` ADD COLUMN `grossProfit` decimal(15,2);

-- Create indexes for performance
CREATE INDEX `idx_cogs_sales_order` ON `cogsTransactions` (`salesOrderId`);
CREATE INDEX `idx_cogs_product` ON `cogsTransactions` (`productId`);
CREATE INDEX `idx_cogs_transaction_date` ON `cogsTransactions` (`transactionDate`);
CREATE INDEX `idx_freight_po` ON `freightCostAllocations` (`purchaseOrderId`);
CREATE INDEX `idx_freight_product` ON `freightCostAllocations` (`productId`);

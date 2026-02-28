-- Exchange Rates & FX Management
CREATE TABLE `exchangeRates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`fromCurrency` varchar(3) NOT NULL,
	`toCurrency` varchar(3) NOT NULL,
	`rate` decimal(18,8) NOT NULL,
	`rateDate` timestamp NOT NULL,
	`source` enum('manual','api','bank') NOT NULL DEFAULT 'manual',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exchangeRates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fxGainLoss` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`type` enum('realized','unrealized') NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` int NOT NULL,
	`originalCurrency` varchar(3) NOT NULL,
	`functionalCurrency` varchar(3) NOT NULL,
	`originalAmount` decimal(15,2) NOT NULL,
	`originalRate` decimal(18,8) NOT NULL,
	`settlementRate` decimal(18,8) NOT NULL,
	`gainLossAmount` decimal(15,2) NOT NULL,
	`transactionId` int,
	`periodDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fxGainLoss_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Landed Cost Allocation
CREATE TABLE `landedCostAllocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`allocationNumber` varchar(64) NOT NULL,
	`shipmentId` int,
	`purchaseOrderId` int,
	`freightBookingId` int,
	`customsClearanceId` int,
	`status` enum('draft','calculated','posted','void') NOT NULL DEFAULT 'draft',
	`freightCost` decimal(15,2) DEFAULT '0',
	`insuranceCost` decimal(15,2) DEFAULT '0',
	`dutyCost` decimal(15,2) DEFAULT '0',
	`customsFees` decimal(15,2) DEFAULT '0',
	`handlingFees` decimal(15,2) DEFAULT '0',
	`otherCosts` decimal(15,2) DEFAULT '0',
	`totalLandedCost` decimal(15,2) DEFAULT '0',
	`currency` varchar(3) DEFAULT 'USD',
	`allocationMethod` enum('by_value','by_weight','by_volume','by_quantity','equal') NOT NULL DEFAULT 'by_value',
	`transactionId` int,
	`postedBy` int,
	`postedAt` timestamp,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `landedCostAllocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `landedCostItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`allocationId` int NOT NULL,
	`productId` int,
	`rawMaterialId` int,
	`purchaseOrderItemId` int,
	`sku` varchar(64),
	`itemDescription` varchar(255),
	`quantity` decimal(15,4) NOT NULL,
	`unitCost` decimal(15,4) NOT NULL,
	`totalItemCost` decimal(15,2) NOT NULL,
	`weight` decimal(12,2),
	`volume` decimal(12,2),
	`allocatedFreight` decimal(15,2) DEFAULT '0',
	`allocatedInsurance` decimal(15,2) DEFAULT '0',
	`allocatedDuty` decimal(15,2) DEFAULT '0',
	`allocatedCustomsFees` decimal(15,2) DEFAULT '0',
	`allocatedHandling` decimal(15,2) DEFAULT '0',
	`allocatedOther` decimal(15,2) DEFAULT '0',
	`totalAllocatedCost` decimal(15,2) DEFAULT '0',
	`landedUnitCost` decimal(15,4),
	`sellingPrice` decimal(15,2),
	`grossMargin` decimal(15,2),
	`grossMarginPercent` decimal(8,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `landedCostItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Net Revenue & Channel Profitability
CREATE TABLE `platformFees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`channel` enum('shopify','amazon','wholesale','retail','direct','other') NOT NULL,
	`orderId` int,
	`invoiceId` int,
	`feeType` enum('transaction_fee','payment_processing','platform_commission','listing_fee','fulfillment_fee','advertising','refund_fee','chargeback','other') NOT NULL,
	`feeDescription` varchar(255),
	`feeAmount` decimal(15,2) NOT NULL,
	`feeCurrency` varchar(3) DEFAULT 'USD',
	`feeDate` timestamp NOT NULL,
	`referenceNumber` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformFees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channelPayouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`channel` enum('shopify','amazon','stripe','paypal','other') NOT NULL,
	`payoutNumber` varchar(128) NOT NULL,
	`payoutDate` timestamp NOT NULL,
	`grossAmount` decimal(15,2) NOT NULL,
	`feesDeducted` decimal(15,2) DEFAULT '0',
	`refundsDeducted` decimal(15,2) DEFAULT '0',
	`chargebacksDeducted` decimal(15,2) DEFAULT '0',
	`adjustments` decimal(15,2) DEFAULT '0',
	`netAmount` decimal(15,2) NOT NULL,
	`currency` varchar(3) DEFAULT 'USD',
	`status` enum('pending','in_transit','deposited','reconciled','discrepancy') NOT NULL DEFAULT 'pending',
	`bankAccountId` int,
	`reconciliationDate` timestamp,
	`reconciliationNotes` text,
	`rawPayoutData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channelPayouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payoutReconciliationLines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payoutId` int NOT NULL,
	`orderId` int,
	`invoiceId` int,
	`lineType` enum('sale','refund','fee','chargeback','adjustment','other') NOT NULL,
	`grossAmount` decimal(15,2) NOT NULL,
	`feeAmount` decimal(15,2) DEFAULT '0',
	`netAmount` decimal(15,2) NOT NULL,
	`status` enum('matched','unmatched','discrepancy') NOT NULL DEFAULT 'unmatched',
	`referenceNumber` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payoutReconciliationLines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Revenue Recognition & Auto GL Entries
CREATE TABLE `revenueRecognitionRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`name` varchar(255) NOT NULL,
	`method` enum('point_of_shipment','point_of_delivery','point_of_invoice','over_time','on_payment') NOT NULL,
	`channel` enum('shopify','amazon','wholesale','retail','direct','all') NOT NULL DEFAULT 'all',
	`productCategory` varchar(128),
	`revenueAccountId` int,
	`receivableAccountId` int,
	`deferredRevenueAccountId` int,
	`cogsAccountId` int,
	`inventoryAccountId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `revenueRecognitionRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `revenueRecognitionEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`ruleId` int NOT NULL,
	`eventType` enum('recognize','defer','reverse','adjust') NOT NULL,
	`triggerType` enum('shipment','delivery','invoice','payment','manual') NOT NULL,
	`triggerEntityType` varchar(64) NOT NULL,
	`triggerEntityId` int NOT NULL,
	`orderId` int,
	`invoiceId` int,
	`shipmentId` int,
	`revenueAmount` decimal(15,2) NOT NULL,
	`cogsAmount` decimal(15,2),
	`currency` varchar(3) DEFAULT 'USD',
	`transactionId` int,
	`status` enum('pending','posted','void') NOT NULL DEFAULT 'pending',
	`postedBy` int,
	`postedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `revenueRecognitionEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `glEntryTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`name` varchar(255) NOT NULL,
	`triggerEvent` enum('po_received','shipment_created','shipment_delivered','invoice_created','invoice_paid','payment_received','inventory_adjustment','production_completed','landed_cost_posted','fx_revaluation') NOT NULL,
	`description` text,
	`templateLines` json NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `glEntryTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Indexes for performance
CREATE INDEX `idx_exchange_rates_currencies` ON `exchangeRates` (`fromCurrency`, `toCurrency`, `rateDate`);
--> statement-breakpoint
CREATE INDEX `idx_fx_gain_loss_entity` ON `fxGainLoss` (`entityType`, `entityId`);
--> statement-breakpoint
CREATE INDEX `idx_landed_cost_shipment` ON `landedCostAllocations` (`shipmentId`);
--> statement-breakpoint
CREATE INDEX `idx_landed_cost_po` ON `landedCostAllocations` (`purchaseOrderId`);
--> statement-breakpoint
CREATE INDEX `idx_landed_cost_items_allocation` ON `landedCostItems` (`allocationId`);
--> statement-breakpoint
CREATE INDEX `idx_platform_fees_channel` ON `platformFees` (`channel`, `feeDate`);
--> statement-breakpoint
CREATE INDEX `idx_channel_payouts_channel` ON `channelPayouts` (`channel`, `payoutDate`);
--> statement-breakpoint
CREATE INDEX `idx_payout_recon_payout` ON `payoutReconciliationLines` (`payoutId`);
--> statement-breakpoint
CREATE INDEX `idx_rev_rec_events_order` ON `revenueRecognitionEvents` (`orderId`);
--> statement-breakpoint
CREATE INDEX `idx_rev_rec_events_shipment` ON `revenueRecognitionEvents` (`shipmentId`);
--> statement-breakpoint
CREATE INDEX `idx_gl_templates_trigger` ON `glEntryTemplates` (`triggerEvent`, `isActive`);

-- 0069_bills
--
-- Vendor bills (accounts payable). Until now there was no payables table:
-- db.getBills() returned purchase orders, appRouter.bills was a stub, and the
-- invoice-matching / payment-processing workflows, the vendor payment-reminder
-- email and the inbound-email "draft invoice" automation had all been turned
-- into no-ops (or wrote customer `invoices` rows) because `invoices` holds
-- receivables. Backed by drizzle/schema.ts `bills`. Re-runnable.

CREATE TABLE IF NOT EXISTS `bills` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `billNumber` varchar(64) NOT NULL,
  `vendorId` int NOT NULL,
  `purchaseOrderId` int,
  `sourceType` enum('manual','email','document_import','ai_draft','quickbooks') NOT NULL DEFAULT 'manual',
  `sourceRef` varchar(128),
  `billDate` timestamp NOT NULL,
  `dueDate` timestamp NULL,
  `subtotal` decimal(15,2),
  `taxAmount` decimal(15,2) DEFAULT '0',
  `shippingAmount` decimal(15,2) DEFAULT '0',
  `totalAmount` decimal(15,2) NOT NULL,
  `amountPaid` decimal(15,2) DEFAULT '0',
  `currency` varchar(3) DEFAULT 'USD',
  `status` enum('draft','pending_approval','approved','scheduled','partially_paid','paid','overdue','cancelled','disputed') NOT NULL DEFAULT 'draft',
  `matchStatus` enum('unmatched','matched','variance') NOT NULL DEFAULT 'unmatched',
  `approvedBy` int,
  `approvedAt` timestamp NULL,
  `paidAt` timestamp NULL,
  `paymentTerms` varchar(64),
  `notes` text,
  `attachmentUrl` varchar(512),
  `lineItems` json,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bills_id` PRIMARY KEY(`id`),
  INDEX `bills_company_status_idx` (`companyId`,`status`),
  INDEX `bills_vendor_idx` (`vendorId`)
);

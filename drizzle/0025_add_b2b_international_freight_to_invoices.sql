-- Add B2B and International Freight fields to invoices table
-- Migration for comprehensive B2B and international freight invoicing

ALTER TABLE `invoices` 
  ADD COLUMN `paymentTerms` enum('due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60', 'net_90', 'eom', 'cod', 'cia', 'custom') AFTER `terms`,
  ADD COLUMN `paymentMethod` enum('bank_transfer', 'wire', 'ach', 'check', 'credit_card', 'letter_of_credit', 'cash_in_advance', 'documentary_collection', 'open_account', 'consignment', 'other') AFTER `paymentTerms`,
  ADD COLUMN `purchaseOrderNumber` varchar(64) AFTER `paymentMethod`,
  ADD COLUMN `incoterms` varchar(10) AFTER `purchaseOrderNumber`,
  ADD COLUMN `freightRfqId` int AFTER `incoterms`,
  ADD COLUMN `portOfLoading` varchar(255) AFTER `freightRfqId`,
  ADD COLUMN `portOfDischarge` varchar(255) AFTER `portOfLoading`,
  ADD COLUMN `exportLicenseNumber` varchar(64) AFTER `portOfDischarge`,
  ADD COLUMN `importLicenseNumber` varchar(64) AFTER `exportLicenseNumber`,
  ADD COLUMN `shippingInstructions` text AFTER `importLicenseNumber`,
  ADD COLUMN `freightAmount` decimal(15, 2) DEFAULT '0' AFTER `shippingInstructions`,
  ADD COLUMN `insuranceAmount` decimal(15, 2) DEFAULT '0' AFTER `freightAmount`,
  ADD COLUMN `customsDuties` decimal(15, 2) DEFAULT '0' AFTER `insuranceAmount`;

-- Add international freight fields to invoice_items table
ALTER TABLE `invoice_items`
  ADD COLUMN `hsCode` varchar(20) AFTER `totalAmount`,
  ADD COLUMN `countryOfOrigin` varchar(100) AFTER `hsCode`,
  ADD COLUMN `weight` decimal(12, 2) AFTER `countryOfOrigin`,
  ADD COLUMN `volume` decimal(12, 2) AFTER `weight`;

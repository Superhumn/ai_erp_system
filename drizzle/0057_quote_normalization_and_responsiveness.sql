-- Migration 0057: quote normalization (FX / Incoterms / MOQ / tooling / freight)
-- and measured vendor responsiveness.
--
-- Adds:
--   * `currencyRates`                       — stored FX rates so quotes in different
--                                             currencies can be compared deterministically.
--   * `vendorRfqs.*`                        — the comparison basis every quote on an RFQ is
--                                             leveled to (base currency, target Incoterm,
--                                             freight/duty/insurance allowance rates, NRE volume).
--   * `vendorQuotes.*`                      — the commercial terms a vendor actually quoted
--                                             (Incoterm, duty, insurance, tooling/NRE) plus the
--                                             computed landed-cost outputs.
--   * `vendorRfqInvitations.*`              — first-response time and on-time flag.
--   * `vendors.default{Currency,Incoterms}` — fallbacks used when a quote omits them.
--   * `supplierPerformance.rfq*`            — RFQ response counters feeding responsiveScore.
--
-- Idempotent: every ADD / CREATE is guarded via INFORMATION_SCHEMA so re-runs are
-- safe. Foreign keys are intentionally omitted to match migration 0056.

DROP PROCEDURE IF EXISTS `_ensure_quote_normalization_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_quote_normalization_schema`()
BEGIN
  -- ── currencyRates ────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'currencyRates'
  ) THEN
    CREATE TABLE `currencyRates` (
      `id` int AUTO_INCREMENT NOT NULL,
      `fromCurrency` varchar(3) NOT NULL,
      `toCurrency` varchar(3) NOT NULL,
      `rate` decimal(18,8) NOT NULL,
      `asOf` timestamp NOT NULL,
      `source` varchar(64) NOT NULL DEFAULT 'manual',
      `notes` text,
      `createdBy` int,
      `createdAt` timestamp NOT NULL DEFAULT (now()),
      `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT `currencyRates_id` PRIMARY KEY(`id`),
      CONSTRAINT `currencyRates_pair_asof_idx` UNIQUE(`fromCurrency`,`toCurrency`,`asOf`)
    );
  END IF;

  -- ── vendorRfqs: comparison basis ─────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'baseCurrency') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `baseCurrency` varchar(3) DEFAULT 'USD';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'targetIncoterms') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `targetIncoterms` varchar(10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'destinationCountry') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `destinationCountry` varchar(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'freightAllowancePerUnit') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `freightAllowancePerUnit` decimal(15,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'freightAllowancePct') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `freightAllowancePct` decimal(6,3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'dutyRatePct') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `dutyRatePct` decimal(6,3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'insuranceRatePct') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `insuranceRatePct` decimal(6,3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqs' AND COLUMN_NAME = 'amortizeToolingOverUnits') THEN
    ALTER TABLE `vendorRfqs` ADD COLUMN `amortizeToolingOverUnits` decimal(15,4);
  END IF;

  -- ── vendorQuotes: quoted commercial terms ────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'incoterms') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `incoterms` varchar(10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'namedPlace') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `namedPlace` varchar(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'customsDutyAmount') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `customsDutyAmount` decimal(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'insuranceCost') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `insuranceCost` decimal(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'toolingCost') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `toolingCost` decimal(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'toolingAmortizationUnits') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `toolingAmortizationUnits` decimal(15,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'toolingIsRefundable') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `toolingIsRefundable` boolean DEFAULT false;
  END IF;

  -- ── vendorQuotes: computed normalization outputs ─────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'normalizedCurrency') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `normalizedCurrency` varchar(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'fxRate') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `fxRate` decimal(18,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'fxRateAsOf') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `fxRateAsOf` timestamp NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'fxRateSource') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `fxRateSource` varchar(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'landedUnitCost') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `landedUnitCost` decimal(18,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'landedTotalCost') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `landedTotalCost` decimal(18,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'billableQuantity') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `billableQuantity` decimal(15,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'moqShortfallUnits') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `moqShortfallUnits` decimal(15,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'toolingPerUnit') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `toolingPerUnit` decimal(18,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'normalizationBreakdown') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `normalizationBreakdown` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'normalizationWarnings') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `normalizationWarnings` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'normalizedRank') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `normalizedRank` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorQuotes' AND COLUMN_NAME = 'normalizedAt') THEN
    ALTER TABLE `vendorQuotes` ADD COLUMN `normalizedAt` timestamp NULL;
  END IF;

  -- ── vendorRfqInvitations: measured responsiveness ────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqInvitations' AND COLUMN_NAME = 'firstResponseHours') THEN
    ALTER TABLE `vendorRfqInvitations` ADD COLUMN `firstResponseHours` decimal(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqInvitations' AND COLUMN_NAME = 'respondedBeforeDueDate') THEN
    ALTER TABLE `vendorRfqInvitations` ADD COLUMN `respondedBeforeDueDate` boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendorRfqInvitations' AND COLUMN_NAME = 'closedAt') THEN
    ALTER TABLE `vendorRfqInvitations` ADD COLUMN `closedAt` timestamp NULL;
  END IF;

  -- ── vendors: normalization fallbacks ─────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'defaultCurrency') THEN
    ALTER TABLE `vendors` ADD COLUMN `defaultCurrency` varchar(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'defaultIncoterms') THEN
    ALTER TABLE `vendors` ADD COLUMN `defaultIncoterms` varchar(10);
  END IF;

  -- ── supplierPerformance: RFQ response counters ───────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplierPerformance' AND COLUMN_NAME = 'rfqsInvited') THEN
    ALTER TABLE `supplierPerformance` ADD COLUMN `rfqsInvited` int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplierPerformance' AND COLUMN_NAME = 'rfqsResponded') THEN
    ALTER TABLE `supplierPerformance` ADD COLUMN `rfqsResponded` int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplierPerformance' AND COLUMN_NAME = 'rfqsDeclined') THEN
    ALTER TABLE `supplierPerformance` ADD COLUMN `rfqsDeclined` int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplierPerformance' AND COLUMN_NAME = 'rfqsNoResponse') THEN
    ALTER TABLE `supplierPerformance` ADD COLUMN `rfqsNoResponse` int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplierPerformance' AND COLUMN_NAME = 'rfqResponseRatePct') THEN
    ALTER TABLE `supplierPerformance` ADD COLUMN `rfqResponseRatePct` decimal(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplierPerformance' AND COLUMN_NAME = 'onTimeQuoteRatePct') THEN
    ALTER TABLE `supplierPerformance` ADD COLUMN `onTimeQuoteRatePct` decimal(5,2);
  END IF;
  -- ── email_category enum: add vendor_quote plus the three values the
  --    classifier already emits but the enum never allowed ──────────────
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inbound_emails' AND COLUMN_NAME = 'email_category'
      AND COLUMN_TYPE NOT LIKE '%vendor_quote%'
  ) THEN
    ALTER TABLE `inbound_emails` MODIFY COLUMN `email_category`
      enum('receipt','purchase_order','invoice','shipping_confirmation','freight_quote','vendor_quote','delivery_notification','order_confirmation','payment_confirmation','inventory_report','hr_recruiting','legal','general')
      DEFAULT 'general';
  END IF;
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auto_reply_rules' AND COLUMN_NAME = 'email_category'
      AND COLUMN_TYPE NOT LIKE '%vendor_quote%'
  ) THEN
    ALTER TABLE `auto_reply_rules` MODIFY COLUMN `email_category`
      enum('receipt','purchase_order','invoice','shipping_confirmation','freight_quote','vendor_quote','delivery_notification','order_confirmation','payment_confirmation','inventory_report','hr_recruiting','legal','general')
      NOT NULL;
  END IF;
END;
--> statement-breakpoint
CALL `_ensure_quote_normalization_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_quote_normalization_schema`;

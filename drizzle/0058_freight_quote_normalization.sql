-- Migration 0058: freight quote normalization (chargeable weight / service scope / FX).
--
-- The freight counterpart to migration 0057. Adds:
--   * `freightRfqs.*`    — the comparison basis every quote on a freight RFQ is
--                          leveled to (base currency, target service scope,
--                          volumetric divisor, haulage/customs/insurance allowances).
--   * `freightQuotes.*`  — the commercial terms a carrier actually quoted
--                          (service scope, rate basis, chargeable weight) plus the
--                          computed landed-cost outputs.
--
-- Idempotent: every ADD is guarded via INFORMATION_SCHEMA so re-runs are safe.
-- Foreign keys are intentionally omitted to match migrations 0056 and 0057.

DROP PROCEDURE IF EXISTS `_ensure_freight_normalization_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_freight_normalization_schema`()
BEGIN
  -- ── freightRfqs: comparison basis ────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightRfqs' AND COLUMN_NAME = 'baseCurrency') THEN
    ALTER TABLE `freightRfqs` ADD COLUMN `baseCurrency` varchar(3) DEFAULT 'USD';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightRfqs' AND COLUMN_NAME = 'targetServiceScope') THEN
    ALTER TABLE `freightRfqs` ADD COLUMN `targetServiceScope` varchar(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightRfqs' AND COLUMN_NAME = 'dimFactorKgPerCbm') THEN
    ALTER TABLE `freightRfqs` ADD COLUMN `dimFactorKgPerCbm` decimal(10,3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightRfqs' AND COLUMN_NAME = 'originHaulageAllowance') THEN
    ALTER TABLE `freightRfqs` ADD COLUMN `originHaulageAllowance` decimal(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightRfqs' AND COLUMN_NAME = 'destinationHaulageAllowance') THEN
    ALTER TABLE `freightRfqs` ADD COLUMN `destinationHaulageAllowance` decimal(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightRfqs' AND COLUMN_NAME = 'customsClearanceAllowance') THEN
    ALTER TABLE `freightRfqs` ADD COLUMN `customsClearanceAllowance` decimal(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightRfqs' AND COLUMN_NAME = 'insuranceRatePct') THEN
    ALTER TABLE `freightRfqs` ADD COLUMN `insuranceRatePct` decimal(6,3);
  END IF;

  -- ── freightQuotes: quoted commercial terms ───────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'serviceScope') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `serviceScope` varchar(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'rateBasis') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `rateBasis` varchar(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'chargeableWeightKg') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `chargeableWeightKg` decimal(15,3);
  END IF;

  -- ── freightQuotes: computed normalization outputs ────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'normalizedCurrency') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `normalizedCurrency` varchar(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'fxRate') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `fxRate` decimal(18,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'fxRateAsOf') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `fxRateAsOf` timestamp NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'fxRateSource') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `fxRateSource` varchar(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'landedTotalCost') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `landedTotalCost` decimal(18,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'costPerChargeableKg') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `costPerChargeableKg` decimal(18,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'computedChargeableWeightKg') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `computedChargeableWeightKg` decimal(15,3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'normalizationBreakdown') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `normalizationBreakdown` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'normalizationWarnings') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `normalizationWarnings` text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'normalizedRank') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `normalizedRank` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightQuotes' AND COLUMN_NAME = 'normalizedAt') THEN
    ALTER TABLE `freightQuotes` ADD COLUMN `normalizedAt` timestamp NULL;
  END IF;
END;
--> statement-breakpoint
CALL `_ensure_freight_normalization_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_freight_normalization_schema`;

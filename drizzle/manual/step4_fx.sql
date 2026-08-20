-- Multi-entity rollout — STEP 4: money (functional + group amounts, frozen FX).
-- The fx_rates table and the amount-triple columns come from drizzle/schema.ts via `pnpm db:push`;
-- this file is an explicit, reversible artifact. Columns are NULLABLE: existing rows keep only
-- their transacted amount/currency; a backfill (or write-time computeMoneyTriple) fills the
-- functional/group amounts once fx_rates has coverage. Historical rows are never recomputed.

-- ============================== UP ==============================
CREATE TABLE IF NOT EXISTS fx_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fromCcy VARCHAR(3) NOT NULL,
  toCcy VARCHAR(3) NOT NULL,
  rate DECIMAL(18,8) NOT NULL,
  asOfDate TIMESTAMP NOT NULL,
  source VARCHAR(64),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fx_rates_from_to_date (fromCcy, toCcy, asOfDate)
);

-- amount_func (entity functional ccy), amount_group (USD), fx_rate_used + fx_rate_date (frozen).
ALTER TABLE transactions
  ADD COLUMN amountFunc DECIMAL(15,2), ADD COLUMN amountGroup DECIMAL(15,2),
  ADD COLUMN fxRateUsed DECIMAL(18,8), ADD COLUMN fxRateDate TIMESTAMP NULL;
ALTER TABLE invoices
  ADD COLUMN amountFunc DECIMAL(15,2), ADD COLUMN amountGroup DECIMAL(15,2),
  ADD COLUMN fxRateUsed DECIMAL(18,8), ADD COLUMN fxRateDate TIMESTAMP NULL;
ALTER TABLE orders
  ADD COLUMN amountFunc DECIMAL(15,2), ADD COLUMN amountGroup DECIMAL(15,2),
  ADD COLUMN fxRateUsed DECIMAL(18,8), ADD COLUMN fxRateDate TIMESTAMP NULL;
ALTER TABLE payments
  ADD COLUMN amountFunc DECIMAL(15,2), ADD COLUMN amountGroup DECIMAL(15,2),
  ADD COLUMN fxRateUsed DECIMAL(18,8), ADD COLUMN fxRateDate TIMESTAMP NULL;

-- ============================== DOWN ==============================
-- Intentionally commented out so applying this file can't drop anything. Uncomment to roll back.
-- ALTER TABLE transactions DROP COLUMN amountFunc, DROP COLUMN amountGroup, DROP COLUMN fxRateUsed, DROP COLUMN fxRateDate;
-- ALTER TABLE invoices     DROP COLUMN amountFunc, DROP COLUMN amountGroup, DROP COLUMN fxRateUsed, DROP COLUMN fxRateDate;
-- ALTER TABLE orders       DROP COLUMN amountFunc, DROP COLUMN amountGroup, DROP COLUMN fxRateUsed, DROP COLUMN fxRateDate;
-- ALTER TABLE payments     DROP COLUMN amountFunc, DROP COLUMN amountGroup, DROP COLUMN fxRateUsed, DROP COLUMN fxRateDate;
-- DROP TABLE IF EXISTS fx_rates;

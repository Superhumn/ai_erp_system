-- Migration 0059: source vendor and carrier contact details from their own websites.
--
-- Adds:
--   * `companyWebSources`      — append-only log of every attempt to read a company's
--                                contact details off its website (URL, HTTP status,
--                                what was extracted, why a value was rejected).
--   * `vendors.*`              — website plus contact provenance and verification.
--   * `freightCarriers.*`      — the same, plus `contactId` so carrier contacts join
--                                the CRM the way vendor contacts already do.
--
-- `contactSource` is the important column. "discovered" means a model proposed the
-- details and nothing has confirmed them; "website" means they were read off a page
-- served by the company's own domain, with `contactSourceUrl` naming that page.
-- Existing rows default to "manual", which is accurate: a human typed them.
--
-- Idempotent: every ADD / CREATE is guarded via INFORMATION_SCHEMA so re-runs are
-- safe. Foreign keys are intentionally omitted to match migrations 0056-0058.

DROP PROCEDURE IF EXISTS `_ensure_company_website_sourcing_schema`;
--> statement-breakpoint
CREATE PROCEDURE `_ensure_company_website_sourcing_schema`()
BEGIN
  -- ── companyWebSources ────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companyWebSources'
  ) THEN
    CREATE TABLE `companyWebSources` (
      `id` int AUTO_INCREMENT NOT NULL,
      `entityType` enum('vendor','freight_carrier') NOT NULL,
      `entityId` int NOT NULL,
      `websiteUrl` varchar(1024) NOT NULL,
      `fetchedUrl` varchar(1024),
      `httpStatus` int,
      `status` enum('ok','no_contact_found','fetch_failed','blocked','skipped') NOT NULL,
      `extracted` text,
      `warnings` text,
      `pagesFetched` int DEFAULT 0,
      `durationMs` int,
      `error` text,
      `requestedBy` int,
      `createdAt` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT `companyWebSources_id` PRIMARY KEY(`id`)
    );
    CREATE INDEX `companyWebSources_entity_idx` ON `companyWebSources` (`entityType`,`entityId`);
  END IF;

  -- ── vendors: website + contact provenance ────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'website') THEN
    ALTER TABLE `vendors` ADD COLUMN `website` varchar(512);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'contactSource') THEN
    ALTER TABLE `vendors` ADD COLUMN `contactSource` enum('manual','discovered','website','inbound_email','import') DEFAULT 'manual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'contactVerifiedAt') THEN
    ALTER TABLE `vendors` ADD COLUMN `contactVerifiedAt` timestamp NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendors' AND COLUMN_NAME = 'contactSourceUrl') THEN
    ALTER TABLE `vendors` ADD COLUMN `contactSourceUrl` varchar(1024);
  END IF;

  -- ── freightCarriers: CRM link + contact provenance ───────────────────────
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightCarriers' AND COLUMN_NAME = 'contactId') THEN
    ALTER TABLE `freightCarriers` ADD COLUMN `contactId` int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightCarriers' AND COLUMN_NAME = 'contactSource') THEN
    ALTER TABLE `freightCarriers` ADD COLUMN `contactSource` enum('manual','discovered','website','inbound_email','import') DEFAULT 'manual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightCarriers' AND COLUMN_NAME = 'contactVerifiedAt') THEN
    ALTER TABLE `freightCarriers` ADD COLUMN `contactVerifiedAt` timestamp NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freightCarriers' AND COLUMN_NAME = 'contactSourceUrl') THEN
    ALTER TABLE `freightCarriers` ADD COLUMN `contactSourceUrl` varchar(1024);
  END IF;
END;
--> statement-breakpoint
CALL `_ensure_company_website_sourcing_schema`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_ensure_company_website_sourcing_schema`;

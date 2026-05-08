-- Migration 0042: Shopify OAuth token refresh fields.
-- These columns were added to schema.ts and to production (likely via db:push)
-- but no migration file ever recorded the change. This migration documents
-- them so a fresh-DB replay reaches the same state.
-- Idempotent via INFORMATION_SCHEMA checks (MySQL 8/9 does not support
-- ADD COLUMN IF NOT EXISTS).

DROP PROCEDURE IF EXISTS `_add_shopify_oauth_tokens`;
--> statement-breakpoint
CREATE PROCEDURE `_add_shopify_oauth_tokens`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shopifyStores'
      AND COLUMN_NAME = 'tokenExpiresAt'
  ) THEN
    ALTER TABLE `shopifyStores` ADD COLUMN `tokenExpiresAt` timestamp NULL AFTER `accessToken`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shopifyStores'
      AND COLUMN_NAME = 'clientId'
  ) THEN
    ALTER TABLE `shopifyStores` ADD COLUMN `clientId` varchar(255) NULL AFTER `tokenExpiresAt`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shopifyStores'
      AND COLUMN_NAME = 'clientSecret'
  ) THEN
    ALTER TABLE `shopifyStores` ADD COLUMN `clientSecret` varchar(255) NULL AFTER `clientId`;
  END IF;
END;
--> statement-breakpoint
CALL `_add_shopify_oauth_tokens`();
--> statement-breakpoint
DROP PROCEDURE `_add_shopify_oauth_tokens`;

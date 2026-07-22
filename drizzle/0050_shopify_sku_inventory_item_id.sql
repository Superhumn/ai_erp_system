-- Migration 0050: Add shopifyInventoryItemId to shopifySkuMappings.
--
-- Shopify inventory-level data (inventory_levels REST + inventory_levels/update
-- webhooks) is keyed by inventory_item_id, NOT the variant id we store on the
-- mapping. Inventory sync was matching level.inventory_item_id against
-- mapping.shopifyVariantId (two different Shopify id spaces), so it never
-- matched and silently updated 0 rows. This column caches the variant's
-- inventory_item_id (backfilled lazily from the Shopify API during sync) so
-- inventory levels can be matched correctly.
--
-- Guarded with INFORMATION_SCHEMA so the migration is idempotent on replay,
-- consistent with the recovery pattern established in 0034.

DROP PROCEDURE IF EXISTS `_add_shopify_inventory_item_id`;
--> statement-breakpoint
CREATE PROCEDURE `_add_shopify_inventory_item_id`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shopifySkuMappings'
      AND COLUMN_NAME = 'shopifyInventoryItemId'
  ) THEN
    ALTER TABLE `shopifySkuMappings` ADD COLUMN `shopifyInventoryItemId` varchar(64) NULL;
  END IF;
END;
--> statement-breakpoint
CALL `_add_shopify_inventory_item_id`();
--> statement-breakpoint
DROP PROCEDURE `_add_shopify_inventory_item_id`;

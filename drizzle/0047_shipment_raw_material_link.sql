-- Migration 0047: Link shipments to raw-material inventory.
-- Adds shipments.rawMaterialId + shipments.quantity so an inbound shipment can
-- carry a specific raw material. Delivery of such a shipment moves that quantity
-- from the material's "in transit" bucket into "received" (see shipments.update
-- router cascade), keeping inventory in sync with shipment status.
--
-- INFORMATION_SCHEMA-guarded so a fresh-DB replay reaches the same end state and
-- re-runs on prod are no-ops.

DROP PROCEDURE IF EXISTS `_add_shipment_raw_material_link`;
--> statement-breakpoint
CREATE PROCEDURE `_add_shipment_raw_material_link`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shipments'
      AND COLUMN_NAME = 'rawMaterialId'
  ) THEN
    ALTER TABLE `shipments`
      ADD COLUMN `rawMaterialId` int NULL AFTER `purchaseOrderId`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shipments'
      AND COLUMN_NAME = 'quantity'
  ) THEN
    ALTER TABLE `shipments`
      ADD COLUMN `quantity` decimal(15,4) NULL AFTER `rawMaterialId`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shipments'
      AND CONSTRAINT_NAME = 'shipments_rawMaterialId_rawMaterials_id_fk'
  ) THEN
    ALTER TABLE `shipments`
      ADD CONSTRAINT `shipments_rawMaterialId_rawMaterials_id_fk`
      FOREIGN KEY (`rawMaterialId`) REFERENCES `rawMaterials`(`id`);
  END IF;
END;
--> statement-breakpoint
CALL `_add_shipment_raw_material_link`();
--> statement-breakpoint
DROP PROCEDURE `_add_shipment_raw_material_link`;

-- Link recipes to BOM + finished product for work orders / inventory consumption.

ALTER TABLE `recipes` ADD COLUMN `bomId` int;
--> statement-breakpoint
ALTER TABLE `recipes` ADD COLUMN `outputProductId` int;
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_bomId_billOfMaterials_id_fk`
  FOREIGN KEY (`bomId`) REFERENCES `billOfMaterials`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_outputProductId_products_id_fk`
  FOREIGN KEY (`outputProductId`) REFERENCES `products`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

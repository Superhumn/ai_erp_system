-- Migration 0033: Per-copacker recipe sharing.
-- A recipe is visible in a copacker's portal only if a row exists here for
-- their linked warehouse. Toggles control whether ingredients and/or
-- procedures are shared.

CREATE TABLE IF NOT EXISTS `recipe_copacker_shares` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recipeId` int NOT NULL,
  `warehouseId` int NOT NULL,
  `shareIngredients` boolean NOT NULL DEFAULT true,
  `shareProcedures` boolean NOT NULL DEFAULT true,
  `notes` text,
  `sharedBy` int,
  `sharedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `recipe_copacker_shares_id` PRIMARY KEY(`id`),
  CONSTRAINT `recipe_copacker_shares_recipe_warehouse_idx` UNIQUE(`recipeId`,`warehouseId`),
  KEY `recipe_copacker_shares_warehouse_sharedAt_idx` (`warehouseId`,`sharedAt`)
);
--> statement-breakpoint

ALTER TABLE `recipe_copacker_shares`
  ADD CONSTRAINT `recipe_copacker_shares_recipe_fk`
  FOREIGN KEY (`recipeId`) REFERENCES `recipes`(`id`);
--> statement-breakpoint

ALTER TABLE `recipe_copacker_shares`
  ADD CONSTRAINT `recipe_copacker_shares_warehouse_fk`
  FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`);
--> statement-breakpoint

ALTER TABLE `recipe_copacker_shares`
  ADD CONSTRAINT `recipe_copacker_shares_sharedBy_fk`
  FOREIGN KEY (`sharedBy`) REFERENCES `users`(`id`);

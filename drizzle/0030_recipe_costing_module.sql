-- Migration 0030: Recipe costing module tables.

CREATE TABLE IF NOT EXISTS `recipeIngredients` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `sku` varchar(64) NOT NULL,
  `category` enum('protein','spice','liquid','produce','packaging','other') NOT NULL DEFAULT 'other',
  `unitOfMeasure` enum('g','kg','lb','oz','ml','l','each') NOT NULL DEFAULT 'g',
  `costPerUnit` decimal(12,4) NOT NULL DEFAULT '0',
  `costUnit` enum('per_lb','per_kg','per_oz','per_each') NOT NULL DEFAULT 'per_kg',
  `supplierId` int,
  `leadTimeDays` int,
  `moistureContent` decimal(5,4),
  `shelfLifeDays` int,
  `isAllergen` boolean NOT NULL DEFAULT false,
  `allergenType` varchar(100),
  `notes` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recipeIngredients_id` PRIMARY KEY(`id`),
  CONSTRAINT `recipeIngredients_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `ingredientCostHistory` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ingredientId` int NOT NULL,
  `costPerUnit` decimal(12,4) NOT NULL,
  `costUnit` enum('per_lb','per_kg','per_oz','per_each') NOT NULL DEFAULT 'per_kg',
  `effectiveDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `supplierId` int,
  `source` varchar(100),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `ingredientCostHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `recipes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recipeId` varchar(32) NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` enum('beef','pork','chicken','seafood','dairy','blend','other') NOT NULL DEFAULT 'other',
  `status` enum('development','production','discontinued') NOT NULL DEFAULT 'development',
  `version` int NOT NULL DEFAULT 1,
  `isSubRecipe` boolean NOT NULL DEFAULT false,
  `baseBatchGrams` decimal(12,2) NOT NULL DEFAULT '0',
  `expectedYieldPct` decimal(5,4) NOT NULL DEFAULT '1.0000',
  `hasMoistureVariants` boolean NOT NULL DEFAULT false,
  `notes` text,
  `createdBy` int,
  `approvedBy` int,
  `approvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recipes_id` PRIMARY KEY(`id`),
  CONSTRAINT `recipes_recipe_version_idx` UNIQUE(`recipeId`,`version`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `recipeLines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recipeRowId` int NOT NULL,
  `lineNumber` int NOT NULL DEFAULT 1,
  `ingredientId` int,
  `subRecipeId` int,
  `quantityGrams` decimal(12,2) NOT NULL DEFAULT '0',
  `quantityGramsDry` decimal(12,2),
  `isProteinLine` boolean NOT NULL DEFAULT false,
  `isWaterLine` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recipeLines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `recipeProcedures` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recipeRowId` int NOT NULL,
  `stepNumber` int NOT NULL DEFAULT 1,
  `instruction` text NOT NULL,
  `durationMinutes` int,
  `temperatureF` int,
  `appliesTo` enum('both','dry_only','wet_only') NOT NULL DEFAULT 'both',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `recipeProcedures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `moistureProfiles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ingredientId` int NOT NULL,
  `profileName` varchar(50) NOT NULL,
  `moistureContent` decimal(5,4) NOT NULL,
  `isDefault` boolean NOT NULL DEFAULT false,
  `testedDate` timestamp NULL,
  `coaReference` varchar(100),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `moistureProfiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `batchCostSnapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recipeId` int NOT NULL,
  `snapshotDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `formulationType` enum('wet','dry') NOT NULL DEFAULT 'wet',
  `totalBatchGrams` decimal(12,2) NOT NULL,
  `totalBatchCost` decimal(12,4) NOT NULL,
  `costPerGram` decimal(12,6) NOT NULL,
  `costPerLb` decimal(12,4) NOT NULL,
  `costPerKg` decimal(12,4) NOT NULL,
  `yieldAdjustedCostPerLb` decimal(12,4) NOT NULL,
  `ingredientCosts` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `batchCostSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

ALTER TABLE `recipeIngredients`
  ADD CONSTRAINT `recipeIngredients_supplierId_vendors_id_fk`
  FOREIGN KEY (`supplierId`) REFERENCES `vendors`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `ingredientCostHistory`
  ADD CONSTRAINT `ingredientCostHistory_ingredientId_recipeIngredients_id_fk`
  FOREIGN KEY (`ingredientId`) REFERENCES `recipeIngredients`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `ingredientCostHistory`
  ADD CONSTRAINT `ingredientCostHistory_supplierId_vendors_id_fk`
  FOREIGN KEY (`supplierId`) REFERENCES `vendors`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `recipes`
  ADD CONSTRAINT `recipes_createdBy_users_id_fk`
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `recipes`
  ADD CONSTRAINT `recipes_approvedBy_users_id_fk`
  FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `recipeLines`
  ADD CONSTRAINT `recipeLines_recipeRowId_recipes_id_fk`
  FOREIGN KEY (`recipeRowId`) REFERENCES `recipes`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `recipeLines`
  ADD CONSTRAINT `recipeLines_ingredientId_recipeIngredients_id_fk`
  FOREIGN KEY (`ingredientId`) REFERENCES `recipeIngredients`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `recipeLines`
  ADD CONSTRAINT `recipeLines_subRecipeId_recipes_id_fk`
  FOREIGN KEY (`subRecipeId`) REFERENCES `recipes`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `recipeProcedures`
  ADD CONSTRAINT `recipeProcedures_recipeRowId_recipes_id_fk`
  FOREIGN KEY (`recipeRowId`) REFERENCES `recipes`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `moistureProfiles`
  ADD CONSTRAINT `moistureProfiles_ingredientId_recipeIngredients_id_fk`
  FOREIGN KEY (`ingredientId`) REFERENCES `recipeIngredients`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `batchCostSnapshots`
  ADD CONSTRAINT `batchCostSnapshots_recipeId_recipes_id_fk`
  FOREIGN KEY (`recipeId`) REFERENCES `recipes`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

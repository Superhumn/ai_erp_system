-- Migration 0047: Per-user recipe access grants.
-- Recipes (and their formulations) are private. A recipe is visible only to the
-- user who created it (the owner) and to users with an explicit grant row here.
-- There is no role-based bypass — access is granted individually per recipe.

CREATE TABLE IF NOT EXISTS `recipe_access_grants` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recipeId` int NOT NULL,
  `userId` int NOT NULL,
  `canEdit` boolean NOT NULL DEFAULT false,
  `grantedBy` int,
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `recipe_access_grants_id` PRIMARY KEY(`id`),
  CONSTRAINT `recipe_access_grants_recipe_user_idx` UNIQUE(`recipeId`,`userId`),
  CONSTRAINT `recipe_access_grants_recipe_fk` FOREIGN KEY (`recipeId`) REFERENCES `recipes`(`id`),
  CONSTRAINT `recipe_access_grants_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  CONSTRAINT `recipe_access_grants_grantedBy_fk` FOREIGN KEY (`grantedBy`) REFERENCES `users`(`id`)
);

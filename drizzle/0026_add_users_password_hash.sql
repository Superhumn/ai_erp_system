-- Add passwordHash column to users table for email/password auth
-- The localAuthCredentials table was created by 0016_local_auth_credentials.sql
-- but was never registered in the migration journal, so we also handle it here.

ALTER TABLE `users` ADD COLUMN `passwordHash` text NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `localAuthCredentials` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `openId` varchar(64) NOT NULL UNIQUE,
  `email` varchar(320) NOT NULL UNIQUE,
  `passwordHash` varchar(256) NOT NULL,
  `salt` varchar(256) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

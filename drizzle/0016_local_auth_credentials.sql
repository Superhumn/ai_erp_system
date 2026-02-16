-- Add local authentication credentials table for email/password auth
CREATE TABLE IF NOT EXISTS `localAuthCredentials` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `openId` varchar(64) NOT NULL UNIQUE,
  `email` varchar(320) NOT NULL UNIQUE,
  `passwordHash` varchar(256) NOT NULL,
  `salt` varchar(256) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX `idx_openId` ON `localAuthCredentials` (`openId`);
CREATE INDEX `idx_email` ON `localAuthCredentials` (`email`);

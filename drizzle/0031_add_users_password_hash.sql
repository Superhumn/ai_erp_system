-- Add passwordHash column to users table for local email/password authentication
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `passwordHash` text DEFAULT NULL AFTER `email`;

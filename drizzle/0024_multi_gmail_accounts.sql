-- Support multiple Gmail/Google accounts per user
-- Add unique index on (userId, googleEmail) to prevent duplicate connections
-- This allows users to connect multiple different Gmail accounts (personal + business)
CREATE UNIQUE INDEX `googleOAuthTokens_userId_email_idx` ON `googleOAuthTokens` (`userId`, `googleEmail`);

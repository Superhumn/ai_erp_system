-- Ensure the Google OAuth token columns are TEXT. On some deployments these
-- were created (or db:push'd) as VARCHAR, and Google's access/refresh tokens
-- and the multi-scope `scope` string can exceed 255 chars — causing the token
-- upsert to fail with "Data too long", which broke every Drive operation
-- (sync + the data-room document proxy). Widening to TEXT is idempotent when
-- the columns are already TEXT.
ALTER TABLE `googleOAuthTokens` MODIFY COLUMN `accessToken` text NOT NULL;--> statement-breakpoint
ALTER TABLE `googleOAuthTokens` MODIFY COLUMN `refreshToken` text;--> statement-breakpoint
ALTER TABLE `googleOAuthTokens` MODIFY COLUMN `scope` text;

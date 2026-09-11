-- 0067_qb_sync_unique_keys
--
-- The QuickBooks sync upserts matched rows with a read-then-write pair, so
-- concurrent syncs (or multiple replicas) could insert duplicate
-- (companyId, quickbooksAccountId|quickbooksItemId) rows. Enforce the
-- composite uniqueness in the database so the helpers can use atomic
-- INSERT ... ON DUPLICATE KEY UPDATE. Guarded + re-runnable (MySQL has no
-- ADD INDEX IF NOT EXISTS); any pre-existing duplicates are collapsed to
-- the newest row first so the index build cannot fail.

DROP PROCEDURE IF EXISTS `_migrate_0067_qb_sync_unique_keys`;
--> statement-breakpoint
CREATE PROCEDURE `_migrate_0067_qb_sync_unique_keys`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quickbooksAccounts' AND INDEX_NAME = 'uq_qb_accounts_company_account') THEN
    DELETE a FROM `quickbooksAccounts` a
      JOIN `quickbooksAccounts` b
        ON a.`companyId` <=> b.`companyId`
       AND a.`quickbooksAccountId` = b.`quickbooksAccountId`
       AND a.`id` < b.`id`;
    ALTER TABLE `quickbooksAccounts` ADD UNIQUE INDEX `uq_qb_accounts_company_account` (`companyId`, `quickbooksAccountId`);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quickbooksItems' AND INDEX_NAME = 'uq_qb_items_company_item') THEN
    DELETE a FROM `quickbooksItems` a
      JOIN `quickbooksItems` b
        ON a.`companyId` <=> b.`companyId`
       AND a.`quickbooksItemId` = b.`quickbooksItemId`
       AND a.`id` < b.`id`;
    ALTER TABLE `quickbooksItems` ADD UNIQUE INDEX `uq_qb_items_company_item` (`companyId`, `quickbooksItemId`);
  END IF;
END;
--> statement-breakpoint
CALL `_migrate_0067_qb_sync_unique_keys`();
--> statement-breakpoint
DROP PROCEDURE IF EXISTS `_migrate_0067_qb_sync_unique_keys`;

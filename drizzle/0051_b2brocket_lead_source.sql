-- Migration 0046: Add "b2brocket" to crm_contacts.source enum.
-- Leads pulled in from B2B Rocket via the Zapier "New Lead" webhook
-- (/webhooks/b2brocket/leads) are stored as crmContacts with source =
-- 'b2brocket' so they can be filtered/scored separately from other sources.
--
-- Written as an INFORMATION_SCHEMA-guarded MODIFY so a fresh-DB replay reaches
-- the same state and re-runs on prod are no-ops (the MODIFY only fires when the
-- value is not already present in the column's enum definition).

DROP PROCEDURE IF EXISTS `_add_b2brocket_lead_source`;
--> statement-breakpoint
CREATE PROCEDURE `_add_b2brocket_lead_source`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'crm_contacts'
      AND COLUMN_NAME = 'source'
      AND COLUMN_TYPE LIKE '%''b2brocket''%'
  ) THEN
    ALTER TABLE `crm_contacts`
      MODIFY COLUMN `source` enum(
        'iphone_bump','whatsapp','linkedin_scan','business_card','website',
        'referral','event','cold_outreach','import','manual','fireflies','b2brocket'
      ) NOT NULL DEFAULT 'manual';
  END IF;
END;
--> statement-breakpoint
CALL `_add_b2brocket_lead_source`();
--> statement-breakpoint
DROP PROCEDURE `_add_b2brocket_lead_source`;

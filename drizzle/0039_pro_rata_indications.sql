-- Migration 0039: pro-rata interest signaling for the investor portal.
--
-- When an existing investor sees an open round on their portal, they
-- can signal participation interest. This is non-binding — it's a
-- "please reach out" notice the IR team follows up on, not a
-- subscription document. Indicated amount is optional; some investors
-- want to signal interest without committing to a number yet.

CREATE TABLE `pro_rata_indications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaignId` int NOT NULL,
  `stakeholderId` int NOT NULL,
  `indicatedAmount` decimal(18,2) NULL,
  `notes` text NULL,
  `status` ENUM('interested','withdrawn','converted') NOT NULL DEFAULT 'interested',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pro_rata_indications_campaign_idx` (`campaignId`),
  KEY `pro_rata_indications_stakeholder_idx` (`stakeholderId`),
  -- One indication per (campaign, stakeholder) — re-signaling overwrites.
  UNIQUE KEY `pro_rata_indications_unique` (`campaignId`, `stakeholderId`)
);

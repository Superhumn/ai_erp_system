-- Migration 0045: pricing, regional SKUs, government tenders, regulatory licenses,
-- subsidiary fundraising, and brand ambassadors.
--
-- Adds 9 new tables to support:
--   * multi-tier price book (foodservice / wholesale / MSRP per region)
--   * region-specific SKU variants (e.g. SH-BWS-001-SA)
--   * government tender pipeline (GeM, IRCTC, ICDS, CSD, AIIMS, ...)
--   * regulatory license registry (FSSAI, DPIIT, EFSA Novel Food, ...)
--   * subsidiary fundraising rounds (separate from parent capTable)
--   * brand ambassador / influencer / character partnerships
--
-- All statements are guarded against pre-existing state so a fresh-DB replay
-- reaches the same end state and re-runs on prod are no-ops.

DROP PROCEDURE IF EXISTS `_install_pricing_tenders_licenses_v0045`;
--> statement-breakpoint
CREATE PROCEDURE `_install_pricing_tenders_licenses_v0045`()
BEGIN
  -- ---------------------------------------------------------------
  -- product_price_tiers — per-region, per-channel price book entries
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price_tiers'
  ) THEN
    CREATE TABLE `product_price_tiers` (
      `id` int NOT NULL AUTO_INCREMENT,
      `productId` int NOT NULL,
      `region` varchar(8) NOT NULL,
      `channel` enum('foodservice','wholesale','retail_msrp','retail_dtc','export','institutional','online','other') NOT NULL,
      `currency` varchar(3) NOT NULL,
      `packSize` varchar(64) DEFAULT NULL,
      `unitOfMeasure` varchar(16) DEFAULT 'kg',
      `pricePerUnit` decimal(15,4) NOT NULL,
      `taxMode` enum('exclusive','inclusive','exempt') NOT NULL DEFAULT 'exclusive',
      `taxRate` decimal(5,2) DEFAULT NULL,
      `minOrderQty` decimal(15,4) DEFAULT NULL,
      `effectiveFrom` timestamp NOT NULL,
      `effectiveTo` timestamp NULL DEFAULT NULL,
      `status` enum('draft','active','superseded','archived') NOT NULL DEFAULT 'active',
      `contractOnly` boolean DEFAULT FALSE,
      `notes` text,
      `createdBy` int DEFAULT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `ppt_product_idx` (`productId`),
      KEY `ppt_lookup_idx` (`productId`,`region`,`channel`,`status`),
      KEY `ppt_effective_idx` (`effectiveFrom`,`effectiveTo`),
      CONSTRAINT `ppt_product_fk` FOREIGN KEY (`productId`) REFERENCES `products` (`id`),
      CONSTRAINT `ppt_createdBy_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- product_volume_discounts — volume bands attached to a price tier
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_volume_discounts'
  ) THEN
    CREATE TABLE `product_volume_discounts` (
      `id` int NOT NULL AUTO_INCREMENT,
      `priceTierId` int NOT NULL,
      `minQty` decimal(15,4) NOT NULL,
      `maxQty` decimal(15,4) DEFAULT NULL,
      `discountPercent` decimal(5,2) DEFAULT '0',
      `discountAmount` decimal(15,4) DEFAULT NULL,
      `notes` text,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `pvd_tier_idx` (`priceTierId`),
      CONSTRAINT `pvd_tier_fk` FOREIGN KEY (`priceTierId`) REFERENCES `product_price_tiers` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- product_regional_skus — region-specific SKU variants
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_regional_skus'
  ) THEN
    CREATE TABLE `product_regional_skus` (
      `id` int NOT NULL AUTO_INCREMENT,
      `productId` int NOT NULL,
      `region` varchar(8) NOT NULL,
      `regionalSku` varchar(64) NOT NULL,
      `barcode` varchar(32) DEFAULT NULL,
      `barcodeType` enum('ean13','upc','gtin14','code128','other') DEFAULT NULL,
      `gs1Prefix` varchar(8) DEFAULT NULL,
      `localName` varchar(255) DEFAULT NULL,
      `localDescription` text,
      `packagingFormat` varchar(128) DEFAULT NULL,
      `status` enum('planned','active','discontinued') NOT NULL DEFAULT 'planned',
      `launchedAt` timestamp NULL DEFAULT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `prs_product_idx` (`productId`),
      KEY `prs_region_idx` (`region`),
      KEY `prs_lookup_idx` (`productId`,`region`),
      CONSTRAINT `prs_product_fk` FOREIGN KEY (`productId`) REFERENCES `products` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- government_tenders — GeM, IRCTC, ICDS, CSD, AIIMS pipeline
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'government_tenders'
  ) THEN
    CREATE TABLE `government_tenders` (
      `id` int NOT NULL AUTO_INCREMENT,
      `companyId` int DEFAULT NULL,
      `title` varchar(500) NOT NULL,
      `portal` enum(
        'gem','irctc','icds','csd','aiims','state_nutrition','state_hospital',
        'ministry_defense','ministry_railways','ministry_health','ministry_food',
        'eu_ted','us_sam_gov','uk_contracts_finder','other'
      ) NOT NULL,
      `customPortalName` varchar(255) DEFAULT NULL,
      `category` enum(
        'food_supply','defense_canteen','midday_meal','hospital_procurement',
        'railway_catering','school_nutrition','humanitarian_aid','other'
      ) NOT NULL DEFAULT 'food_supply',
      `solicitationNumber` varchar(128) DEFAULT NULL,
      `agency` varchar(255) DEFAULT NULL,
      `country` varchar(8) DEFAULT NULL,
      `state` varchar(64) DEFAULT NULL,
      `publishedDate` timestamp NULL DEFAULT NULL,
      `submissionDeadline` timestamp NULL DEFAULT NULL,
      `bidOpeningDate` timestamp NULL DEFAULT NULL,
      `awardDate` timestamp NULL DEFAULT NULL,
      `contractStartDate` timestamp NULL DEFAULT NULL,
      `contractEndDate` timestamp NULL DEFAULT NULL,
      `estimatedValue` decimal(18,2) DEFAULT NULL,
      `bidAmount` decimal(18,2) DEFAULT NULL,
      `awardedAmount` decimal(18,2) DEFAULT NULL,
      `emdAmount` decimal(15,2) DEFAULT NULL,
      `emdRefundedAt` timestamp NULL DEFAULT NULL,
      `currency` varchar(3) DEFAULT 'INR',
      `status` enum(
        'watching','qualifying','preparing','submitted','under_review',
        'shortlisted','awarded','lost','withdrawn','cancelled'
      ) NOT NULL DEFAULT 'watching',
      `classILocalSupplier` boolean DEFAULT FALSE,
      `fssaiRequired` boolean DEFAULT FALSE,
      `bomRequired` boolean DEFAULT FALSE,
      `bankGuaranteeRequired` boolean DEFAULT FALSE,
      `contactName` varchar(255) DEFAULT NULL,
      `contactEmail` varchar(320) DEFAULT NULL,
      `contactPhone` varchar(32) DEFAULT NULL,
      `portalUrl` text,
      `projectId` int DEFAULT NULL,
      `ownerId` int DEFAULT NULL,
      `notes` text,
      `createdBy` int DEFAULT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `gt_company_idx` (`companyId`),
      KEY `gt_portal_idx` (`portal`),
      KEY `gt_status_idx` (`status`),
      KEY `gt_deadline_idx` (`submissionDeadline`),
      KEY `gt_project_idx` (`projectId`),
      CONSTRAINT `gt_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`),
      CONSTRAINT `gt_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`),
      CONSTRAINT `gt_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`),
      CONSTRAINT `gt_createdBy_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- regulatory_licenses — FSSAI, DPIIT, EFSA Novel Food, FDA, ISO, ...
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'regulatory_licenses'
  ) THEN
    CREATE TABLE `regulatory_licenses` (
      `id` int NOT NULL AUTO_INCREMENT,
      `companyId` int DEFAULT NULL,
      `licenseType` enum(
        'fssai_central','fssai_state','fssai_basic',
        'dpiit_startup_india',
        'efsa_novel_food','fic_1169_2011_label','traces_nt','eu_organic',
        'fda_food_facility','fda_ffr','usda_organic','usda_amS',
        'haccp','iso_22000','brc','sqf',
        'halal','kosher','non_gmo','vegan_certified',
        'gst_registration','iec_import_export','rcmc',
        'pmksy_grant','maharashtra_agro_grant','karnataka_udyog_mitra',
        'trademark','patent','copyright',
        'other'
      ) NOT NULL,
      `customTypeName` varchar(255) DEFAULT NULL,
      `country` varchar(8) NOT NULL,
      `state` varchar(64) DEFAULT NULL,
      `authority` varchar(255) DEFAULT NULL,
      `licenseNumber` varchar(128) DEFAULT NULL,
      `status` enum(
        'planned','applied','in_review','issued','active',
        'expiring_soon','expired','revoked','renewed','rejected','withdrawn'
      ) NOT NULL DEFAULT 'planned',
      `appliedDate` timestamp NULL DEFAULT NULL,
      `issuedDate` timestamp NULL DEFAULT NULL,
      `expirationDate` timestamp NULL DEFAULT NULL,
      `renewalDueDate` timestamp NULL DEFAULT NULL,
      `renewalReminderDays` int DEFAULT 60,
      `lastRenewedAt` timestamp NULL DEFAULT NULL,
      `applicationFee` decimal(15,2) DEFAULT NULL,
      `annualFee` decimal(15,2) DEFAULT NULL,
      `currency` varchar(3) DEFAULT 'USD',
      `coversFacilityId` int DEFAULT NULL,
      `coversProductIds` json DEFAULT NULL,
      `contactName` varchar(255) DEFAULT NULL,
      `contactEmail` varchar(320) DEFAULT NULL,
      `contactPhone` varchar(32) DEFAULT NULL,
      `portalUrl` text,
      `documentUrl` text,
      `responsibleUserId` int DEFAULT NULL,
      `projectId` int DEFAULT NULL,
      `notes` text,
      `createdBy` int DEFAULT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `rl_company_idx` (`companyId`),
      KEY `rl_country_idx` (`country`),
      KEY `rl_status_idx` (`status`),
      KEY `rl_expiration_idx` (`expirationDate`),
      KEY `rl_project_idx` (`projectId`),
      CONSTRAINT `rl_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`),
      CONSTRAINT `rl_facility_fk` FOREIGN KEY (`coversFacilityId`) REFERENCES `warehouses` (`id`),
      CONSTRAINT `rl_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`),
      CONSTRAINT `rl_responsible_fk` FOREIGN KEY (`responsibleUserId`) REFERENCES `users` (`id`),
      CONSTRAINT `rl_createdBy_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- subsidiary_fundraising_rounds — kept separate from parent capTable
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_rounds'
  ) THEN
    CREATE TABLE `subsidiary_fundraising_rounds` (
      `id` int NOT NULL AUTO_INCREMENT,
      `subsidiaryCompanyId` int NOT NULL,
      `parentCompanyId` int DEFAULT NULL,
      `name` varchar(255) NOT NULL,
      `roundType` enum(
        'pre_seed','seed','series_a','series_b','series_c',
        'bridge','convertible_note','safe','debt','grant','strategic','other'
      ) NOT NULL,
      `targetAmount` decimal(18,2) DEFAULT NULL,
      `raisedAmount` decimal(18,2) DEFAULT '0',
      `currency` varchar(3) DEFAULT 'USD',
      `preMoneyValuation` decimal(18,2) DEFAULT NULL,
      `postMoneyValuation` decimal(18,2) DEFAULT NULL,
      `parentOwnershipPctBefore` decimal(6,3) DEFAULT NULL,
      `parentOwnershipPctAfter` decimal(6,3) DEFAULT NULL,
      `leadInvestorName` varchar(255) DEFAULT NULL,
      `openedDate` timestamp NULL DEFAULT NULL,
      `closedDate` timestamp NULL DEFAULT NULL,
      `status` enum('planning','open','closing','closed','cancelled') NOT NULL DEFAULT 'planning',
      `notes` text,
      `createdBy` int DEFAULT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `sfr_subsidiary_idx` (`subsidiaryCompanyId`),
      KEY `sfr_parent_idx` (`parentCompanyId`),
      KEY `sfr_status_idx` (`status`),
      CONSTRAINT `sfr_subsidiary_fk` FOREIGN KEY (`subsidiaryCompanyId`) REFERENCES `companies` (`id`),
      CONSTRAINT `sfr_parent_fk` FOREIGN KEY (`parentCompanyId`) REFERENCES `companies` (`id`),
      CONSTRAINT `sfr_createdBy_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- subsidiary_fundraising_investors — per-round participants
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subsidiary_fundraising_investors'
  ) THEN
    CREATE TABLE `subsidiary_fundraising_investors` (
      `id` int NOT NULL AUTO_INCREMENT,
      `roundId` int NOT NULL,
      `investorName` varchar(255) NOT NULL,
      `investorType` enum(
        'individual','angel','vc','pe','corporate','government','family_office',
        'crowd','strategic','employee','other'
      ) NOT NULL DEFAULT 'individual',
      `email` varchar(320) DEFAULT NULL,
      `phone` varchar(32) DEFAULT NULL,
      `country` varchar(8) DEFAULT NULL,
      `commitmentAmount` decimal(18,2) DEFAULT NULL,
      `fundedAmount` decimal(18,2) DEFAULT '0',
      `currency` varchar(3) DEFAULT 'USD',
      `ownershipPct` decimal(6,3) DEFAULT NULL,
      `status` enum(
        'introduced','in_diligence','term_sheet','committed',
        'wired','closed','declined','lapsed'
      ) NOT NULL DEFAULT 'introduced',
      `contactId` int DEFAULT NULL,
      `notes` text,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `sfi_round_idx` (`roundId`),
      KEY `sfi_status_idx` (`status`),
      KEY `sfi_contact_idx` (`contactId`),
      CONSTRAINT `sfi_round_fk` FOREIGN KEY (`roundId`) REFERENCES `subsidiary_fundraising_rounds` (`id`),
      CONSTRAINT `sfi_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `crm_contacts` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- brand_ambassadors — celebrity / athlete / character partnerships
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand_ambassadors'
  ) THEN
    CREATE TABLE `brand_ambassadors` (
      `id` int NOT NULL AUTO_INCREMENT,
      `companyId` int DEFAULT NULL,
      `name` varchar(255) NOT NULL,
      `type` enum(
        'celebrity','athlete','influencer','chef','musician','actor',
        'podcaster','youtuber','streamer','model','creator',
        'animated_character','fictional_character','mascot','other'
      ) NOT NULL,
      `category` varchar(128) DEFAULT NULL,
      `country` varchar(8) DEFAULT NULL,
      `region` varchar(64) DEFAULT NULL,
      `socialHandles` json DEFAULT NULL,
      `followerCount` bigint DEFAULT NULL,
      `followerCountByPlatform` json DEFAULT NULL,
      `estimatedReach` bigint DEFAULT NULL,
      `stage` enum(
        'shortlist','prospect','contacted','in_negotiation',
        'term_sheet','signed','active','paused','ended','declined','blacklisted'
      ) NOT NULL DEFAULT 'prospect',
      `priority` enum('low','medium','high') DEFAULT 'medium',
      `agencyName` varchar(255) DEFAULT NULL,
      `agentName` varchar(255) DEFAULT NULL,
      `agentEmail` varchar(320) DEFAULT NULL,
      `agentPhone` varchar(32) DEFAULT NULL,
      `campaignName` varchar(255) DEFAULT NULL,
      `contractStartDate` timestamp NULL DEFAULT NULL,
      `contractEndDate` timestamp NULL DEFAULT NULL,
      `contractValue` decimal(15,2) DEFAULT NULL,
      `currency` varchar(3) DEFAULT 'USD',
      `paymentTerms` varchar(255) DEFAULT NULL,
      `deliverables` text,
      `exclusivity` text,
      `usageRights` text,
      `contactId` int DEFAULT NULL,
      `projectId` int DEFAULT NULL,
      `ownerUserId` int DEFAULT NULL,
      `notes` text,
      `createdBy` int DEFAULT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `ba_company_idx` (`companyId`),
      KEY `ba_stage_idx` (`stage`),
      KEY `ba_type_idx` (`type`),
      KEY `ba_country_idx` (`country`),
      KEY `ba_project_idx` (`projectId`),
      CONSTRAINT `ba_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`),
      CONSTRAINT `ba_contact_fk` FOREIGN KEY (`contactId`) REFERENCES `crm_contacts` (`id`),
      CONSTRAINT `ba_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`),
      CONSTRAINT `ba_owner_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users` (`id`),
      CONSTRAINT `ba_createdBy_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- brand_ambassador_activities — touchpoints, posts, payments log
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand_ambassador_activities'
  ) THEN
    CREATE TABLE `brand_ambassador_activities` (
      `id` int NOT NULL AUTO_INCREMENT,
      `ambassadorId` int NOT NULL,
      `activityType` enum(
        'outreach','meeting','call','email','proposal_sent',
        'contract_sent','contract_signed','content_published',
        'appearance','shipment','payment','note'
      ) NOT NULL,
      `occurredAt` timestamp NOT NULL,
      `summary` varchar(500) DEFAULT NULL,
      `details` text,
      `postUrl` text,
      `impressions` bigint DEFAULT NULL,
      `engagements` bigint DEFAULT NULL,
      `createdBy` int DEFAULT NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `baa_ambassador_idx` (`ambassadorId`),
      KEY `baa_occurred_idx` (`occurredAt`),
      CONSTRAINT `baa_ambassador_fk` FOREIGN KEY (`ambassadorId`) REFERENCES `brand_ambassadors` (`id`),
      CONSTRAINT `baa_createdBy_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
    );
  END IF;
END;
--> statement-breakpoint
CALL `_install_pricing_tenders_licenses_v0045`();
--> statement-breakpoint
DROP PROCEDURE `_install_pricing_tenders_licenses_v0045`;

-- Migration 0038: investor portal phase 2 — document locker + self-service profile.
--
-- Two surfaces this enables:
--
-- 1. The "My Documents" tab on the investor portal — a per-stakeholder
--    locker for executed agreements, side letters, K-1s, capital-call /
--    distribution notices. Backed by a new `stakeholder_documents` table
--    that points at the project's storage layer (Forge proxy or S3).
--
-- 2. A "Profile & Preferences" tab where the investor self-services
--    their own contact + payment + accreditation info, instead of
--    emailing IR. Adds a few columns to `stakeholders`.
--
-- A `tier` column on `stakeholders` is added now (rather than wired up
-- with the first feature that uses it) so future gated sections — board
-- materials, sensitive cap-table detail — can read it without another
-- migration.

ALTER TABLE `stakeholders`
  ADD COLUMN `tier` ENUM('ordinary','major','board') NOT NULL DEFAULT 'ordinary',
  ADD COLUMN `mailingAddress` TEXT NULL,
  ADD COLUMN `paymentPreference` TEXT NULL,
  ADD COLUMN `accreditedReAttestedAt` TIMESTAMP NULL;

CREATE TABLE `stakeholder_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NULL,
  `stakeholderId` int NOT NULL,
  `title` varchar(256) NOT NULL,
  `description` text NULL,
  `category` ENUM('agreement','side_letter','k1','capital_call','distribution','other') NOT NULL DEFAULT 'other',
  `fileType` varchar(64) NULL,
  `mimeType` varchar(128) NULL,
  `fileSize` bigint NULL,
  `storageKey` varchar(512) NOT NULL,
  `storageUrl` varchar(1024) NULL,
  `uploadedBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `stakeholder_documents_stakeholder_idx` (`stakeholderId`),
  KEY `stakeholder_documents_company_idx` (`companyId`)
);

-- Migration 0044: Project Management module
-- Adds the pm_* tables that back the Market × Function matrix used to track
-- international market expansion. All statements are guarded against
-- pre-existing state so a fresh-DB replay reaches the same end state and
-- re-runs on prod are no-ops.

DROP PROCEDURE IF EXISTS `_install_pm_module`;
--> statement-breakpoint
CREATE PROCEDURE `_install_pm_module`()
BEGIN
  -- pm_markets
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_markets'
  ) THEN
    CREATE TABLE `pm_markets` (
      `id` int NOT NULL AUTO_INCREMENT,
      `name` varchar(128) NOT NULL,
      `code` varchar(8) NOT NULL,
      `tier` int NOT NULL DEFAULT 3,
      `status` enum('active','planning','watchlist','paused') NOT NULL DEFAULT 'watchlist',
      `entity_type` enum('jv','owned','copacker','distributor') NOT NULL DEFAULT 'distributor',
      `partnerName` varchar(255) NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `pm_markets_code_unique` (`code`)
    );
  END IF;

  -- pm_functions
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_functions'
  ) THEN
    CREATE TABLE `pm_functions` (
      `id` int NOT NULL AUTO_INCREMENT,
      `name` varchar(128) NOT NULL,
      `code` varchar(16) NOT NULL,
      `sortOrder` int NOT NULL DEFAULT 0,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `pm_functions_code_unique` (`code`)
    );
  END IF;

  -- pm_programs
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_programs'
  ) THEN
    CREATE TABLE `pm_programs` (
      `id` int NOT NULL AUTO_INCREMENT,
      `name` varchar(255) NOT NULL,
      `marketId` int NOT NULL,
      `description` text NULL,
      `startDate` timestamp NULL,
      `targetEndDate` timestamp NULL,
      `actualEndDate` timestamp NULL,
      `status` enum('not_started','in_progress','blocked','complete','cancelled') NOT NULL DEFAULT 'not_started',
      `ownerUserId` int NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `pm_programs_marketId_idx` (`marketId`),
      KEY `pm_programs_owner_idx` (`ownerUserId`),
      CONSTRAINT `pm_programs_marketId_fk` FOREIGN KEY (`marketId`) REFERENCES `pm_markets` (`id`)
    );
  END IF;

  -- pm_projects
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_projects'
  ) THEN
    CREATE TABLE `pm_projects` (
      `id` int NOT NULL AUTO_INCREMENT,
      `programId` int NULL,
      `marketId` int NOT NULL,
      `functionId` int NOT NULL,
      `name` varchar(255) NOT NULL,
      `description` text NULL,
      `startDate` timestamp NULL,
      `targetEndDate` timestamp NULL,
      `actualEndDate` timestamp NULL,
      `status` enum('not_started','in_progress','blocked','complete','cancelled') NOT NULL DEFAULT 'not_started',
      `priority` enum('p0','p1','p2','p3') NOT NULL DEFAULT 'p2',
      `ownerUserId` int NULL,
      `cashEventAmount` decimal(18,2) NULL,
      `cash_event_type` enum('revenue','capex','opex','funding') NULL,
      `cashEventDate` timestamp NULL,
      `blockerReason` text NULL,
      `blockedSince` timestamp NULL,
      `atRisk` boolean NOT NULL DEFAULT FALSE,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `pm_projects_matrix_idx` (`marketId`, `functionId`),
      KEY `pm_projects_status_market_idx` (`status`, `marketId`),
      KEY `pm_projects_owner_status_idx` (`ownerUserId`, `status`),
      KEY `pm_projects_cashdate_idx` (`cashEventDate`),
      KEY `pm_projects_programId_idx` (`programId`),
      CONSTRAINT `pm_projects_marketId_fk` FOREIGN KEY (`marketId`) REFERENCES `pm_markets` (`id`),
      CONSTRAINT `pm_projects_functionId_fk` FOREIGN KEY (`functionId`) REFERENCES `pm_functions` (`id`),
      CONSTRAINT `pm_projects_programId_fk` FOREIGN KEY (`programId`) REFERENCES `pm_programs` (`id`)
    );
  END IF;

  -- pm_tasks
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_tasks'
  ) THEN
    CREATE TABLE `pm_tasks` (
      `id` int NOT NULL AUTO_INCREMENT,
      `projectId` int NOT NULL,
      `name` varchar(255) NOT NULL,
      `description` text NULL,
      `assigneeUserId` int NULL,
      `status` enum('todo','in_progress','blocked','done') NOT NULL DEFAULT 'todo',
      `dueDate` timestamp NULL,
      `completedAt` timestamp NULL,
      `orderIndex` int NOT NULL DEFAULT 0,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `pm_tasks_projectId_idx` (`projectId`),
      KEY `pm_tasks_assignee_idx` (`assigneeUserId`),
      CONSTRAINT `pm_tasks_projectId_fk` FOREIGN KEY (`projectId`) REFERENCES `pm_projects` (`id`)
    );
  END IF;

  -- pm_dependencies
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_dependencies'
  ) THEN
    CREATE TABLE `pm_dependencies` (
      `id` int NOT NULL AUTO_INCREMENT,
      `predecessorProjectId` int NOT NULL,
      `successorProjectId` int NOT NULL,
      `dependency_type` enum('blocks','related','informs') NOT NULL DEFAULT 'blocks',
      `notes` text NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `pm_dependencies_predecessor_idx` (`predecessorProjectId`),
      KEY `pm_dependencies_successor_idx` (`successorProjectId`),
      CONSTRAINT `pm_dependencies_pred_fk` FOREIGN KEY (`predecessorProjectId`) REFERENCES `pm_projects` (`id`),
      CONSTRAINT `pm_dependencies_succ_fk` FOREIGN KEY (`successorProjectId`) REFERENCES `pm_projects` (`id`)
    );
  END IF;

  -- pm_milestones
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_milestones'
  ) THEN
    CREATE TABLE `pm_milestones` (
      `id` int NOT NULL AUTO_INCREMENT,
      `projectId` int NOT NULL,
      `name` varchar(255) NOT NULL,
      `targetDate` timestamp NOT NULL,
      `actualDate` timestamp NULL,
      `description` text NULL,
      `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `pm_milestones_projectId_idx` (`projectId`),
      KEY `pm_milestones_targetDate_idx` (`targetDate`),
      CONSTRAINT `pm_milestones_projectId_fk` FOREIGN KEY (`projectId`) REFERENCES `pm_projects` (`id`)
    );
  END IF;

  -- ----------------------------------------------------------------
  -- Seed data: 6 markets, 5 functions. Idempotent via INSERT IGNORE
  -- on the unique `code` column.
  -- ----------------------------------------------------------------
  INSERT IGNORE INTO `pm_markets` (`code`, `name`, `tier`, `status`, `entity_type`, `partnerName`) VALUES
    ('ZA', 'South Africa', 1, 'active',    'jv',          'FactoryCo Pty Ltd'),
    ('IN', 'India',        1, 'active',    'copacker',    NULL),
    ('US', 'US',           1, 'active',    'owned',       NULL),
    ('ID', 'Indonesia',    2, 'planning',  'distributor', NULL),
    ('CO', 'Colombia',     2, 'planning',  'distributor', NULL),
    ('EU', 'EU',           3, 'watchlist', 'distributor', NULL);

  INSERT IGNORE INTO `pm_functions` (`code`, `name`, `sortOrder`) VALUES
    ('MFG',   'Manufacturing',    1),
    ('SALES', 'Sales',            2),
    ('LEGAL', 'Legal/Regulatory', 3),
    ('FIN',   'Finance',          4),
    ('BRAND', 'Brand',            5);
END;
--> statement-breakpoint
CALL `_install_pm_module`();
--> statement-breakpoint
DROP PROCEDURE `_install_pm_module`;

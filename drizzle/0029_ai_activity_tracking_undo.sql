-- AI Activity Tracking & Undo Operations
-- Unified tracking of all AI agent activities with rollback capability

CREATE TABLE IF NOT EXISTS `ai_activity_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int DEFAULT NULL,
  `userId` int DEFAULT NULL,

  -- Source tracking
  `source` enum('agent','autonomous_workflow','ai_assistant','ai_agent_task') NOT NULL,
  `sourceRunId` int DEFAULT NULL,
  `sourceStepId` int DEFAULT NULL,

  -- What happened
  `actionType` enum('create','update','delete','send_email','approve','reject','transfer','allocate','forecast','analyze','decision') NOT NULL,
  `entityType` varchar(64) NOT NULL,
  `entityId` int DEFAULT NULL,
  `entityName` varchar(255) DEFAULT NULL,
  `description` text NOT NULL,

  -- Change data for undo
  `oldValues` json DEFAULT NULL,
  `newValues` json DEFAULT NULL,

  -- AI context
  `aiReasoning` text DEFAULT NULL,
  `confidence` decimal(5,2) DEFAULT NULL,

  -- Undo status
  `undoStatus` enum('available','undone','expired','not_undoable') NOT NULL DEFAULT 'available',
  `undoOperationId` int DEFAULT NULL,
  `undoDeadline` timestamp NULL DEFAULT NULL,

  -- Metadata
  `ipAddress` varchar(64) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_ai_activity_source` (`source`),
  KEY `idx_ai_activity_entity` (`entityType`, `entityId`),
  KEY `idx_ai_activity_undo` (`undoStatus`),
  KEY `idx_ai_activity_created` (`createdAt`),
  KEY `idx_ai_activity_company` (`companyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ai_undo_operations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int DEFAULT NULL,
  `activityLogId` int NOT NULL,

  -- Who requested
  `requestedBy` int NOT NULL,
  `requestedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Undo details
  `undoType` enum('revert_update','delete_created','restore_deleted','reverse_transfer','cancel_email','reject_approval','bulk_revert') NOT NULL,
  `entityType` varchar(64) NOT NULL,
  `entityId` int DEFAULT NULL,
  `revertData` json DEFAULT NULL,

  -- Status
  `status` enum('pending','in_progress','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `errorMessage` text DEFAULT NULL,
  `completedAt` timestamp NULL DEFAULT NULL,

  -- Audit
  `notes` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_undo_activity` (`activityLogId`),
  KEY `idx_undo_status` (`status`),
  KEY `idx_undo_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

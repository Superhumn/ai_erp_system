-- ============================================
-- VENDOR QUOTE WORKFLOW CONFIGURATION
-- Setup default workflows for vendor quote procurement
-- ============================================

-- This script creates the default workflow configurations for:
-- 1. Vendor Quote Procurement - Search, select, and send RFQs
-- 2. Vendor Quote Analysis - Analyze received quotes and make recommendations

-- ============================================
-- VENDOR QUOTE PROCUREMENT WORKFLOW
-- ============================================

INSERT INTO supplyChainWorkflows (
  name,
  description,
  workflowType,
  triggerType,
  cronSchedule,
  executionConfig,
  requiresApproval,
  autoApproveThreshold,
  approvalRoles,
  escalationMinutes,
  isActive
) VALUES (
  'Vendor Quote Procurement',
  'Autonomous workflow to search for vendors, generate RFQs, and send quote requests via AI agent',
  'vendor_quote_procurement',
  'manual',
  NULL,
  JSON_OBJECT(
    'maxVendors', 5,
    'quoteDueDays', 7,
    'validityPeriodDays', 30,
    'minQuotesRequired', 2,
    'searchCriteria', JSON_ARRAY(
      'material_type',
      'geographic_location',
      'industry_specialization',
      'minimum_capabilities'
    ),
    'emailTemplate', JSON_OBJECT(
      'useAI', true,
      'includeSpecifications', true,
      'requestValidityPeriod', 30
    )
  ),
  false,
  NULL,
  NULL,
  60,
  true
);

-- ============================================
-- VENDOR QUOTE ANALYSIS WORKFLOW
-- ============================================

INSERT INTO supplyChainWorkflows (
  name,
  description,
  workflowType,
  triggerType,
  triggerEvents,
  executionConfig,
  requiresApproval,
  autoApproveThreshold,
  approvalRoles,
  escalationMinutes,
  isActive
) VALUES (
  'Vendor Quote Analysis',
  'AI-powered analysis of received vendor quotes with automatic ranking, comparison, and approval routing',
  'vendor_quote_analysis',
  'event',
  JSON_ARRAY('vendor_quote_received', 'rfq_quote_deadline_passed'),
  JSON_OBJECT(
    'minQuotesForAnalysis', 2,
    'rankingFactors', JSON_OBJECT(
      'price', 50,
      'leadTime', 30,
      'vendorHistory', 20
    ),
    'aiConfidenceThreshold', 75,
    'autoRejectHigherThan', 1.5,
    'notifications', JSON_OBJECT(
      'sendAward', true,
      'sendRejection', true,
      'notifyOps', true
    )
  ),
  true,
  5000.00,
  JSON_ARRAY('ops', 'procurement'),
  60,
  true
);

-- ============================================
-- APPROVAL THRESHOLDS FOR VENDOR QUOTES
-- ============================================

INSERT INTO approvalThresholds (
  entityType,
  description,
  autoApproveMaxAmount,
  level1MaxAmount,
  level2MaxAmount,
  level3MaxAmount,
  level1Roles,
  level2Roles,
  level3Roles,
  execRoles,
  isActive
) VALUES (
  'vendor_quote',
  'Approval thresholds for vendor quote acceptance',
  5000.00,
  15000.00,
  50000.00,
  100000.00,
  JSON_ARRAY('ops', 'procurement'),
  JSON_ARRAY('admin', 'procurement_manager'),
  JSON_ARRAY('exec', 'cfo'),
  JSON_ARRAY('exec', 'ceo'),
  true
);

-- ============================================
-- EXCEPTION RULES FOR VENDOR QUOTE WORKFLOW
-- ============================================

INSERT INTO exceptionRules (
  exceptionType,
  description,
  resolutionStrategy,
  autoResolutionAction,
  priority,
  notifyRoles,
  isActive
) VALUES (
  'no_quotes_received',
  'No vendor quotes received within deadline',
  'route_to_human',
  NULL,
  1,
  JSON_ARRAY('ops', 'procurement'),
  true
),
(
  'single_quote_received',
  'Only one quote received - cannot perform comparison',
  'ai_decide',
  NULL,
  2,
  JSON_ARRAY('ops'),
  true
),
(
  'all_quotes_exceed_budget',
  'All received quotes exceed budget threshold',
  'escalate',
  NULL,
  1,
  JSON_ARRAY('admin', 'procurement_manager'),
  true
),
(
  'vendor_quote_expired',
  'Vendor quote validity period expired',
  'route_to_human',
  NULL,
  3,
  JSON_ARRAY('ops'),
  true
),
(
  'delivery_date_conflict',
  'Quoted delivery date does not meet requirements',
  'notify_and_continue',
  JSON_OBJECT('action', 'flag_for_review'),
  2,
  JSON_ARRAY('ops'),
  true
);

-- ============================================
-- NOTIFICATION PREFERENCES
-- ============================================

-- Add vendor quote workflow notification types
INSERT INTO notificationPreferences (userId, notificationType, inApp, email, push)
SELECT 
  id as userId,
  'vendor_quote_procurement_complete',
  true,
  true,
  false
FROM users WHERE role IN ('admin', 'ops', 'procurement')
ON DUPLICATE KEY UPDATE inApp = true, email = true;

INSERT INTO notificationPreferences (userId, notificationType, inApp, email, push)
SELECT 
  id as userId,
  'vendor_quote_analysis_complete',
  true,
  true,
  false
FROM users WHERE role IN ('admin', 'ops', 'procurement')
ON DUPLICATE KEY UPDATE inApp = true, email = true;

INSERT INTO notificationPreferences (userId, notificationType, inApp, email, push)
SELECT 
  id as userId,
  'vendor_quote_approval_needed',
  true,
  true,
  true
FROM users WHERE role IN ('admin', 'ops', 'procurement', 'exec')
ON DUPLICATE KEY UPDATE inApp = true, email = true, push = true;

-- ============================================
-- WORKFLOW METRICS INITIALIZATION
-- ============================================

-- Initialize metrics tracking for the new workflows
-- (Metrics will be auto-created on first run, but this ensures they exist)

-- Note: Actual workflow IDs will be determined after the workflows are created
-- This is just a placeholder to show the structure

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify workflows were created
SELECT id, name, workflowType, triggerType, isActive 
FROM supplyChainWorkflows 
WHERE workflowType IN ('vendor_quote_procurement', 'vendor_quote_analysis');

-- Verify approval thresholds
SELECT entityType, autoApproveMaxAmount, level1MaxAmount, level2MaxAmount, isActive
FROM approvalThresholds
WHERE entityType = 'vendor_quote';

-- Verify exception rules
SELECT id, exceptionType, resolutionStrategy, priority, isActive
FROM exceptionRules
WHERE exceptionType LIKE '%quote%';

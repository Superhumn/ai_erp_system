-- CFO Insights, Strategy & Reasoning Engine
-- Migration for AI-powered CFO financial intelligence capabilities

-- CFO Financial Insights - AI-generated financial analyses
CREATE TABLE IF NOT EXISTS `cfo_insights` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `category` enum('cash_flow','profitability','revenue','cost_optimization','risk','working_capital','debt','tax','growth','compliance') NOT NULL,
  `severity` enum('info','warning','critical','opportunity') NOT NULL DEFAULT 'info',
  `title` varchar(500) NOT NULL,
  `summary` text NOT NULL,
  `analysis` text NOT NULL,
  `recommendation` text,
  `impact` text,
  `impactAmount` decimal(15,2),
  `confidence` decimal(5,2),
  `dataPoints` text,
  `status` enum('new','acknowledged','in_progress','resolved','dismissed') NOT NULL DEFAULT 'new',
  `resolvedBy` int,
  `resolvedAt` timestamp,
  `expiresAt` timestamp,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- CFO Strategic Plans - AI-generated financial strategies
CREATE TABLE IF NOT EXISTS `cfo_strategies` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `title` varchar(500) NOT NULL,
  `objective` text NOT NULL,
  `timeHorizon` enum('short_term','medium_term','long_term') NOT NULL DEFAULT 'medium_term',
  `category` enum('growth','cost_reduction','capital_allocation','risk_management','cash_optimization','debt_strategy','tax_planning','m_and_a','fundraising','operational_efficiency') NOT NULL,
  `status` enum('draft','active','completed','paused','archived') NOT NULL DEFAULT 'draft',
  `priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `reasoning` text NOT NULL,
  `assumptions` text,
  `risks` text,
  `milestones` text,
  `kpis` text,
  `estimatedImpact` decimal(15,2),
  `actualImpact` decimal(15,2),
  `startDate` timestamp,
  `targetDate` timestamp,
  `completedAt` timestamp,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- CFO Cash Flow Projections
CREATE TABLE IF NOT EXISTS `cfo_cash_flow_projections` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `periodStart` timestamp NOT NULL,
  `periodEnd` timestamp NOT NULL,
  `granularity` enum('daily','weekly','monthly','quarterly') NOT NULL DEFAULT 'monthly',
  `projectedInflow` decimal(15,2) NOT NULL DEFAULT 0,
  `projectedOutflow` decimal(15,2) NOT NULL DEFAULT 0,
  `projectedNetCash` decimal(15,2) NOT NULL DEFAULT 0,
  `actualInflow` decimal(15,2),
  `actualOutflow` decimal(15,2),
  `actualNetCash` decimal(15,2),
  `arCollections` decimal(15,2),
  `apPayments` decimal(15,2),
  `payrollExpense` decimal(15,2),
  `capitalExpenditure` decimal(15,2),
  `debtService` decimal(15,2),
  `otherInflows` decimal(15,2),
  `otherOutflows` decimal(15,2),
  `assumptions` text,
  `scenarioType` enum('base','optimistic','pessimistic') NOT NULL DEFAULT 'base',
  `confidence` decimal(5,2),
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- CFO KPI Snapshots - periodic financial health metrics
CREATE TABLE IF NOT EXISTS `cfo_kpi_snapshots` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `snapshotDate` timestamp NOT NULL,
  `revenue` decimal(15,2),
  `grossProfit` decimal(15,2),
  `grossMargin` decimal(5,2),
  `operatingExpenses` decimal(15,2),
  `ebitda` decimal(15,2),
  `netIncome` decimal(15,2),
  `cashOnHand` decimal(15,2),
  `accountsReceivable` decimal(15,2),
  `accountsPayable` decimal(15,2),
  `inventoryValue` decimal(15,2),
  `currentRatio` decimal(5,2),
  `quickRatio` decimal(5,2),
  `debtToEquity` decimal(5,2),
  `dso` decimal(5,2),
  `dpo` decimal(5,2),
  `dio` decimal(5,2),
  `cashConversionCycle` decimal(5,2),
  `burnRate` decimal(15,2),
  `runway` decimal(5,2),
  `revenueGrowthRate` decimal(5,2),
  `customerAcquisitionCost` decimal(15,2),
  `ltv` decimal(15,2),
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CFO AI Reasoning Logs - track AI reasoning chains for audit
CREATE TABLE IF NOT EXISTS `cfo_reasoning_logs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int,
  `insightId` int,
  `strategyId` int,
  `requestType` enum('insight_generation','strategy_creation','cash_flow_forecast','scenario_analysis','risk_assessment','kpi_analysis','board_report','what_if') NOT NULL,
  `prompt` text NOT NULL,
  `reasoning` text NOT NULL,
  `conclusion` text NOT NULL,
  `dataSourcesSummary` text,
  `tokensUsed` int,
  `durationMs` int,
  `requestedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

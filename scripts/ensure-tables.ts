/**
 * Ensure all schema tables exist in the database.
 * Runs CREATE TABLE IF NOT EXISTS for every table in the schema.
 * Safe to run multiple times — skips existing tables.
 */
import mysql from 'mysql2/promise';
import 'dotenv/config';

async function ensureTables() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log("Checking all schema tables...\n");

  // Get existing tables
  const [rows] = await conn.execute("SHOW TABLES") as any;
  const existingTables = new Set(rows.map((r: any) => Object.values(r)[0] as string));
  console.log(`Existing tables: ${existingTables.size}`);

  // Tables that need to exist — add any missing ones here
  const requiredTables: Record<string, string> = {
    fundraising_campaigns: `CREATE TABLE IF NOT EXISTS fundraising_campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY, companyId INT, name VARCHAR(255) NOT NULL,
      description TEXT, targetAmount DECIMAL(18,2), raisedAmount DECIMAL(18,2) DEFAULT 0,
      minimumInvestment DECIMAL(18,2), valuation DECIMAL(18,2),
      roundType ENUM('pre_seed','seed','series_a','series_b','series_c','bridge','other') DEFAULT 'seed' NOT NULL,
      equityOffered DECIMAL(5,2), status ENUM('planning','active','paused','closed','cancelled') DEFAULT 'planning' NOT NULL,
      startDate TIMESTAMP NULL, targetCloseDate TIMESTAMP NULL, notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    )`,
    investor_investments: `CREATE TABLE IF NOT EXISTS investor_investments (
      id INT AUTO_INCREMENT PRIMARY KEY, companyId INT, investorId INT NOT NULL, campaignId INT,
      amount DECIMAL(18,2) NOT NULL, instrumentType ENUM('equity','safe','convertible_note','other') DEFAULT 'equity',
      shareClassId INT, sharesIssued DECIMAL(18,4), pricePerShare DECIMAL(18,6),
      investmentDate TIMESTAMP NULL, notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    )`,
    time_entries: `CREATE TABLE IF NOT EXISTS time_entries (
      id INT AUTO_INCREMENT PRIMARY KEY, companyId INT, userId INT NOT NULL, projectId INT,
      taskDescription VARCHAR(500) NOT NULL, date TIMESTAMP NOT NULL, hours DECIMAL(8,2) NOT NULL,
      hourlyRate DECIMAL(10,2), totalAmount DECIMAL(12,2),
      category ENUM('development','design','consulting','management','operations','admin','sales','support','other') DEFAULT 'other',
      billable BOOLEAN DEFAULT TRUE, status ENUM('draft','submitted','approved','invoiced','paid') DEFAULT 'draft',
      approvedBy INT, approvedAt TIMESTAMP NULL, notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    )`,
    time_invoices: `CREATE TABLE IF NOT EXISTS time_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY, companyId INT, userId INT NOT NULL,
      invoiceNumber VARCHAR(50) NOT NULL, periodStart TIMESTAMP NOT NULL, periodEnd TIMESTAMP NOT NULL,
      totalHours DECIMAL(10,2), hourlyRate DECIMAL(10,2), subtotal DECIMAL(12,2), taxAmount DECIMAL(12,2), totalAmount DECIMAL(12,2),
      status ENUM('draft','submitted','approved','sent','paid') DEFAULT 'draft',
      submittedAt TIMESTAMP NULL, approvedAt TIMESTAMP NULL, sentAt TIMESTAMP NULL, paidAt TIMESTAMP NULL,
      approvedBy INT, sentTo VARCHAR(320), notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    )`,
    kpi_goals: `CREATE TABLE IF NOT EXISTS kpi_goals (
      id INT AUTO_INCREMENT PRIMARY KEY, companyId INT, category VARCHAR(128),
      metricName VARCHAR(255) NOT NULL, year INT NOT NULL,
      targetValue VARCHAR(64), actualValue VARCHAR(64), unit VARCHAR(32),
      status ENUM('not_started','on_track','at_risk','behind','exceeded') DEFAULT 'not_started',
      month INT, notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    )`,
    financial_model: `CREATE TABLE IF NOT EXISTS financial_model (
      id INT AUTO_INCREMENT PRIMARY KEY, companyId INT, year INT, month INT,
      category VARCHAR(128), metricName VARCHAR(255), unit VARCHAR(32),
      projectedValue VARCHAR(64), actualValue VARCHAR(64), notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    )`,
  };

  let created = 0;
  for (const [name, sql] of Object.entries(requiredTables)) {
    if (!existingTables.has(name)) {
      try {
        await conn.execute(sql);
        console.log(`  ✓ Created: ${name}`);
        created++;
      } catch (e: any) {
        console.log(`  ✗ ${name}: ${e.message}`);
      }
    }
  }

  console.log(`\nCreated ${created} new tables. Total: ${existingTables.size + created}`);
  await conn.end();
  process.exit(0);
}

ensureTables().catch(err => { console.error(err); process.exit(1); });

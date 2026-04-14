/**
 * Import Pulley Cap Table XLSX into ERP database
 *
 * Reads SuperhumnInc_captable_04-11-2026.xlsx and inserts:
 *  - Share classes (from Summary sheet)
 *  - Stakeholders (from Ownership sheet)
 *  - Equity grants (from Employee Stock Plan, Founder Shares, ESOP sheets)
 *  - Convertible instruments (from Convertibles sheet)
 *
 * Usage: node scripts/importCapTable.mjs
 */

import XLSX from 'xlsx';
import mysql from 'mysql2/promise';

const XLSX_PATH = '/Users/jade/Downloads/SuperhumnInc_captable_04-11-2026.xlsx';
const DATABASE_URL = 'mysql://root:GSHsNkMyNiqTJdimvzLjhKbLpmyrRiKR@yamanote.proxy.rlwy.net:51481/railway';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(val) {
  if (!val) return null;
  let d;
  if (typeof val === 'string') {
    d = new Date(val);
  } else if (typeof val === 'number') {
    d = new Date((val - 25569) * 86400 * 1000);
  }
  if (!d || isNaN(d.getTime())) return null;
  // MySQL TIMESTAMP max is 2038-01-19. Cap far-future dates to 2037-12-31.
  if (d.getFullYear() > 2037) {
    d = new Date('2037-12-31T23:59:59Z');
  }
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[$,%]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function mapStakeholderType(pulleyType) {
  if (!pulleyType) return 'employee';
  const t = String(pulleyType).toLowerCase().trim();
  if (t === 'founder') return 'founder';
  if (t === 'investor') return 'investor';
  if (t === 'advisor') return 'advisor';
  if (t === 'employee') return 'employee';
  if (t === 'ex-employee') return 'employee';
  if (t === 'board member') return 'board_member';
  if (t === 'contractor') return 'contractor';
  if (t === 'other') return 'investor';
  return 'employee';
}

function mapGrantType(grantType) {
  if (!grantType) return 'purchase';
  const t = String(grantType).toUpperCase().trim();
  if (t === 'ISO') return 'option_iso';
  if (t === 'NSO') return 'option_nso';
  if (t === 'RSU') return 'rsu';
  if (t === 'RSA' || t === 'RESTRICTED STOCK') return 'restricted_stock';
  return 'purchase';
}

function mapGrantStatus(row) {
  const outstanding = parseNumber(row['Outstanding']);
  const granted = parseNumber(row['Granted']);
  const cancelled = parseNumber(row['Amount Cancelled']);
  const vested = parseNumber(row['Vested']);
  const unvested = parseNumber(row['Unvested']);

  if (cancelled >= granted && granted > 0) return 'cancelled';
  if (outstanding === 0 && cancelled > 0) return 'cancelled';
  if (vested >= granted && granted > 0 && unvested === 0) return 'fully_vested';
  if (vested > 0 && unvested > 0) return 'partially_vested';
  return 'active';
}

function parseVestingSchedule(schedule) {
  if (!schedule) return { cliffMonths: 0, totalVestingMonths: 0, vestingSchedule: 'none' };
  const s = String(schedule).toLowerCase();

  if (s.includes('fully vested') || s === 'immediate') {
    return { cliffMonths: 0, totalVestingMonths: 0, vestingSchedule: 'none' };
  }

  let totalVestingMonths = 0;
  let cliffMonths = 0;

  const totalMatch = s.match(/1\/(\d+)/);
  if (totalMatch) totalVestingMonths = parseInt(totalMatch[1], 10);

  const cliffMatch = s.match(/(\d+)\s*month\s*cliff/);
  if (cliffMatch) cliffMonths = parseInt(cliffMatch[1], 10);

  const cliffMatch2 = s.match(/(\d+)%\s*vest\s*at\s*(\d+)\s*month/);
  if (cliffMatch2 && cliffMonths === 0) cliffMonths = parseInt(cliffMatch2[2], 10);

  if (s.includes('no cliff')) cliffMonths = 0;

  return {
    cliffMonths,
    totalVestingMonths,
    vestingSchedule: s.includes('monthly') ? 'monthly' : (s.includes('quarterly') ? 'quarterly' : (s.includes('annual') ? 'annually' : 'custom'))
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Pulley Cap Table Import ===');
  console.log(`Reading XLSX: ${XLSX_PATH}`);

  const wb = XLSX.readFile(XLSX_PATH);
  console.log('Sheets found:', wb.SheetNames.join(', '));

  const url = new URL(DATABASE_URL);
  const connConfig = {
    host: url.hostname,
    port: parseInt(url.port, 10),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  };

  console.log(`Connecting to database: ${connConfig.host}:${connConfig.port}/${connConfig.database}`);
  const conn = await mysql.createConnection(connConfig);
  console.log('Connected.\n');

  // =========================================================================
  // STEP 1: Share Classes
  // =========================================================================
  console.log('--- STEP 1: Creating Share Classes ---');

  const shareClassesData = [
    { name: 'Common', type: 'common', authorizedShares: 2000000, pricePerShare: 0.01, parValue: 0.0001 },
    { name: 'Founder', type: 'common', authorizedShares: 7000000, pricePerShare: 0.01, parValue: 0.0001 },
    { name: 'Preferred', type: 'preferred', authorizedShares: 1000000, pricePerShare: null, parValue: 0.0001 },
    { name: 'Employee Stock Plan', type: 'option_pool', authorizedShares: 2000000, pricePerShare: null, parValue: 0.0001 },
    { name: 'ESOP', type: 'option_pool', authorizedShares: 1000000, pricePerShare: null, parValue: 0.0001 },
  ];

  const shareClassIdMap = {};

  for (const sc of shareClassesData) {
    const [existing] = await conn.execute(
      'SELECT id FROM share_classes WHERE name = ? LIMIT 1',
      [sc.name]
    );
    if (existing.length > 0) {
      const id = existing[0].id;
      shareClassIdMap[sc.name] = id;
      console.log(`  Share class "${sc.name}" already exists (id=${id}), skipping.`);
      continue;
    }

    const [result] = await conn.execute(
      `INSERT INTO share_classes (name, type, authorizedShares, pricePerShare, parValue, votingRights)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sc.name, sc.type, sc.authorizedShares, sc.pricePerShare, sc.parValue, sc.type !== 'option_pool']
    );
    const insertId = result.insertId;
    shareClassIdMap[sc.name] = insertId;
    console.log(`  Created share class "${sc.name}" (id=${insertId}, type=${sc.type}, authorized=${sc.authorizedShares})`);
  }
  console.log('  Share class ID map:', shareClassIdMap);
  console.log();

  // =========================================================================
  // STEP 2: Stakeholders (from Ownership sheet)
  // =========================================================================
  console.log('--- STEP 2: Creating Stakeholders ---');

  const ownershipSheet = wb.Sheets['Ownership'];
  const ownershipRaw = XLSX.utils.sheet_to_json(ownershipSheet, { header: 1, defval: null });

  const stakeholderIdMap = {};

  for (let i = 4; i < ownershipRaw.length; i++) {
    const row = ownershipRaw[i];
    if (!row) continue;
    const name = row[1];
    const typeRaw = row[2];

    if (!name || typeof name !== 'string') continue;
    if (name.includes('Available') || name === 'Total' || name.includes('Subtotal')) continue;

    const type = mapStakeholderType(typeRaw);

    const [existing] = await conn.execute(
      'SELECT id FROM stakeholders WHERE name = ? LIMIT 1',
      [name]
    );
    if (existing.length > 0) {
      const id = existing[0].id;
      stakeholderIdMap[name] = id;
      console.log(`  Stakeholder "${name}" already exists (id=${id}), skipping.`);
      continue;
    }

    const [result] = await conn.execute(
      `INSERT INTO stakeholders (name, type) VALUES (?, ?)`,
      [name, type]
    );
    const insertId = result.insertId;
    stakeholderIdMap[name] = insertId;
    console.log(`  Created stakeholder "${name}" (id=${insertId}, type=${type})`);
  }
  console.log(`  Total stakeholders in map: ${Object.keys(stakeholderIdMap).length}`);
  console.log();

  // =========================================================================
  // STEP 3: Equity Grants (from Employee Stock Plan, Founder Shares, ESOP)
  // =========================================================================
  console.log('--- STEP 3: Creating Equity Grants ---');

  const grantSheets = ['Employee Stock Plan', 'Founder Shares', 'ESOP'];
  let grantsCreated = 0;
  let grantsSkipped = 0;

  for (const sheetName of grantSheets) {
    console.log(`  Processing sheet: "${sheetName}"`);
    const ws = wb.Sheets[sheetName];
    if (!ws) { console.log(`    Sheet not found, skipping.`); continue; }

    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const headers = rawData[3];

    if (!headers) { console.log(`    No headers found at row 4, skipping.`); continue; }

    const colIdx = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) colIdx[String(headers[c]).trim()] = c;
    }

    for (let i = 4; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row) continue;

      const certId = row[colIdx['Certificate ID']];
      const stakeholderName = row[colIdx['Stakeholder Name']];
      const granted = parseNumber(row[colIdx['Granted']]);

      if (!certId || !stakeholderName) continue;
      if (typeof certId === 'string' && (
        certId.startsWith('Authorized') || certId.startsWith('Pour over') ||
        certId.startsWith('Repurchased') || certId.startsWith('Withheld') ||
        certId.startsWith('Available')
      )) continue;

      // Ensure stakeholder exists
      let stakeholderId = stakeholderIdMap[stakeholderName];
      if (!stakeholderId) {
        const [existing] = await conn.execute('SELECT id FROM stakeholders WHERE name = ? LIMIT 1', [stakeholderName]);
        if (existing.length > 0) {
          stakeholderId = existing[0].id;
          stakeholderIdMap[stakeholderName] = stakeholderId;
        } else {
          const [result] = await conn.execute(
            'INSERT INTO stakeholders (name, type) VALUES (?, ?)',
            [stakeholderName, 'employee']
          );
          stakeholderId = result.insertId;
          stakeholderIdMap[stakeholderName] = stakeholderId;
          console.log(`    Auto-created stakeholder "${stakeholderName}" (id=${stakeholderId})`);
        }
      }

      // Determine share class
      const shareClassName = row[colIdx['Share Class Name']] || 'Common';
      let shareClassId = shareClassIdMap[shareClassName];
      if (!shareClassId) {
        if (sheetName === 'Founder Shares') shareClassId = shareClassIdMap['Founder'];
        else if (sheetName === 'ESOP') shareClassId = shareClassIdMap['ESOP'];
        else shareClassId = shareClassIdMap['Employee Stock Plan'] || shareClassIdMap['Common'];
      }
      if (!shareClassId) {
        console.log(`    WARNING: No share class found for "${shareClassName}", skipping grant ${certId}`);
        grantsSkipped++;
        continue;
      }

      // Check for duplicate
      const [existingGrant] = await conn.execute(
        'SELECT id FROM equity_grants WHERE certificateNumber = ? LIMIT 1',
        [certId]
      );
      if (existingGrant.length > 0) {
        console.log(`    Grant ${certId} already exists (id=${existingGrant[0].id}), skipping.`);
        grantsSkipped++;
        continue;
      }

      const grantType = mapGrantType(row[colIdx['Grant Type']]);
      const grantDate = parseDate(row[colIdx['Grant Date']]);
      const expirationDate = parseDate(row[colIdx['Expiration Date']]);
      const exercisePrice = parseNumber(row[colIdx['Exercise Price']]);
      const vested = parseNumber(row[colIdx['Vested']]);
      const vestingScheduleRaw = row[colIdx['Vesting Schedule']];
      const vestingStartDate = parseDate(row[colIdx['Vesting Start Date']]);
      const earlyExercise = row[colIdx['Early Exercise']] === 'Yes';
      const status = mapGrantStatus({
        Outstanding: row[colIdx['Outstanding']],
        Granted: row[colIdx['Granted']],
        'Amount Cancelled': row[colIdx['Amount Cancelled']],
        Vested: row[colIdx['Vested']],
        Unvested: row[colIdx['Unvested']],
      });

      const { cliffMonths, totalVestingMonths, vestingSchedule } = parseVestingSchedule(vestingScheduleRaw);
      const boardApprovalDate = parseDate(row[colIdx['Board Approval Date']]);

      let notes = '';
      const cancellationReason = row[colIdx['Cancellation Reason']];
      const cancellationDate = row[colIdx['Date of Cancellation']];
      const terminationEvents = row[colIdx['Termination & Cancellation Events']];
      if (cancellationReason) notes += `Cancellation: ${cancellationReason}`;
      if (cancellationDate) notes += ` on ${cancellationDate}`;
      if (terminationEvents) notes += `. ${terminationEvents}`;
      notes = notes.trim() || null;

      const [result] = await conn.execute(
        `INSERT INTO equity_grants (
          stakeholderId, shareClassId, grantType, grantDate, shares, pricePerShare,
          status, vestingStartDate, vestingSchedule, cliffMonths, totalVestingMonths,
          sharesVested, exercisePrice, expirationDate, earlyExercise,
          certificateNumber, boardApprovalDate, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stakeholderId, shareClassId, grantType,
          grantDate, granted, exercisePrice,
          status, vestingStartDate, vestingSchedule,
          cliffMonths, totalVestingMonths,
          vested, exercisePrice, expirationDate, earlyExercise,
          certId, boardApprovalDate, notes
        ]
      );
      const insertId = result.insertId;
      grantsCreated++;
      console.log(`    Grant ${certId}: ${stakeholderName}, ${grantType}, ${granted} shares @ $${exercisePrice}, status=${status} (id=${insertId})`);
    }
  }
  console.log(`  Equity grants created: ${grantsCreated}, skipped: ${grantsSkipped}`);
  console.log();

  // =========================================================================
  // STEP 4: Convertible Instruments (from Convertibles sheet)
  // =========================================================================
  console.log('--- STEP 4: Creating Convertible Instruments ---');

  const convSheet = wb.Sheets['Convertibles'];
  let convertiblesCreated = 0;
  let convertiblesSkipped = 0;

  if (!convSheet) {
    console.log('  Convertibles sheet not found, skipping.');
  } else {
    const convRaw = XLSX.utils.sheet_to_json(convSheet, { header: 1, defval: null });
    const convHeaders = convRaw[3];

    const cIdx = {};
    if (convHeaders) {
      for (let c = 0; c < convHeaders.length; c++) {
        if (convHeaders[c]) cIdx[String(convHeaders[c]).trim()] = c;
      }
    }

    for (let i = 4; i < convRaw.length; i++) {
      const row = convRaw[i];
      if (!row) continue;

      const convertibleId = row[cIdx['Convertible ID']];
      const stakeholderName = row[cIdx['Stakeholder']];

      if (!convertibleId || !stakeholderName) continue;

      // Ensure stakeholder exists
      let stakeholderId = stakeholderIdMap[stakeholderName];
      if (!stakeholderId) {
        const [existing] = await conn.execute('SELECT id FROM stakeholders WHERE name = ? LIMIT 1', [stakeholderName]);
        if (existing.length > 0) {
          stakeholderId = existing[0].id;
          stakeholderIdMap[stakeholderName] = stakeholderId;
        } else {
          const [result] = await conn.execute(
            'INSERT INTO stakeholders (name, type) VALUES (?, ?)',
            [stakeholderName, 'investor']
          );
          stakeholderId = result.insertId;
          stakeholderIdMap[stakeholderName] = stakeholderId;
          console.log(`    Auto-created stakeholder "${stakeholderName}" (id=${stakeholderId})`);
        }
      }

      // Check for duplicate
      const [existingConv] = await conn.execute(
        'SELECT id FROM equity_grants WHERE certificateNumber = ? LIMIT 1',
        [convertibleId]
      );
      if (existingConv.length > 0) {
        console.log(`    Convertible ${convertibleId} already exists (id=${existingConv[0].id}), skipping.`);
        convertiblesSkipped++;
        continue;
      }

      const isSafe = String(convertibleId).toUpperCase().startsWith('SAFE');
      const grantType = isSafe ? 'safe' : 'convertible_note';

      const grantDate = parseDate(row[cIdx['Grant Date']]);
      const principalIssued = parseNumber(row[cIdx['Principal Issued']]);
      const interestRate = parseNumber(row[cIdx['Interest Rate']]);
      const maturityDate = parseDate(row[cIdx['Maturity Date']]);
      const statusRaw = row[cIdx['Status']];
      const conversionType = row[cIdx['Conversion Type']];

      let status;
      if (statusRaw === 'Outstanding') status = 'active';
      else if (statusRaw === 'Cancelled') status = 'cancelled';
      else if (statusRaw === 'Converted') status = 'converted';
      else status = 'active';

      const valCapRaw = row[cIdx['Valuation Cap']];
      let valuationCap = null;
      if (valCapRaw && valCapRaw !== 'Uncapped') {
        valuationCap = parseNumber(valCapRaw);
      }

      const discountRate = parseNumber(row[cIdx['Conversion Discount']]);

      const shareClassId = shareClassIdMap['Common'] || shareClassIdMap['Preferred'] || Object.values(shareClassIdMap)[0];

      let notes = `Conversion Type: ${conversionType || 'N/A'}`;
      if (valCapRaw === 'Uncapped') notes += '. Uncapped SAFE';
      const cancellationDate = row[cIdx['Cancellation Date']];
      const cancellationReason = row[cIdx['Cancellation Reason']];
      if (cancellationReason) notes += `. Cancelled: ${cancellationReason} on ${cancellationDate || 'N/A'}`;

      const [result] = await conn.execute(
        `INSERT INTO equity_grants (
          stakeholderId, shareClassId, grantType, grantDate, shares, pricePerShare,
          status, principalAmount, interestRate, valuationCap, discountRate,
          maturityDate, certificateNumber, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stakeholderId, shareClassId, grantType,
          grantDate,
          0,
          0,
          status,
          principalIssued,
          interestRate,
          valuationCap,
          discountRate,
          maturityDate,
          convertibleId,
          notes
        ]
      );
      const insertId = result.insertId;
      convertiblesCreated++;
      console.log(`    ${convertibleId}: ${stakeholderName}, ${grantType}, $${principalIssued}, cap=${valuationCap || 'Uncapped'}, status=${status} (id=${insertId})`);
    }
  }
  console.log(`  Convertibles created: ${convertiblesCreated}, skipped: ${convertiblesSkipped}`);

  console.log();
  console.log('=== Import Complete ===');
  console.log(`Share classes: ${Object.keys(shareClassIdMap).length}`);
  console.log(`Stakeholders: ${Object.keys(stakeholderIdMap).length}`);
  console.log(`Equity grants created: ${grantsCreated}`);
  console.log(`Convertibles created: ${convertiblesCreated}`);

  await conn.end();
  console.log('Database connection closed.');
}

main().catch(err => {
  console.error('IMPORT FAILED:', err);
  process.exit(1);
});

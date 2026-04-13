/**
 * R&D Tax Credit Calculation Engine
 * Implements IRC Section 41 credit calculations using both:
 * - Regular Credit (RC) method
 * - Alternative Simplified Credit (ASC) method
 *
 * References: IRS Form 6765, IRC §41, Treas. Reg. §1.41
 */

import type { RdTaxCreditStudy, RdExpense } from "../drizzle/schema";

export interface CreditCalculationInput {
  calculationMethod: "regular" | "asc";
  // Current year QREs by category
  wageQre: number;
  supplyQre: number;
  contractQre: number;
  // Regular Credit inputs
  fixedBasePercentage?: number; // As decimal, e.g., 0.03 for 3%
  currentYearGrossReceipts?: number;
  averageBasePeriodGrossReceipts?: number;
  // ASC inputs: prior 3 years QREs
  priorYear1Qre?: number;
  priorYear2Qre?: number;
  priorYear3Qre?: number;
  // Option to reduce credit under §280C
  elect280CReduction?: boolean;
}

export interface CreditCalculationResult {
  totalQre: number;
  baseAmount: number;
  excessQre: number;
  creditRate: number;
  grossCredit: number;
  section280CReduction: number;
  netCredit: number;
  averagePriorQre: number;
  currentYearGrossReceipts: number;
  effectiveRate: number;
  breakdown: {
    wageQre: number;
    supplyQre: number;
    contractQre: number;
  };
}

/**
 * Calculate R&D tax credit under Regular Credit method (IRC §41(a)(1))
 * Credit = 20% × (Current Year QREs - Base Amount)
 * Base Amount = Fixed-Base Percentage × Average Annual Gross Receipts for 4 preceding years
 * Base Amount cannot be less than 50% of current year QREs
 */
function calculateRegularCredit(input: CreditCalculationInput): CreditCalculationResult {
  const totalQre = input.wageQre + input.supplyQre + input.contractQre;
  const fixedBasePercentage = input.fixedBasePercentage || 0;
  const avgGrossReceipts = input.averageBasePeriodGrossReceipts || 0;

  // Base amount = fixed-base percentage × average gross receipts
  let baseAmount = fixedBasePercentage * avgGrossReceipts;

  // Base amount floor: cannot be less than 50% of current year QREs
  const minimumBase = totalQre * 0.5;
  baseAmount = Math.max(baseAmount, minimumBase);

  // Excess QREs over base amount (cannot be negative)
  const excessQre = Math.max(0, totalQre - baseAmount);

  // Regular credit rate is 20%
  const creditRate = 0.20;
  const grossCredit = Math.round(excessQre * creditRate * 100) / 100;

  // §280C election: reduce credit by maximum corporate tax rate (21%)
  const section280CReduction = input.elect280CReduction ? Math.round(grossCredit * 0.21 * 100) / 100 : 0;
  const netCredit = Math.round((grossCredit - section280CReduction) * 100) / 100;

  return {
    totalQre,
    baseAmount,
    excessQre,
    creditRate,
    grossCredit,
    section280CReduction,
    netCredit,
    averagePriorQre: 0,
    currentYearGrossReceipts: input.currentYearGrossReceipts || 0,
    effectiveRate: totalQre > 0 ? netCredit / totalQre : 0,
    breakdown: {
      wageQre: input.wageQre,
      supplyQre: input.supplyQre,
      contractQre: input.contractQre,
    },
  };
}

/**
 * Calculate R&D tax credit under Alternative Simplified Credit (ASC) method (IRC §41(c)(5))
 * Credit = 14% × (Current Year QREs - 50% of Average QREs for Prior 3 Years)
 * If no QREs in any of the 3 prior years, credit = 6% of current year QREs
 */
function calculateASCCredit(input: CreditCalculationInput): CreditCalculationResult {
  const totalQre = input.wageQre + input.supplyQre + input.contractQre;
  const prior1 = input.priorYear1Qre || 0;
  const prior2 = input.priorYear2Qre || 0;
  const prior3 = input.priorYear3Qre || 0;

  const hasPriorYearQres = prior1 > 0 || prior2 > 0 || prior3 > 0;
  const averagePriorQre = hasPriorYearQres ? (prior1 + prior2 + prior3) / 3 : 0;

  let baseAmount: number;
  let creditRate: number;
  let excessQre: number;

  if (hasPriorYearQres) {
    // Standard ASC: 14% of QREs exceeding 50% of average prior 3 years
    baseAmount = averagePriorQre * 0.5;
    excessQre = Math.max(0, totalQre - baseAmount);
    creditRate = 0.14;
  } else {
    // No prior year QREs: 6% of current year QREs
    baseAmount = 0;
    excessQre = totalQre;
    creditRate = 0.06;
  }

  const grossCredit = Math.round(excessQre * creditRate * 100) / 100;

  // §280C election: reduce credit by maximum corporate tax rate (21%)
  const section280CReduction = input.elect280CReduction ? Math.round(grossCredit * 0.21 * 100) / 100 : 0;
  const netCredit = Math.round((grossCredit - section280CReduction) * 100) / 100;

  return {
    totalQre,
    baseAmount,
    excessQre,
    creditRate,
    grossCredit,
    section280CReduction,
    netCredit,
    averagePriorQre,
    currentYearGrossReceipts: input.currentYearGrossReceipts || 0,
    effectiveRate: totalQre > 0 ? netCredit / totalQre : 0,
    breakdown: {
      wageQre: input.wageQre,
      supplyQre: input.supplyQre,
      contractQre: input.contractQre,
    },
  };
}

/**
 * Main entry point: calculate R&D tax credit based on method
 */
export function calculateRdTaxCredit(input: CreditCalculationInput): CreditCalculationResult {
  if (input.calculationMethod === "regular") {
    return calculateRegularCredit(input);
  }
  return calculateASCCredit(input);
}

/**
 * Compute qualified amounts from raw expenses.
 * - Wages: grossAmount × rdPercentage
 * - Supplies: grossAmount × rdPercentage (100% qualified)
 * - Contract research: grossAmount × rdPercentage × 65% (statutory rate)
 * - Cloud computing: grossAmount × rdPercentage (treated as supplies)
 */
export function computeQualifiedAmount(
  category: "wages" | "supplies" | "contract_research" | "cloud_computing",
  grossAmount: number,
  rdPercentage: number = 100,
  contractResearchRate: number = 65
): number {
  const rdFraction = rdPercentage / 100;
  switch (category) {
    case "wages":
      return grossAmount * rdFraction;
    case "supplies":
    case "cloud_computing":
      return grossAmount * rdFraction;
    case "contract_research":
      return grossAmount * rdFraction * (contractResearchRate / 100);
    default:
      return 0;
  }
}

/**
 * Aggregate expenses by category for a study
 */
export function aggregateExpensesByCategory(expenses: Pick<RdExpense, "category" | "qualifiedAmount">[]) {
  const totals = { wages: 0, supplies: 0, contract_research: 0, cloud_computing: 0 };
  for (const exp of expenses) {
    const amt = parseFloat(String(exp.qualifiedAmount)) || 0;
    if (exp.category in totals) {
      totals[exp.category as keyof typeof totals] += amt;
    }
  }
  return {
    wageQre: totals.wages,
    supplyQre: totals.supplies + totals.cloud_computing,
    contractQre: totals.contract_research,
    totalQre: totals.wages + totals.supplies + totals.cloud_computing + totals.contract_research,
  };
}

/**
 * Generate Form 6765 data structure for filing
 */
export function generateForm6765Data(study: RdTaxCreditStudy, result: CreditCalculationResult) {
  return {
    formNumber: "6765",
    taxYear: study.taxYear,
    companyId: study.companyId,
    part: study.calculationMethod === "regular" ? "II" : "III",
    // Section A: Regular or ASC
    calculationMethod: study.calculationMethod,
    // QRE Breakdown
    line1_wages: result.breakdown.wageQre,
    line2_supplies: result.breakdown.supplyQre,
    line3_contractResearch: result.breakdown.contractQre,
    line5_totalQre: result.totalQre,
    // Base amount
    line6_baseAmount: result.baseAmount,
    // Credit calculation
    line7_excessQre: result.excessQre,
    line8_creditRate: result.creditRate,
    line9_grossCredit: result.grossCredit,
    // 280C reduction
    line10_section280C: result.section280CReduction,
    line11_netCredit: result.netCredit,
    // Prior year QREs (ASC only)
    priorYear1Qre: parseFloat(String(study.priorYear1Qre)) || 0,
    priorYear2Qre: parseFloat(String(study.priorYear2Qre)) || 0,
    priorYear3Qre: parseFloat(String(study.priorYear3Qre)) || 0,
    averagePriorQre: result.averagePriorQre,
    // Gross receipts (Regular Credit / Form 6765 reporting)
    currentYearGrossReceipts: result.currentYearGrossReceipts,
    averageBasePeriodGrossReceipts: parseFloat(String(study.averageBasePeriodGrossReceipts)) || 0,
    // Status
    studyStatus: study.status,
    filingDate: study.filingDate,
  };
}

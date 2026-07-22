import { describe, expect, it } from "vitest";
import {
  calculateRdTaxCredit,
  computeQualifiedAmount,
  aggregateExpensesByCategory,
  generateForm6765Data,
} from "./rdTaxCreditService";

describe("R&D Tax Credit Calculation Engine", () => {
  describe("computeQualifiedAmount", () => {
    it("should compute 100% for wages at full R&D allocation", () => {
      expect(computeQualifiedAmount("wages", 100000, 100)).toBe(100000);
    });

    it("should compute partial R&D allocation for wages", () => {
      expect(computeQualifiedAmount("wages", 100000, 60)).toBe(60000);
    });

    it("should compute 100% for supplies", () => {
      expect(computeQualifiedAmount("supplies", 50000, 100)).toBe(50000);
    });

    it("should compute 65% for contract research", () => {
      expect(computeQualifiedAmount("contract_research", 100000, 100, 65)).toBe(65000);
    });

    it("should compute contract research with partial R&D %", () => {
      expect(computeQualifiedAmount("contract_research", 100000, 50, 65)).toBe(32500);
    });

    it("should compute cloud computing same as supplies", () => {
      expect(computeQualifiedAmount("cloud_computing", 30000, 80)).toBe(24000);
    });
  });

  describe("aggregateExpensesByCategory", () => {
    it("should aggregate expenses by category", () => {
      const expenses = [
        { category: "wages" as const, qualifiedAmount: "50000" },
        { category: "wages" as const, qualifiedAmount: "30000" },
        { category: "supplies" as const, qualifiedAmount: "10000" },
        { category: "contract_research" as const, qualifiedAmount: "20000" },
        { category: "cloud_computing" as const, qualifiedAmount: "5000" },
      ];
      const result = aggregateExpensesByCategory(expenses);
      expect(result.wageQre).toBe(80000);
      expect(result.supplyQre).toBe(15000); // supplies + cloud_computing
      expect(result.contractQre).toBe(20000);
      expect(result.totalQre).toBe(115000);
    });

    it("should handle empty expenses", () => {
      const result = aggregateExpensesByCategory([]);
      expect(result.totalQre).toBe(0);
    });
  });

  describe("Alternative Simplified Credit (ASC)", () => {
    it("should calculate ASC with prior year QREs", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "asc",
        wageQre: 300000,
        supplyQre: 50000,
        contractQre: 50000,
        priorYear1Qre: 350000,
        priorYear2Qre: 300000,
        priorYear3Qre: 250000,
      });

      // Total QRE = 400,000
      expect(result.totalQre).toBe(400000);
      // Average prior QRE = (350k + 300k + 250k) / 3 = 300,000
      expect(result.averagePriorQre).toBe(300000);
      // Base = 50% of 300,000 = 150,000
      expect(result.baseAmount).toBe(150000);
      // Excess = 400,000 - 150,000 = 250,000
      expect(result.excessQre).toBe(250000);
      // Credit = 14% × 250,000 = 35,000
      expect(result.grossCredit).toBe(35000);
      expect(result.creditRate).toBe(0.14);
      expect(result.netCredit).toBe(35000);
    });

    it("should use 6% rate when no prior year QREs", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "asc",
        wageQre: 200000,
        supplyQre: 0,
        contractQre: 0,
        priorYear1Qre: 0,
        priorYear2Qre: 0,
        priorYear3Qre: 0,
      });

      expect(result.totalQre).toBe(200000);
      expect(result.creditRate).toBe(0.06);
      expect(result.grossCredit).toBe(12000);
      expect(result.netCredit).toBe(12000);
    });

    it("should use the 6% rate when any one prior year has no QRE (IRC §41(c)(5)(B)(ii))", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "asc",
        wageQre: 400000,
        supplyQre: 0,
        contractQre: 0,
        // Only one of the three prior years has QRE — the 14% method is NOT available.
        priorYear1Qre: 100000,
        priorYear2Qre: 0,
        priorYear3Qre: 0,
      });

      expect(result.totalQre).toBe(400000);
      expect(result.creditRate).toBe(0.06);
      // 6% of the full current-year QRE, with no base reduction.
      expect(result.averagePriorQre).toBe(0);
      expect(result.baseAmount).toBe(0);
      expect(result.excessQre).toBe(400000);
      expect(result.grossCredit).toBe(24000);
    });

    it("should handle excess QRE floor (cannot go negative)", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "asc",
        wageQre: 100000,
        supplyQre: 0,
        contractQre: 0,
        priorYear1Qre: 500000,
        priorYear2Qre: 500000,
        priorYear3Qre: 500000,
      });

      // Average = 500k, base = 250k, QRE = 100k
      // Excess should be max(0, 100k - 250k) = 0
      expect(result.excessQre).toBe(0);
      expect(result.grossCredit).toBe(0);
    });

    it("should apply §280C reduction when elected", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "asc",
        wageQre: 400000,
        supplyQre: 0,
        contractQre: 0,
        priorYear1Qre: 300000,
        priorYear2Qre: 300000,
        priorYear3Qre: 300000,
        elect280CReduction: true,
      });

      // Base = 150k, excess = 250k, gross = 35k
      expect(result.grossCredit).toBe(35000);
      // 280C = 21% of 35k = 7,350
      expect(result.section280CReduction).toBe(7350);
      // Net = 35k - 7.35k = 27,650
      expect(result.netCredit).toBe(27650);
    });
  });

  describe("Regular Credit", () => {
    it("should calculate regular credit", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "regular",
        wageQre: 500000,
        supplyQre: 100000,
        contractQre: 50000,
        fixedBasePercentage: 0.03,
        currentYearGrossReceipts: 10000000,
        averageBasePeriodGrossReceipts: 8000000,
      });

      // Total QRE = 650,000
      expect(result.totalQre).toBe(650000);
      // Base = max(3% × 8M, 50% × 650k) = max(240k, 325k) = 325,000
      expect(result.baseAmount).toBe(325000);
      // Excess = 650k - 325k = 325,000
      expect(result.excessQre).toBe(325000);
      // Credit = 20% × 325k = 65,000
      expect(result.grossCredit).toBe(65000);
      expect(result.creditRate).toBe(0.20);
    });

    it("should enforce 50% floor on base amount", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "regular",
        wageQre: 1000000,
        supplyQre: 0,
        contractQre: 0,
        fixedBasePercentage: 0.01,
        averageBasePeriodGrossReceipts: 1000000,
      });

      // Fixed-base calc = 1% × 1M = 10k
      // 50% floor = 50% × 1M = 500k
      // Base = max(10k, 500k) = 500k
      expect(result.baseAmount).toBe(500000);
      expect(result.excessQre).toBe(500000);
      expect(result.grossCredit).toBe(100000);
    });

    it("should apply §280C reduction for regular credit", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "regular",
        wageQre: 1000000,
        supplyQre: 0,
        contractQre: 0,
        fixedBasePercentage: 0.03,
        averageBasePeriodGrossReceipts: 5000000,
        elect280CReduction: true,
      });

      // Base = max(150k, 500k) = 500k, excess = 500k, gross = 100k
      expect(result.grossCredit).toBe(100000);
      expect(result.section280CReduction).toBe(21000);
      expect(result.netCredit).toBe(79000);
    });
  });

  describe("generateForm6765Data", () => {
    it("should generate form data for ASC method", () => {
      const study = {
        id: 1, companyId: 1, taxYear: 2025, studyName: "Test",
        status: "draft" as const, calculationMethod: "asc" as const,
        priorYear1Qre: "300000", priorYear2Qre: "250000", priorYear3Qre: "200000",
        fixedBasePercentage: "0", filingDate: null,
      } as any;

      const result = {
        totalQre: 400000, baseAmount: 125000, excessQre: 275000,
        creditRate: 0.14, grossCredit: 38500, section280CReduction: 0,
        netCredit: 38500, averagePriorQre: 250000, effectiveRate: 0.09625,
        breakdown: { wageQre: 300000, supplyQre: 50000, contractQre: 50000 },
      };

      const form = generateForm6765Data(study, result);
      expect(form.formNumber).toBe("6765");
      expect(form.part).toBe("III");
      expect(form.line5_totalQre).toBe(400000);
      expect(form.line9_grossCredit).toBe(38500);
      expect(form.line11_netCredit).toBe(38500);
    });
  });

  describe("Effective rate calculation", () => {
    it("should compute effective rate as credit / total QRE", () => {
      const result = calculateRdTaxCredit({
        calculationMethod: "asc",
        wageQre: 200000,
        supplyQre: 50000,
        contractQre: 50000,
        priorYear1Qre: 200000,
        priorYear2Qre: 200000,
        priorYear3Qre: 200000,
      });

      expect(result.effectiveRate).toBeGreaterThan(0);
      expect(result.effectiveRate).toBeLessThan(1);
      expect(result.effectiveRate).toBeCloseTo(result.netCredit / result.totalQre, 6);
    });
  });
});

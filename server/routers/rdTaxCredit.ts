// appRouter.rdTaxCredit — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { financeProcedure, createAuditLog } from "./_shared";

// ============================================
// R&D TAX CREDIT (IRC SECTION 41)
// ============================================
export const rdTaxCreditRouter = router({
    // Study CRUD
    listStudies: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        taxYear: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getRdTaxCreditStudies(input)),
    getStudy: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getRdStudyWithDetails(input.id)),
    createStudy: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        taxYear: z.number(),
        studyName: z.string().min(1),
        calculationMethod: z.enum(["regular", "asc"]).default("asc"),
        priorYear1Qre: z.string().optional(),
        priorYear2Qre: z.string().optional(),
        priorYear3Qre: z.string().optional(),
        fixedBasePercentage: z.string().optional(),
        currentYearGrossReceipts: z.string().optional(),
        averageBasePeriodGrossReceipts: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createRdTaxCreditStudy({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'rdTaxCreditStudy', result.id, input.studyName);
        return result;
      }),
    updateStudy: financeProcedure
      .input(z.object({
        id: z.number(),
        studyName: z.string().optional(),
        status: z.enum(["draft", "in_progress", "under_review", "filed", "amended"]).optional(),
        calculationMethod: z.enum(["regular", "asc"]).optional(),
        priorYear1Qre: z.string().optional(),
        priorYear2Qre: z.string().optional(),
        priorYear3Qre: z.string().optional(),
        fixedBasePercentage: z.string().optional(),
        currentYearGrossReceipts: z.string().optional(),
        averageBasePeriodGrossReceipts: z.string().optional(),
        filingDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateRdTaxCreditStudy(id, data);
        await createAuditLog(ctx.user.id, 'update', 'rdTaxCreditStudy', id);
        return { success: true };
      }),
    deleteStudy: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRdTaxCreditStudy(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'rdTaxCreditStudy', input.id);
        return { success: true };
      }),

    // Project CRUD
    listProjects: financeProcedure
      .input(z.object({ studyId: z.number() }))
      .query(({ input }) => db.getRdProjects(input.studyId)),
    getProject: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getRdProjectById(input.id)),
    createProject: financeProcedure
      .input(z.object({
        studyId: z.number(),
        projectName: z.string().min(1),
        description: z.string().optional(),
        businessComponent: z.string().optional(),
        technologicalInNature: z.boolean().optional(),
        technologicalNatureNotes: z.string().optional(),
        eliminationOfUncertainty: z.boolean().optional(),
        eliminationOfUncertaintyNotes: z.string().optional(),
        processOfExperimentation: z.boolean().optional(),
        processOfExperimentationNotes: z.string().optional(),
        permittedPurpose: z.boolean().optional(),
        permittedPurposeNotes: z.string().optional(),
        qualifies: z.boolean().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createRdProject(input);
        await createAuditLog(ctx.user.id, 'create', 'rdProject', result.id, input.projectName);
        return result;
      }),
    updateProject: financeProcedure
      .input(z.object({
        id: z.number(),
        projectName: z.string().optional(),
        description: z.string().optional(),
        businessComponent: z.string().optional(),
        technologicalInNature: z.boolean().optional(),
        technologicalNatureNotes: z.string().optional(),
        eliminationOfUncertainty: z.boolean().optional(),
        eliminationOfUncertaintyNotes: z.string().optional(),
        processOfExperimentation: z.boolean().optional(),
        processOfExperimentationNotes: z.string().optional(),
        permittedPurpose: z.boolean().optional(),
        permittedPurposeNotes: z.string().optional(),
        qualifies: z.boolean().optional(),
        totalProjectQre: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        status: z.enum(["active", "completed", "excluded"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateRdProject(id, data);
        await createAuditLog(ctx.user.id, 'update', 'rdProject', id);
        return { success: true };
      }),
    deleteProject: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRdProject(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'rdProject', input.id);
        return { success: true };
      }),

    // Expense CRUD
    listExpenses: financeProcedure
      .input(z.object({ studyId: z.number().optional(), projectId: z.number().optional() }))
      .query(({ input }) => {
        if (input.projectId) return db.getRdExpensesByProject(input.projectId);
        if (input.studyId) return db.getRdExpensesByStudy(input.studyId);
        return [];
      }),
    createExpense: financeProcedure
      .input(z.object({
        projectId: z.number(),
        studyId: z.number(),
        category: z.enum(["wages", "supplies", "contract_research", "cloud_computing"]),
        description: z.string().optional(),
        employeeId: z.number().optional(),
        employeeName: z.string().optional(),
        rdPercentage: z.string().optional(),
        grossAmount: z.string(),
        contractResearchRate: z.string().optional(),
        vendorId: z.number().optional(),
        vendorName: z.string().optional(),
        periodStart: z.date().optional(),
        periodEnd: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { computeQualifiedAmount } = await import("../rdTaxCreditService");
        // Verify project belongs to the provided study
        const project = await db.getRdProjectById(input.projectId);
        if (!project || project.studyId !== input.studyId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Project does not belong to the specified study' });
        }
        // Compute qualified amount server-side. Hard-fail on non-numeric input
        // rather than silently coercing to 0/100/65, which would corrupt the
        // stored qualifiedAmount and the aggregated credit.
        const parseAmount = (v: string, field: string): number => {
          // Use Number (not parseFloat) so partially-numeric strings like
          // "1.2xyz" are rejected rather than silently truncated to 1.2.
          const n = Number(v);
          if (v.trim() === '' || !Number.isFinite(n)) throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid numeric value for ${field}` });
          return n;
        };
        const gross = parseAmount(input.grossAmount, 'grossAmount');
        const rdPct = input.rdPercentage != null ? parseAmount(input.rdPercentage, 'rdPercentage') : 100;
        const contractRate = input.contractResearchRate != null ? parseAmount(input.contractResearchRate, 'contractResearchRate') : 65;
        const qualifiedAmount = String(computeQualifiedAmount(input.category, gross, rdPct, contractRate).toFixed(2));
        const result = await db.createRdExpense({ ...input, qualifiedAmount });
        await createAuditLog(ctx.user.id, 'create', 'rdExpense', result.id, input.description || input.category);
        return result;
      }),
    updateExpense: financeProcedure
      .input(z.object({
        id: z.number(),
        category: z.enum(["wages", "supplies", "contract_research", "cloud_computing"]).optional(),
        description: z.string().optional(),
        employeeId: z.number().optional(),
        employeeName: z.string().optional(),
        rdPercentage: z.string().optional(),
        grossAmount: z.string().optional(),
        qualifiedAmount: z.string().optional(),
        contractResearchRate: z.string().optional(),
        vendorId: z.number().optional(),
        vendorName: z.string().optional(),
        periodStart: z.date().optional(),
        periodEnd: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { computeQualifiedAmount } = await import("../rdTaxCreditService");
        const { id, ...data } = input;
        const existing = await db.getRdExpenseById(id);
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Expense not found' });
        }
        // Recompute the qualified amount server-side from the merged row so an
        // edit to category / grossAmount / rdPercentage / contractResearchRate
        // never leaves a stale qualifiedAmount behind (which would corrupt the
        // aggregated QRE and the credit calculation).
        // Validate any client-supplied numeric strings; fall back to the
        // (trusted) stored value when a field isn't being changed.
        const parseAmount = (v: string, field: string): number => {
          // Use Number (not parseFloat) so partially-numeric strings like
          // "1.2xyz" are rejected rather than silently truncated to 1.2.
          const n = Number(v);
          if (v.trim() === '' || !Number.isFinite(n)) throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid numeric value for ${field}` });
          return n;
        };
        const category = data.category ?? (existing.category as "wages" | "supplies" | "contract_research" | "cloud_computing");
        const gross = data.grossAmount != null ? parseAmount(data.grossAmount, 'grossAmount') : (parseFloat(existing.grossAmount ?? "0") || 0);
        const rdPct = data.rdPercentage != null ? parseAmount(data.rdPercentage, 'rdPercentage') : (parseFloat(existing.rdPercentage ?? "100") || 100);
        const contractRate = data.contractResearchRate != null ? parseAmount(data.contractResearchRate, 'contractResearchRate') : (parseFloat(existing.contractResearchRate ?? "65") || 65);
        const qualifiedAmount = String(computeQualifiedAmount(category, gross, rdPct, contractRate).toFixed(2));
        await db.updateRdExpense(id, { ...data, qualifiedAmount });
        await createAuditLog(ctx.user.id, 'update', 'rdExpense', id);
        return { success: true };
      }),
    deleteExpense: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRdExpense(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'rdExpense', input.id);
        return { success: true };
      }),

    // Credit Calculation
    calculate: financeProcedure
      .input(z.object({ studyId: z.number(), elect280CReduction: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { calculateRdTaxCredit, aggregateExpensesByCategory } = await import("../rdTaxCreditService");
        const study = await db.getRdStudyWithDetails(input.studyId);
        if (!study) throw new TRPCError({ code: 'NOT_FOUND', message: 'Study not found' });

        // Only include expenses from qualifying projects
        const qualifyingProjectIds = new Set(
          study.projects.filter(p => p.qualifies && p.status !== 'excluded').map(p => p.id)
        );
        const qualifyingExpenses = study.expenses.filter(e => qualifyingProjectIds.has(e.projectId));
        const qreTotals = aggregateExpensesByCategory(qualifyingExpenses);

        const result = calculateRdTaxCredit({
          calculationMethod: study.calculationMethod as "regular" | "asc",
          wageQre: qreTotals.wageQre,
          supplyQre: qreTotals.supplyQre,
          contractQre: qreTotals.contractQre,
          fixedBasePercentage: parseFloat(String(study.fixedBasePercentage)) || 0,
          currentYearGrossReceipts: parseFloat(String(study.currentYearGrossReceipts)) || 0,
          averageBasePeriodGrossReceipts: parseFloat(String(study.averageBasePeriodGrossReceipts)) || 0,
          priorYear1Qre: parseFloat(String(study.priorYear1Qre)) || 0,
          priorYear2Qre: parseFloat(String(study.priorYear2Qre)) || 0,
          priorYear3Qre: parseFloat(String(study.priorYear3Qre)) || 0,
          elect280CReduction: input.elect280CReduction,
        });

        // Save calculated values back to study
        await db.updateRdTaxCreditStudy(input.studyId, {
          totalWageQre: String(result.breakdown.wageQre),
          totalSupplyQre: String(result.breakdown.supplyQre),
          totalContractQre: String(result.breakdown.contractQre),
          totalQre: String(result.totalQre),
          baseAmount: String(result.baseAmount),
          averagePriorQre: String(result.averagePriorQre),
          grossCredit: String(result.grossCredit),
          section280CReduction: String(result.section280CReduction),
          netCredit: String(result.netCredit),
        });

        // Update project QRE totals concurrently in batches
        const expensesByProjectId = new Map<number, typeof qualifyingExpenses>();
        for (const expense of qualifyingExpenses) {
          const existing = expensesByProjectId.get(expense.projectId) ?? [];
          existing.push(expense);
          expensesByProjectId.set(expense.projectId, existing);
        }
        const projectUpdates = study.projects.map((project) => {
          const projectExpenses = expensesByProjectId.get(project.id) ?? [];
          const projectQre = aggregateExpensesByCategory(projectExpenses);
          return { projectId: project.id, totalProjectQre: String(projectQre.totalQre) };
        });
        const batchSize = 10;
        for (let i = 0; i < projectUpdates.length; i += batchSize) {
          await Promise.all(
            projectUpdates.slice(i, i + batchSize).map(({ projectId, totalProjectQre }) =>
              db.updateRdProject(projectId, { totalProjectQre })
            )
          );
        }

        await createAuditLog(ctx.user.id, 'update', 'rdTaxCreditStudy', input.studyId, 'Credit calculated');
        return result;
      }),

    // Generate Form 6765 data
    generateForm: financeProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ input }) => {
        const { generateForm6765Data, calculateRdTaxCredit, aggregateExpensesByCategory } = await import("../rdTaxCreditService");
        const study = await db.getRdStudyWithDetails(input.studyId);
        if (!study) throw new TRPCError({ code: 'NOT_FOUND', message: 'Study not found' });

        const qualifyingProjectIds = new Set(
          study.projects.filter(p => p.qualifies && p.status !== 'excluded').map(p => p.id)
        );
        const qualifyingExpenses = study.expenses.filter(e => qualifyingProjectIds.has(e.projectId));
        const qreTotals = aggregateExpensesByCategory(qualifyingExpenses);

        const storedReduction = parseFloat(String(study.section280CReduction)) || 0;
        const elect280CReduction = storedReduction > 0;

        const result = calculateRdTaxCredit({
          calculationMethod: study.calculationMethod as "regular" | "asc",
          wageQre: qreTotals.wageQre,
          supplyQre: qreTotals.supplyQre,
          contractQre: qreTotals.contractQre,
          fixedBasePercentage: parseFloat(String(study.fixedBasePercentage)) || 0,
          currentYearGrossReceipts: parseFloat(String(study.currentYearGrossReceipts)) || 0,
          averageBasePeriodGrossReceipts: parseFloat(String(study.averageBasePeriodGrossReceipts)) || 0,
          priorYear1Qre: parseFloat(String(study.priorYear1Qre)) || 0,
          priorYear2Qre: parseFloat(String(study.priorYear2Qre)) || 0,
          priorYear3Qre: parseFloat(String(study.priorYear3Qre)) || 0,
          elect280CReduction,
        });

        return {
          form: generateForm6765Data(study, result),
          projects: study.projects.filter(p => p.qualifies && p.status !== 'excluded'),
          expenseCount: qualifyingExpenses.length,
        };
      }),

    // Import expenses from QuickBooks bills
    importFromQuickBooks: financeProcedure
      .input(z.object({
        studyId: z.number(),
        projectId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        category: z.enum(["wages", "supplies", "contract_research", "cloud_computing"]),
        rdPercentage: z.string().default("100"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getQuickBooksBills, refreshQuickBooksToken } = await import("../_core/quickbooks");
        const { computeQualifiedAmount } = await import("../rdTaxCreditService");
        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.accessToken || !token.realmId) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected. Connect in Settings > Integrations.' });
        }

        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) <= new Date()) {
          if (!token.refreshToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks token expired' });
          const refreshResult = await refreshQuickBooksToken(token.refreshToken);
          if (refreshResult.error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: refreshResult.error });
          accessToken = refreshResult.access_token!;
          await db.upsertQuickBooksOAuthToken({
            userId: ctx.user.id,
            accessToken: refreshResult.access_token!,
            refreshToken: refreshResult.refresh_token!,
            realmId: token.realmId,
            expiresAt: new Date(Date.now() + (refreshResult.expires_in || 3600) * 1000),
          });
        }

        const billsResult = await getQuickBooksBills(accessToken, token.realmId, {
          startDate: input.startDate,
          endDate: input.endDate,
        });
        if (billsResult.error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `QuickBooks import failed: ${billsResult.error}` });
        }

        const bills: any[] = billsResult?.data?.QueryResponse?.Bill || [];
        const expensesToCreate: Parameters<typeof db.createRdExpense>[0][] = [];

        for (const bill of bills) {
          const lines = bill.Line || [];
          for (const line of lines) {
            if (line.DetailType === 'AccountBasedExpenseLineDetail' || line.DetailType === 'ItemBasedExpenseLineDetail') {
              const grossAmount = parseFloat(line.Amount) || 0;
              if (grossAmount <= 0) continue;
              const rdPct = parseFloat(input.rdPercentage) || 100;
              const qualified = computeQualifiedAmount(input.category, grossAmount, rdPct);
              expensesToCreate.push({
                projectId: input.projectId,
                studyId: input.studyId,
                category: input.category,
                description: line.Description || `QB Bill #${bill.DocNumber || bill.Id}`,
                grossAmount: String(grossAmount),
                qualifiedAmount: String(qualified.toFixed(2)),
                rdPercentage: String(rdPct),
                vendorName: bill.VendorRef?.name || '',
                periodStart: bill.TxnDate ? new Date(bill.TxnDate) : undefined,
                periodEnd: bill.TxnDate ? new Date(bill.TxnDate) : undefined,
                notes: `Imported from QuickBooks Bill ${bill.DocNumber || bill.Id}`,
              });
            }
          }
        }

        const batchSize = 20;
        for (let i = 0; i < expensesToCreate.length; i += batchSize) {
          await Promise.all(expensesToCreate.slice(i, i + batchSize).map(e => db.createRdExpense(e)));
        }
        const imported = expensesToCreate.length;

        await createAuditLog(ctx.user.id, 'create', 'rdTaxCreditStudy', input.studyId, `Imported ${imported} expenses from QuickBooks`);
        return { imported, totalBills: bills.length };
      }),
  });

// appRouter.banking — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { financeProcedure, resolveRequestScope, assertNonEmptyScope, createAuditLog } from "./_shared";
import { scopeAllows, scopeCompanyIds } from "../_core/scope";
import {
  DEFAULT_AUTO_MATCH_CONFIDENCE,
  candidateWindow,
  directionForAmount,
  manualMatchProblem,
  planAutoMatch,
  rankCandidates,
  signedBankAmount,
  summarizeReconciliation,
} from "../bankReconciliation";

// ============================================
// BANK-TO-PAYMENT RECONCILIATION
// ============================================

type BankLine = NonNullable<Awaited<ReturnType<typeof db.getBankTransactionById>>>;
type ScopeUser = Parameters<typeof resolveRequestScope>[0];

const MAX_SUGGESTIONS_PER_LINE = 5;

async function requestCompanyIds(user: ScopeUser) {
  const scope = assertNonEmptyScope(await resolveRequestScope(user));
  return { scope, companyIds: scopeCompanyIds(scope) };
}

/** A bank line the caller's entity scope may see; anything else is NOT_FOUND. */
async function loadScopedLine(user: ScopeUser, id: number): Promise<BankLine> {
  const { scope } = await requestCompanyIds(user);
  const line = await db.getBankTransactionById(id);
  if (!line || !scopeAllows(scope, line.companyId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bank transaction not found" });
  }
  return line;
}

function lineLabel(line: BankLine): string {
  return (line.counterpartyName || line.description || `Bank line #${line.id}`).slice(0, 255);
}

/** Ranked payment suggestions for one bank line, restricted to the line's own entity when it has one. */
async function suggestionsFor(line: BankLine, scopeIds: number[] | null) {
  const signed = signedBankAmount(line);
  const direction = directionForAmount(signed);
  if (!direction) return [];
  const { from, to } = candidateWindow(line.date);
  const companyIds = line.companyId != null ? [line.companyId] : scopeIds ?? undefined;
  const candidates = await db.getPaymentMatchCandidates({
    amount: Math.abs(signed),
    direction,
    from,
    to,
    companyIds,
    excludeBankTransactionId: line.id,
  });
  return rankCandidates({ amount: signed, date: line.date, description: line.description, counterpartyName: line.counterpartyName }, candidates);
}

function isDuplicateKeyError(e: unknown): boolean {
  const err = e as { code?: string; errno?: number; cause?: { code?: string; errno?: number } } | null;
  return err?.code === "ER_DUP_ENTRY" || err?.errno === 1062 || err?.cause?.code === "ER_DUP_ENTRY" || err?.cause?.errno === 1062;
}

const bankTransactionIdInput = z.number().int().positive();

const reconciliationRouter = router({
  /** Bank lines awaiting reconciliation with ranked payment suggestions (or one line, whatever its status). */
  suggest: financeProcedure
    .input(z.object({
      bankTransactionId: bankTransactionIdInput.optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { companyIds } = await requestCompanyIds(ctx.user);
      const lines = input?.bankTransactionId
        ? [await loadScopedLine(ctx.user, input.bankTransactionId)]
        : await db.getUnreconciledBankTransactions({ companyIds: companyIds ?? undefined, limit: input?.limit ?? 50 });
      return Promise.all(lines.map(async (line) => ({
        ...line,
        signedAmount: signedBankAmount(line),
        suggestions: (await suggestionsFor(line, companyIds)).slice(0, MAX_SUGGESTIONS_PER_LINE),
      })));
    }),

  /** Reconcile a bank line to a payment. Amount (to the cent) and direction must agree. */
  match: financeProcedure
    .input(z.object({ bankTransactionId: bankTransactionIdInput, paymentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const { scope } = await requestCompanyIds(ctx.user);
      const line = await loadScopedLine(ctx.user, input.bankTransactionId);
      const payment = await db.getPaymentById(input.paymentId);
      if (!payment || !scopeAllows(scope, payment.companyId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
      }
      if (line.companyId != null && payment.companyId != null && line.companyId !== payment.companyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment belongs to a different entity than the bank line" });
      }
      const problem = manualMatchProblem({ amount: signedBankAmount(line), date: line.date }, payment);
      if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });

      if (line.reconciliationStatus === "reconciled") {
        if (line.matchedPaymentId === payment.id) return line;
        throw new TRPCError({ code: "CONFLICT", message: `Bank line is already reconciled to payment #${line.matchedPaymentId}; unmatch it first` });
      }
      const elsewhere = (await db.getBankTransactionsMatchedToPayment(payment.id)).filter((t) => t.id !== line.id);
      if (elsewhere.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Payment ${payment.paymentNumber} is already matched to bank line #${elsewhere[0].id}` });
      }

      try {
        await db.setBankTransactionReconciliation(line.id, { matchedPaymentId: payment.id, status: "reconciled", userId: ctx.user.id });
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          throw new TRPCError({ code: "CONFLICT", message: `Payment ${payment.paymentNumber} is already matched to another bank line` });
        }
        throw e;
      }
      await createAuditLog(ctx.user.id, "update", "bank_transaction", line.id, lineLabel(line),
        { reconciliationStatus: line.reconciliationStatus, matchedPaymentId: line.matchedPaymentId ?? null },
        { reconciliationStatus: "reconciled", matchedPaymentId: payment.id });
      return (await db.getBankTransactionById(line.id)) ?? line;
    }),

  /** Undo a match (or an exclusion): the line goes back to unreconciled and the payment is freed. */
  unmatch: financeProcedure
    .input(z.object({ bankTransactionId: bankTransactionIdInput }))
    .mutation(async ({ input, ctx }) => {
      const line = await loadScopedLine(ctx.user, input.bankTransactionId);
      if (line.reconciliationStatus === "unreconciled" && line.matchedPaymentId == null) return line;
      await db.setBankTransactionReconciliation(line.id, { matchedPaymentId: null, status: "unreconciled", userId: ctx.user.id });
      await createAuditLog(ctx.user.id, "update", "bank_transaction", line.id, lineLabel(line),
        { reconciliationStatus: line.reconciliationStatus, matchedPaymentId: line.matchedPaymentId ?? null },
        { reconciliationStatus: "unreconciled", matchedPaymentId: null });
      return (await db.getBankTransactionById(line.id)) ?? line;
    }),

  /** Mark a line as needing no payment (bank fee, internal transfer, …). */
  exclude: financeProcedure
    .input(z.object({ bankTransactionId: bankTransactionIdInput, reason: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const line = await loadScopedLine(ctx.user, input.bankTransactionId);
      if (line.reconciliationStatus === "reconciled") {
        throw new TRPCError({ code: "CONFLICT", message: "Bank line is reconciled to a payment; unmatch it before excluding" });
      }
      const noteLine = `Excluded from reconciliation: ${input.reason}`;
      await db.setBankTransactionReconciliation(line.id, {
        matchedPaymentId: null,
        status: "excluded",
        userId: ctx.user.id,
        notes: line.notes ? `${line.notes}\n${noteLine}` : noteLine,
      });
      await createAuditLog(ctx.user.id, "update", "bank_transaction", line.id, lineLabel(line),
        { reconciliationStatus: line.reconciliationStatus },
        { reconciliationStatus: "excluded", reason: input.reason });
      return (await db.getBankTransactionById(line.id)) ?? line;
    }),

  /**
   * Reconcile every open line that has exactly one suggestion at/above minConfidence (and whose
   * payment no other line claims). Lines with candidates but no safe match are marked "suggested".
   */
  autoMatch: financeProcedure
    .input(z.object({
      minConfidence: z.number().int().min(50).max(100).default(DEFAULT_AUTO_MATCH_CONFIDENCE),
      limit: z.number().int().min(1).max(500).optional(),
    }).optional())
    .mutation(async ({ input, ctx }) => {
      const minConfidence = input?.minConfidence ?? DEFAULT_AUTO_MATCH_CONFIDENCE;
      const { companyIds } = await requestCompanyIds(ctx.user);
      const lines = await db.getUnreconciledBankTransactions({ companyIds: companyIds ?? undefined, limit: input?.limit ?? 200 });
      const withSuggestions = await Promise.all(lines.map(async (line) => ({
        line,
        bankTransactionId: line.id,
        suggestions: await suggestionsFor(line, companyIds),
      })));
      const plan = planAutoMatch(withSuggestions, minConfidence);
      const byId = new Map(withSuggestions.map((l) => [l.bankTransactionId, l.line]));

      const reconciled: Array<{ bankTransactionId: number; paymentId: number; confidence: number }> = [];
      const needsReview = [...plan.needsReview];
      for (const m of plan.matches) {
        const line = byId.get(m.bankTransactionId);
        if (!line) continue;
        try {
          await db.setBankTransactionReconciliation(line.id, { matchedPaymentId: m.paymentId, status: "reconciled", userId: ctx.user.id });
        } catch (e) {
          if (!isDuplicateKeyError(e)) throw e;
          needsReview.push(line.id);
          continue;
        }
        await createAuditLog(ctx.user.id, "update", "bank_transaction", line.id, lineLabel(line),
          { reconciliationStatus: line.reconciliationStatus, matchedPaymentId: null },
          { reconciliationStatus: "reconciled", matchedPaymentId: m.paymentId, autoMatch: true, confidence: m.confidence });
        reconciled.push(m);
      }
      for (const id of needsReview) {
        const line = byId.get(id);
        if (line && line.reconciliationStatus !== "suggested") {
          await db.setBankTransactionReconciliation(id, { matchedPaymentId: null, status: "suggested", userId: ctx.user.id });
        }
      }
      for (const id of plan.noCandidates) {
        const line = byId.get(id);
        if (line?.reconciliationStatus === "suggested") {
          await db.setBankTransactionReconciliation(id, { matchedPaymentId: null, status: "unreconciled", userId: ctx.user.id });
        }
      }
      return {
        scanned: lines.length,
        reconciled: reconciled.length,
        needsReview: needsReview.length,
        noCandidates: plan.noCandidates.length,
        minConfidence,
        matches: reconciled,
      };
    }),

  /** Counts and totals (inflow / outflow) per reconciliation status, within the caller's entities. */
  summary: financeProcedure.query(async ({ ctx }) => {
    const { companyIds } = await requestCompanyIds(ctx.user);
    return summarizeReconciliation(await db.getBankReconciliationSummary({ companyIds: companyIds ?? undefined }));
  }),
});

// ============================================
// MERCURY BANKING INTEGRATION
// ============================================
export const bankingRouter = router({
    // Get all Mercury accounts with balances
    accounts: protectedProcedure.query(async () => {
      const { getMercuryAccounts, isMercuryConfigured } = await import("../mercuryService");
      if (!isMercuryConfigured()) {
        return { accounts: [], configured: false };
      }
      return getMercuryAccounts();
    }),

    // Sync transactions from Mercury
    syncTransactions: protectedProcedure.mutation(async ({ ctx }) => {
      const { getMercuryAccounts, getMercuryTransactions, isMercuryConfigured } = await import("../mercuryService");
      if (!isMercuryConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Mercury banking is not configured. Set MERCURY_API_TOKEN to enable transaction sync.",
        });
      }
      const accounts = await getMercuryAccounts();
      let totalImported = 0;
      let totalSkipped = 0;

      for (const account of (accounts.accounts || []) as any[]) {
        const txns = await getMercuryTransactions(account.id);
        for (const txn of (txns.transactions || []) as any[]) {
          // Check if already imported (dedup by externalId)
          const existing = await db.getBankTransactionByExternalId(txn.id);
          if (existing) { totalSkipped++; continue; }

          await db.createBankTransaction({
            // Lines land under the syncing user's home entity so entity-scoped finance users
            // can reconcile them (a null companyId is visible to global scope only).
            companyId: ctx.user.companyId ?? null,
            externalId: txn.id,
            accountName: account.name,
            accountId: account.id,
            date: new Date(txn.postedDate || txn.createdAt),
            amount: Math.abs(txn.amount).toString(),
            type: txn.amount < 0 ? "debit" : "credit",
            description: txn.bankDescription || txn.note || txn.externalMemo || "",
            counterpartyName: txn.counterpartyName || txn.friendlyDescription || "",
            status: txn.status,
            source: "mercury",
          });
          totalImported++;
        }
      }

      return { totalImported, totalSkipped, accounts: (accounts.accounts as any[])?.length || 0 };
    }),

    // AI auto-categorize all uncategorized transactions
    autoCategorize: protectedProcedure.mutation(async () => {
      const uncategorized = await db.getBankTransactions({ categorizationStatus: "uncategorized" });
      if (uncategorized.length === 0) return { categorized: 0, total: 0 };

      const vendors = await db.getVendors();
      const customers = await db.getCustomers();
      const chartAccounts = await db.getAccounts();
      const allInvoices = await db.getInvoices();

      let categorized = 0;

      // Batch categorize (send multiple transactions at once for efficiency)
      const batchSize = 20;
      for (let i = 0; i < uncategorized.length; i += batchSize) {
        const batch = uncategorized.slice(i, i + batchSize);

        const prompt = `Categorize these bank transactions for Superhumn Inc (a CPG food company).

Known vendors: ${vendors.slice(0, 20).map((v: any) => v.name).join(', ')}
Known customers: ${customers.slice(0, 20).map((c: any) => c.name).join(', ')}
Chart of accounts: ${chartAccounts.slice(0, 30).map((a: any) => `${a.code || a.id}: ${a.name}`).join(', ')}

Transactions to categorize:
${batch.map((t: any, idx: number) => `${idx + 1}. ${t.date} | ${t.type} $${t.amount} | ${t.counterpartyName} | ${t.description}`).join('\n')}

For each transaction, return JSON array:
[{ "index": 1, "category": "category name", "accountCode": "code", "matchedVendor": "name or null", "matchedCustomer": "name or null", "confidence": 85 }]

Categories: Meals & Entertainment, Office Supplies, Software/SaaS, Rent, Utilities, Insurance, Professional Services, Travel, Payroll, COGS - Raw Materials, COGS - Manufacturing, Revenue - Product Sales, Revenue - Services, Bank Fees, Marketing, Shipping & Freight, Equipment, Other

Return JSON array only. No markdown.`;

        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are an expert bookkeeper for a CPG company. Return valid JSON only." },
              { role: "user", content: prompt },
            ],
          });

          const content = result.choices[0]?.message?.content;
          const text = typeof content === "string" ? content : "";
          const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
          const categories = JSON.parse(cleaned);

          for (const cat of categories) {
            const txn = batch[cat.index - 1];
            if (txn && cat.category) {
              // Try to match vendor/customer
              let matchedVendorId: number | null = null;
              let matchedCustomerId: number | null = null;
              let matchedInvoiceId: number | null = null;

              if (cat.matchedVendor) {
                const vendor = vendors.find((v: any) => v.name?.toLowerCase().includes(cat.matchedVendor?.toLowerCase()));
                if (vendor) matchedVendorId = vendor.id;
              }
              if (cat.matchedCustomer) {
                const customer = customers.find((c: any) => c.name?.toLowerCase().includes(cat.matchedCustomer?.toLowerCase()));
                if (customer) matchedCustomerId = customer.id;
              }
              // Try to match invoice by amount
              if (txn.type === "credit") {
                const matchingInvoice = allInvoices.find((inv: any) =>
                  Math.abs(parseFloat(inv.totalAmount) - parseFloat(txn.amount)) < 0.01
                );
                if (matchingInvoice) matchedInvoiceId = matchingInvoice.id;
              }

              await db.updateBankTransaction(txn.id, {
                category: cat.category,
                accountCode: cat.accountCode,
                categorizationStatus: "ai_suggested",
                aiConfidence: cat.confidence || 75,
                matchedVendorId,
                matchedCustomerId,
                matchedInvoiceId,
              });
              categorized++;
            }
          }
        } catch (e) {
          console.warn("[AI Categorize] Batch failed:", e);
        }
      }

      return { categorized, total: uncategorized.length };
    }),

    // Confirm AI categorization (batch approve)
    confirmAll: protectedProcedure.mutation(async () => {
      const suggested = await db.getBankTransactions({ categorizationStatus: "ai_suggested" });
      let confirmed = 0;
      for (const txn of suggested) {
        await db.updateBankTransaction(txn.id, { categorizationStatus: "confirmed" });
        confirmed++;
      }
      return { confirmed };
    }),

    // Confirm a single transaction
    confirmOne: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateBankTransaction(input.id, { categorizationStatus: "confirmed" });
        return { success: true };
      }),

    // Get transaction list for UI
    transactions: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        categorizationStatus: z.string().optional(),
        accountId: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getBankTransactions(input || undefined)),

    // Dashboard: get account balances
    balances: protectedProcedure.query(async () => {
      try {
        const { getMercuryAccounts } = await import("../mercuryService");
        return getMercuryAccounts();
      } catch {
        return { accounts: [] };
      }
    }),

    // Bank-to-payment reconciliation (finance roles, entity-scoped). Not appRouter.reconciliation,
    // which is inventory cycle-count reconciliation.
    reconciliation: reconciliationRouter,
  });

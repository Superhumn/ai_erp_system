// appRouter.banking — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";

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
    syncTransactions: protectedProcedure.mutation(async () => {
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
  });

// appRouter.financialReports — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { assertNonEmptyScope, financeProcedure, resolveRequestScope } from "./_shared";
import {
  arrMovementMetrics,
  cohortHeatmap,
  concentrationMetrics,
  newCustomerCounts,
  recurringMetrics,
  retentionMetrics,
} from "../../shared/cfoMetrics";
import { bucketBillsAging, billOutstanding, billDaysOverdue } from "../billsLogic";
import { parseReportRange, inReportRange, onOrBefore } from "../financialReportRange";

// ============================================
// FINANCIAL REPORTS
// ============================================
export const financialReportsRouter = router({
    // CFO dashboard invoice/ledger/AP metrics, aggregated in SQL instead of shipping whole
    // tables to the browser. Boundaries come from the browser so months follow its calendar.
    cfoMetrics: financeProcedure
      .input(z.object({
        nowMs: z.number(),
        monthStarts: z.array(z.number()).length(14),
        quarterStarts: z.array(z.number()).length(9),
        currentQuarter: z.number().int(),
        newCustomerCutoffMs: z.number(),
      }).refine((w) => [w.monthStarts, w.quarterStarts].every((b) => b.every((x, i) => i === 0 || x > b[i - 1])), {
        message: "Boundaries must be strictly ascending",
      }))
      .query(async ({ input, ctx }) => {
        const scope = assertNonEmptyScope(await resolveRequestScope(ctx.user));
        const agg = await db.getCfoAggregates(scope, input);
        const baseQuarter = input.currentQuarter - 7;
        return {
          // Index 0 is the same month a year ago; 1..12 are the last 12 months, oldest first.
          monthlyRevenue: agg.monthlyRevenue,
          recurring: recurringMetrics(agg.customers, input.nowMs),
          retention: retentionMetrics(agg.customers),
          arrMovement: arrMovementMetrics(agg.customers),
          concentration: concentrationMetrics(agg.customers),
          newCustomers: newCustomerCounts(agg.customers, input.newCustomerCutoffMs),
          cohortHeatmap: cohortHeatmap(
            agg.cohortCells.map((c) => ({ ...c, cohortQ: baseQuarter + c.cohortQ })),
            agg.cohortSizes.map((c) => ({ ...c, cohortQ: baseQuarter + c.cohortQ })),
            input.currentQuarter,
          ),
          arAging: agg.arAging,
          // Last three calendar months, oldest first.
          expenseByMonth: agg.expenseByMonth,
          outstandingAP: agg.outstandingAP,
          hasInvoices: agg.customers.length > 0,
        };
      }),
    generate: financeProcedure
      .input(z.object({
        reportType: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
          try { return await fn(); } catch { return fallback; }
        };

        // Period reports (P&L, revenue/expense breakdowns, tax) cover startDate..endDate inclusive;
        // point-in-time reports (aging) are taken as of endDate (else now). Each source is filtered
        // on its own business date: invoices by issue date, bills by bill date, orders by order date.
        const range = parseReportRange(input.startDate, input.endDate);
        const now = range.asOf;

        const [allInvoices, allBills, accounts, allOrders, customers, vendors, inventory] = await Promise.all([
          safeQuery(() => db.getInvoices(), []),
          safeQuery(() => db.getBills(), []),
          safeQuery(() => db.getAccounts(), []),
          safeQuery(() => db.getOrders(), []),
          safeQuery(() => db.getCustomers(), []),
          safeQuery(() => db.getVendors(), []),
          safeQuery(() => db.getInventory(), []),
        ]);

        const invoices = (allInvoices as any[]).filter((i: any) => inReportRange(range, i.issueDate ?? i.createdAt));
        const bills = (allBills as any[]).filter((b: any) => inReportRange(range, b.billDate ?? b.createdAt));
        const orders = (allOrders as any[]).filter((o: any) => inReportRange(range, o.orderDate ?? o.createdAt));

        const paidInvoices = invoices.filter((i: any) => i.status === 'paid');
        const totalRevenue = paidInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0);
        // `bills` are vendor payables (db.getBills joins vendorName / poNumber); cancelled ones are not expenses.
        const liveBills = bills.filter((b: any) => b.status !== 'cancelled');
        const totalExpenses = liveBills.reduce((s: number, b: any) => s + parseFloat(b.totalAmount || '0'), 0);
        const netIncome = totalRevenue - totalExpenses;

        type ReportRow = {
          label: string;
          amount: number | string | null;
          type: string;
          pct?: string;
          count?: number;
          quantity?: number | null;
          unitCost?: number | null;
          revenue?: number;
          expenses?: number;
          cumulative?: number;
        };

        let title: string;
        let headers: string[];
        let rows: ReportRow[] = [];
        let summary = '';

        switch (input.reportType) {
          case 'profit_loss': {
            title = 'Profit & Loss Statement';
            headers = ['Item', 'Amount'];
            rows = [
              { label: 'Revenue', amount: totalRevenue, type: 'header' },
              ...paidInvoices.slice(0, 10).map((i: any) => ({
                label: `  Invoice #${i.invoiceNumber || i.id}`,
                amount: parseFloat(i.totalAmount || '0'),
                type: 'item',
              })),
              { label: 'Total Revenue', amount: totalRevenue, type: 'total' },
              { label: 'Expenses', amount: null, type: 'header' },
              ...liveBills.slice(0, 10).map((b: any) => ({
                label: `  Bill #${b.billNumber || b.id}${b.vendorName ? ` (${b.vendorName})` : ''}`,
                amount: parseFloat(b.totalAmount || '0'),
                type: 'item',
              })),
              { label: 'Total Expenses', amount: totalExpenses, type: 'total' },
              { label: 'Net Income', amount: netIncome, type: 'grand_total' },
            ];
            summary = `Net income: $${netIncome.toLocaleString()} on revenue of $${totalRevenue.toLocaleString()}`;
            break;
          }
          case 'balance_sheet': {
            // Account balances are point-in-time snapshots (no per-date history), so the sheet
            // is the current position; `now` (= endDate) only stamps the report.
            title = 'Balance Sheet';
            headers = ['Item', 'Amount'];
            const assetAccounts = (accounts as any[]).filter((a: any) => a.type === 'asset');
            const liabilityAccounts = (accounts as any[]).filter((a: any) => a.type === 'liability');
            const equityAccounts = (accounts as any[]).filter((a: any) => a.type === 'equity');
            const totalAssets = assetAccounts.reduce((s: number, a: any) => s + parseFloat(a.balance || '0'), 0);
            const totalLiabilities = liabilityAccounts.reduce((s: number, a: any) => s + parseFloat(a.balance || '0'), 0);
            const totalEquity = equityAccounts.reduce((s: number, a: any) => s + parseFloat(a.balance || '0'), 0);
            rows = [
              { label: 'Assets', amount: null, type: 'header' },
              ...assetAccounts.map((a: any) => ({ label: `  ${a.name}`, amount: parseFloat(a.balance || '0'), type: 'item' })),
              { label: 'Total Assets', amount: totalAssets, type: 'total' },
              { label: 'Liabilities', amount: null, type: 'header' },
              ...liabilityAccounts.map((a: any) => ({ label: `  ${a.name}`, amount: parseFloat(a.balance || '0'), type: 'item' })),
              { label: 'Total Liabilities', amount: totalLiabilities, type: 'total' },
              { label: 'Equity', amount: null, type: 'header' },
              ...equityAccounts.map((a: any) => ({ label: `  ${a.name}`, amount: parseFloat(a.balance || '0'), type: 'item' })),
              { label: 'Total Equity', amount: totalEquity, type: 'total' },
              { label: "Total Liabilities & Equity", amount: totalLiabilities + totalEquity, type: 'grand_total' },
            ];
            summary = `Total assets: $${totalAssets.toLocaleString()}, liabilities: $${totalLiabilities.toLocaleString()}`;
            break;
          }
          case 'accounts_receivable': {
            title = 'Accounts Receivable Aging';
            headers = ['Customer', 'Amount', 'Age (days)'];
            // Aging is as of `now` (endDate): every open invoice issued on or before that date, regardless of startDate.
            const openInvoices = (allInvoices as any[]).filter((i: any) =>
              ['sent', 'overdue', 'partial'].includes(i.status) && onOrBefore(now, i.issueDate ?? i.createdAt));
            rows = openInvoices.map((i: any) => {
              const daysOld = Math.floor((now.getTime() - new Date(i.createdAt || now).getTime()) / 86400000);
              return { label: i.customerName || `Invoice #${i.invoiceNumber}`, amount: parseFloat(i.totalAmount || '0'), type: daysOld > 90 ? 'overdue' : 'item', count: daysOld };
            });
            summary = `${openInvoices.length} open invoices totalling $${openInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0).toLocaleString()}`;
            break;
          }
          case 'accounts_payable': {
            title = 'Accounts Payable Aging';
            headers = ['Vendor / Bill', 'Outstanding', 'Days past due'];
            // Aging is as of `now` (endDate): every open bill dated on or before that date, regardless of startDate.
            const openBills = (allBills as any[]).filter((b: any) =>
              b.status !== 'cancelled' && b.status !== 'paid' && billOutstanding(b) > 0 && onOrBefore(now, b.billDate ?? b.createdAt));
            const aging = bucketBillsAging(openBills, now);
            rows = [
              ...openBills.map((b: any) => {
                const daysOverdue = billDaysOverdue(b, now);
                return {
                  label: `${b.vendorName || `Vendor #${b.vendorId}`} — Bill #${b.billNumber || b.id}`,
                  amount: billOutstanding(b),
                  type: daysOverdue > 90 ? 'overdue' : 'item',
                  count: Math.max(0, daysOverdue),
                };
              }),
              { label: 'Current', amount: aging.current, type: 'total' },
              { label: '1-30 days', amount: aging.days1to30, type: 'total' },
              { label: '31-60 days', amount: aging.days31to60, type: 'total' },
              { label: '61-90 days', amount: aging.days61to90, type: 'total' },
              { label: '90+ days', amount: aging.days90plus, type: 'total' },
              { label: 'Total Outstanding', amount: aging.totalOutstanding, type: 'grand_total' },
            ];
            summary = `${aging.billCount} open bills totalling $${aging.totalOutstanding.toLocaleString()} (${aging.overdueCount} past due)`;
            break;
          }
          case 'revenue_by_customer': {
            title = 'Revenue by Customer';
            headers = ['Customer', 'Revenue', '% of Total'];
            const byCustomer: Record<string, number> = {};
            for (const inv of paidInvoices) {
              const name = inv.customerName || `Customer #${inv.customerId}`;
              byCustomer[name] = (byCustomer[name] || 0) + parseFloat(inv.totalAmount || '0');
            }
            rows = Object.entries(byCustomer)
              .sort(([, a], [, b]) => b - a)
              .map(([name, amount]) => ({
                label: name,
                amount,
                type: 'item',
                pct: totalRevenue > 0 ? `${((amount / totalRevenue) * 100).toFixed(1)}%` : '0%',
              }));
            summary = `${Object.keys(byCustomer).length} customers, total revenue $${totalRevenue.toLocaleString()}`;
            break;
          }
          case 'expense_by_vendor': {
            title = 'Expenses by Vendor';
            headers = ['Vendor', 'Amount', '% of Total'];
            const byVendor: Record<string, number> = {};
            for (const bill of liveBills) {
              const name = bill.vendorName || `Vendor #${bill.vendorId}`;
              byVendor[name] = (byVendor[name] || 0) + parseFloat(bill.totalAmount || '0');
            }
            rows = Object.entries(byVendor)
              .sort(([, a], [, b]) => b - a)
              .map(([name, amount]) => ({
                label: name,
                amount,
                type: 'item',
                pct: totalExpenses > 0 ? `${((amount / totalExpenses) * 100).toFixed(1)}%` : '0%',
              }));
            summary = `${Object.keys(byVendor).length} vendors, total spend $${totalExpenses.toLocaleString()}`;
            break;
          }
          case 'tax_summary': {
            title = 'Tax Summary';
            headers = ['Item', 'Amount'];
            const totalTax = paidInvoices.reduce((s: number, i: any) => s + parseFloat(i.taxAmount || '0'), 0);
            rows = [
              { label: 'Gross Revenue', amount: totalRevenue, type: 'item' },
              { label: 'Total Tax Collected', amount: totalTax, type: 'item' },
              { label: 'Net Revenue (ex-tax)', amount: totalRevenue - totalTax, type: 'total' },
              { label: 'Deductible Expenses', amount: totalExpenses, type: 'item' },
              { label: 'Estimated Taxable Income', amount: netIncome, type: 'grand_total' },
            ];
            summary = `Estimated taxable income: $${netIncome.toLocaleString()}`;
            break;
          }
          default: {
            title = 'Monthly Financial Summary';
            headers = ['Metric', 'Value'];
            rows = [
              { label: 'Total Revenue', amount: totalRevenue, type: 'item' },
              { label: 'Total Expenses', amount: totalExpenses, type: 'item' },
              { label: 'Net Income', amount: netIncome, type: 'total' },
              { label: 'Open Orders', amount: orders.length, type: 'item' },
              { label: 'Active Customers', amount: (customers as any[]).length, type: 'item' },
              { label: 'Active Vendors', amount: (vendors as any[]).length, type: 'item' },
              { label: 'Inventory SKUs', amount: (inventory as any[]).length, type: 'item' },
            ];
            summary = `Revenue $${totalRevenue.toLocaleString()}, expenses $${totalExpenses.toLocaleString()}, net $${netIncome.toLocaleString()}`;
          }
        }

        return { title, headers, rows, generatedAt: new Date().toISOString(), summary };
      }),

    aiAnalysis: financeProcedure
      .input(z.object({
        reportType: z.string(),
        reportData: z.string(),
        strategyId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const prompt = input.reportType === 'cfo_strategy'
          ? `As a CFO advisor, analyze this financial strategy scenario and provide actionable recommendations:\n\n${input.reportData}`
          : `As a financial analyst, review this ${input.reportType.replace(/_/g, ' ')} report and provide key insights, trends, risks, and recommendations:\n\n${input.reportData}`;

        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a senior CFO and financial analyst. Provide concise, data-driven financial insights and specific action items.' },
            { role: 'user', content: prompt },
          ],
        });
        const analysis = response.choices?.[0]?.message?.content;
        return { analysis: typeof analysis === 'string' ? analysis : 'Analysis unavailable at this time.' };
      }),
  });

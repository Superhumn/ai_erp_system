// appRouter.financialReports — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { financeProcedure } from "./_shared";

// ============================================
// FINANCIAL REPORTS
// ============================================
export const financialReportsRouter = router({
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

        const now = new Date();
        const startDate = input.startDate ? new Date(input.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = input.endDate ? new Date(input.endDate) : now;

        const [invoices, bills, accounts, orders, customers, vendors, inventory] = await Promise.all([
          safeQuery(() => db.getInvoices(), []),
          safeQuery(() => db.getBills(), []),
          safeQuery(() => db.getAccounts(), []),
          safeQuery(() => db.getOrders(), []),
          safeQuery(() => db.getCustomers(), []),
          safeQuery(() => db.getVendors(), []),
          safeQuery(() => db.getInventory(), []),
        ]);

        const paidInvoices = (invoices as any[]).filter((i: any) => i.status === 'paid');
        const totalRevenue = paidInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0);
        const totalExpenses = (bills as any[]).reduce((s: number, b: any) => s + parseFloat(b.totalAmount || '0'), 0);
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
              ...(bills as any[]).slice(0, 10).map((b: any) => ({
                label: `  Bill #${b.billNumber || b.id}`,
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
            const openInvoices = (invoices as any[]).filter((i: any) => ['sent', 'overdue', 'partial'].includes(i.status));
            rows = openInvoices.map((i: any) => {
              const daysOld = Math.floor((now.getTime() - new Date(i.createdAt || now).getTime()) / 86400000);
              return { label: i.customerName || `Invoice #${i.invoiceNumber}`, amount: parseFloat(i.totalAmount || '0'), type: daysOld > 90 ? 'overdue' : 'item', count: daysOld };
            });
            summary = `${openInvoices.length} open invoices totalling $${openInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0).toLocaleString()}`;
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
            for (const bill of bills as any[]) {
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
              { label: 'Open Orders', amount: (orders as any[]).length, type: 'item' },
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

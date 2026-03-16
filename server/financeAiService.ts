/**
 * Finance AI Service
 * AI-powered financial anomaly detection, revenue forecasting,
 * cash flow prediction, and transaction classification
 */
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const AnomalyResultSchema = z.object({
  anomalies: z.array(z.object({
    transactionId: z.number().optional().nullable(),
    invoiceId: z.number().optional().nullable(),
    type: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    description: z.string(),
    amount: z.number().optional().nullable(),
    expectedRange: z.object({
      low: z.number(),
      high: z.number(),
    }).optional().nullable(),
    recommendation: z.string(),
  })),
  summary: z.string(),
  riskScore: z.number().min(0).max(100),
});

const RevenueForecastSchema = z.object({
  forecasts: z.array(z.object({
    month: z.string(),
    predictedRevenue: z.number(),
    predictedExpenses: z.number(),
    predictedProfit: z.number(),
    confidence: z.number().min(0).max(100),
    drivers: z.array(z.string()),
  })),
  trends: z.array(z.string()),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
});

const CashFlowPredictionSchema = z.object({
  predictions: z.array(z.object({
    week: z.string(),
    expectedInflows: z.number(),
    expectedOutflows: z.number(),
    netCashFlow: z.number(),
    cumulativeBalance: z.number(),
    confidence: z.number().min(0).max(100),
  })),
  alerts: z.array(z.object({
    type: z.enum(["shortfall", "surplus", "timing"]),
    description: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    suggestedAction: z.string(),
  })),
});

const TransactionClassificationSchema = z.object({
  classifications: z.array(z.object({
    transactionId: z.number(),
    suggestedCategory: z.string(),
    suggestedAccount: z.string(),
    confidence: z.number().min(0).max(100),
    reasoning: z.string(),
  })),
});

// ============================================
// TYPES
// ============================================

export type AnomalyResult = z.infer<typeof AnomalyResultSchema>;
export type RevenueForecast = z.infer<typeof RevenueForecastSchema>;
export type CashFlowPrediction = z.infer<typeof CashFlowPredictionSchema>;
export type TransactionClassification = z.infer<typeof TransactionClassificationSchema>;

// ============================================
// ANOMALY DETECTION
// ============================================

export async function detectFinancialAnomalies(params?: {
  companyId?: number;
  lookbackDays?: number;
}): Promise<AnomalyResult> {
  const lookbackDays = params?.lookbackDays || 90;

  // Gather recent transaction data
  const transactions = await db.getTransactions({ companyId: params?.companyId });
  const recentTransactions = transactions.filter(t => {
    const txDate = t.date ? new Date(t.date) : null;
    if (!txDate) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    return txDate >= cutoff;
  });

  // Gather invoice data for cross-reference
  const invoices = await db.getInvoices({ companyId: params?.companyId });
  const recentInvoices = invoices.filter(inv => {
    const invDate = inv.issueDate ? new Date(inv.issueDate) : null;
    if (!invDate) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    return invDate >= cutoff;
  });

  // Gather payments
  const payments = await db.getPayments({ companyId: params?.companyId });

  const prompt = `Analyze these financial records for anomalies, fraud indicators, and unusual patterns.

TRANSACTIONS (last ${lookbackDays} days): ${recentTransactions.length} records
${recentTransactions.slice(0, 50).map(t => `- ID:${t.id} Type:${t.type} Amount:$${t.totalAmount || 0} Date:${t.date} Status:${t.status} Ref:${t.reference || 'N/A'}`).join("\n")}

INVOICES (last ${lookbackDays} days): ${recentInvoices.length} records
${recentInvoices.slice(0, 50).map(i => `- ID:${i.id} #${i.invoiceNumber} Amount:$${i.totalAmount || 0} Status:${i.status} Due:${i.dueDate}`).join("\n")}

PAYMENTS: ${payments.length} records
${payments.slice(0, 30).map(p => `- ID:${p.id} Amount:$${p.amount || 0} Method:${p.paymentMethod} Status:${p.status} Date:${p.paymentDate}`).join("\n")}

Look for:
1. Unusual transaction amounts (statistical outliers)
2. Duplicate or near-duplicate transactions
3. Suspicious timing patterns
4. Invoices without corresponding payments or vice versa
5. Round-number transactions that may indicate estimation rather than actual figures
6. Unusual vendor payment patterns

Respond ONLY with valid JSON matching this schema:
{
  "anomalies": [{ "transactionId": number|null, "invoiceId": number|null, "type": string, "severity": "low"|"medium"|"high"|"critical", "description": string, "amount": number|null, "expectedRange": {"low": number, "high": number}|null, "recommendation": string }],
  "summary": string,
  "riskScore": number (0-100)
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert forensic accountant and financial auditor. Analyze financial data for anomalies and irregularities. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = AnomalyResultSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Finance anomaly detection LLM failed:", e);
  }

  // Fallback: basic rule-based anomaly detection
  const amounts = recentTransactions.map(t => parseFloat(String(t.totalAmount || 0)));
  const avg = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const stdDev = amounts.length > 0 ? Math.sqrt(amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / amounts.length) : 0;

  const anomalies: AnomalyResult["anomalies"] = [];
  for (const t of recentTransactions) {
    const amount = parseFloat(String(t.totalAmount || 0));
    if (Math.abs(amount - avg) > 3 * stdDev && stdDev > 0) {
      anomalies.push({
        transactionId: t.id,
        invoiceId: null,
        type: "statistical_outlier",
        severity: Math.abs(amount - avg) > 4 * stdDev ? "high" : "medium",
        description: `Transaction amount $${amount.toFixed(2)} is ${((amount - avg) / stdDev).toFixed(1)} standard deviations from mean`,
        amount,
        expectedRange: { low: avg - 2 * stdDev, high: avg + 2 * stdDev },
        recommendation: "Review transaction for accuracy",
      });
    }
  }

  return {
    anomalies,
    summary: `Analyzed ${recentTransactions.length} transactions. Found ${anomalies.length} statistical outliers.`,
    riskScore: Math.min(anomalies.length * 15, 100),
  };
}

// ============================================
// REVENUE FORECASTING
// ============================================

export async function forecastRevenue(params?: {
  companyId?: number;
  forecastMonths?: number;
  historyMonths?: number;
}): Promise<RevenueForecast> {
  const forecastMonths = params?.forecastMonths || 6;
  const historyMonths = params?.historyMonths || 12;

  // Gather historical data
  const invoices = await db.getInvoices({ companyId: params?.companyId });
  const transactions = await db.getTransactions({ companyId: params?.companyId });
  const orders = await db.getOrders();

  // Aggregate by month
  const monthlyRevenue: Record<string, number> = {};
  const monthlyExpenses: Record<string, number> = {};

  for (const inv of invoices) {
    if (!inv.issueDate) continue;
    const month = new Date(inv.issueDate).toISOString().slice(0, 7);
    const amount = parseFloat(String(inv.totalAmount || 0));
    if (inv.type === "payable") {
      monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amount;
    } else {
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + amount;
    }
  }

  for (const t of transactions) {
    if (!t.date) continue;
    const month = new Date(t.date).toISOString().slice(0, 7);
    const amount = parseFloat(String(t.totalAmount || 0));
    if (t.type === "expense" || t.type === "purchase") {
      monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amount;
    } else if (t.type === "sale" || t.type === "revenue") {
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + amount;
    }
  }

  const prompt = `Analyze this financial history and forecast revenue, expenses, and profit for the next ${forecastMonths} months.

MONTHLY REVENUE (last ${historyMonths} months):
${Object.entries(monthlyRevenue).sort().slice(-historyMonths).map(([m, v]) => `${m}: $${v.toFixed(2)}`).join("\n") || "No data"}

MONTHLY EXPENSES (last ${historyMonths} months):
${Object.entries(monthlyExpenses).sort().slice(-historyMonths).map(([m, v]) => `${m}: $${v.toFixed(2)}`).join("\n") || "No data"}

ACTIVE ORDERS: ${orders.length}
ORDER PIPELINE VALUE: $${orders.reduce((s, o) => s + parseFloat(String(o.totalAmount || 0)), 0).toFixed(2)}

Today's date: ${new Date().toISOString().slice(0, 10)}

Provide forecasts for the next ${forecastMonths} months starting from next month.

Respond ONLY with valid JSON:
{
  "forecasts": [{ "month": "YYYY-MM", "predictedRevenue": number, "predictedExpenses": number, "predictedProfit": number, "confidence": number (0-100), "drivers": ["string"] }],
  "trends": ["string array of observed trends"],
  "risks": ["string array of financial risks"],
  "opportunities": ["string array of growth opportunities"]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert financial analyst. Analyze historical financial data and provide accurate revenue forecasts. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = RevenueForecastSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Revenue forecasting LLM failed:", e);
  }

  // Fallback: simple linear projection
  const revenueValues = Object.entries(monthlyRevenue).sort().slice(-6).map(([, v]) => v);
  const avgRevenue = revenueValues.length > 0 ? revenueValues.reduce((a, b) => a + b, 0) / revenueValues.length : 0;
  const expenseValues = Object.entries(monthlyExpenses).sort().slice(-6).map(([, v]) => v);
  const avgExpenses = expenseValues.length > 0 ? expenseValues.reduce((a, b) => a + b, 0) / expenseValues.length : 0;

  const forecasts: RevenueForecast["forecasts"] = [];
  const now = new Date();
  for (let i = 1; i <= forecastMonths; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    forecasts.push({
      month: date.toISOString().slice(0, 7),
      predictedRevenue: Math.round(avgRevenue * 100) / 100,
      predictedExpenses: Math.round(avgExpenses * 100) / 100,
      predictedProfit: Math.round((avgRevenue - avgExpenses) * 100) / 100,
      confidence: Math.max(30, 70 - i * 5),
      drivers: ["Historical average projection"],
    });
  }

  return {
    forecasts,
    trends: revenueValues.length > 1 ? [`${revenueValues[revenueValues.length - 1] > revenueValues[0] ? "Upward" : "Downward"} revenue trend observed`] : ["Insufficient data for trend analysis"],
    risks: ["Limited historical data for accurate forecasting"],
    opportunities: ["Expand data collection for better predictions"],
  };
}

// ============================================
// CASH FLOW PREDICTION
// ============================================

export async function predictCashFlow(params?: {
  companyId?: number;
  weeksAhead?: number;
}): Promise<CashFlowPrediction> {
  const weeksAhead = params?.weeksAhead || 8;

  const invoices = await db.getInvoices({ companyId: params?.companyId });
  const payments = await db.getPayments({ companyId: params?.companyId });
  const purchaseOrders = await db.getPurchaseOrders({ companyId: params?.companyId });

  // Compute pending receivables and payables
  const pendingReceivables = invoices.filter(i => i.type !== "payable" && (i.status === "sent" || i.status === "overdue"));
  const pendingPayables = invoices.filter(i => i.type === "payable" && (i.status === "sent" || i.status === "pending" || i.status === "overdue"));
  const openPOs = purchaseOrders.filter(po => po.status === "approved" || po.status === "sent");

  const prompt = `Predict weekly cash flow for the next ${weeksAhead} weeks based on this data.

PENDING RECEIVABLES: ${pendingReceivables.length} invoices totaling $${pendingReceivables.reduce((s, i) => s + parseFloat(String(i.totalAmount || 0)), 0).toFixed(2)}
${pendingReceivables.slice(0, 20).map(i => `- #${i.invoiceNumber}: $${i.totalAmount} due ${i.dueDate} (${i.status})`).join("\n")}

PENDING PAYABLES: ${pendingPayables.length} invoices totaling $${pendingPayables.reduce((s, i) => s + parseFloat(String(i.totalAmount || 0)), 0).toFixed(2)}
${pendingPayables.slice(0, 20).map(i => `- #${i.invoiceNumber}: $${i.totalAmount} due ${i.dueDate} (${i.status})`).join("\n")}

OPEN PURCHASE ORDERS: ${openPOs.length} totaling $${openPOs.reduce((s, po) => s + parseFloat(String(po.totalAmount || 0)), 0).toFixed(2)}

RECENT PAYMENT HISTORY: ${payments.length} payments
${payments.slice(0, 20).map(p => `- $${p.amount} via ${p.paymentMethod} on ${p.paymentDate} (${p.status})`).join("\n")}

Today: ${new Date().toISOString().slice(0, 10)}

Respond ONLY with valid JSON:
{
  "predictions": [{ "week": "YYYY-MM-DD", "expectedInflows": number, "expectedOutflows": number, "netCashFlow": number, "cumulativeBalance": number, "confidence": number }],
  "alerts": [{ "type": "shortfall"|"surplus"|"timing", "description": string, "severity": "low"|"medium"|"high", "suggestedAction": string }]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a treasury and cash management expert. Predict cash flows and identify potential shortfalls. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = CashFlowPredictionSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Cash flow prediction LLM failed:", e);
  }

  // Fallback
  const totalReceivables = pendingReceivables.reduce((s, i) => s + parseFloat(String(i.totalAmount || 0)), 0);
  const totalPayables = pendingPayables.reduce((s, i) => s + parseFloat(String(i.totalAmount || 0)), 0);
  const weeklyInflow = totalReceivables / Math.max(weeksAhead, 1);
  const weeklyOutflow = totalPayables / Math.max(weeksAhead, 1);

  const predictions: CashFlowPrediction["predictions"] = [];
  let cumulative = 0;
  for (let i = 0; i < weeksAhead; i++) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() + i * 7);
    const net = weeklyInflow - weeklyOutflow;
    cumulative += net;
    predictions.push({
      week: weekStart.toISOString().slice(0, 10),
      expectedInflows: Math.round(weeklyInflow * 100) / 100,
      expectedOutflows: Math.round(weeklyOutflow * 100) / 100,
      netCashFlow: Math.round(net * 100) / 100,
      cumulativeBalance: Math.round(cumulative * 100) / 100,
      confidence: Math.max(20, 60 - i * 5),
    });
  }

  return {
    predictions,
    alerts: cumulative < 0 ? [{
      type: "shortfall",
      description: `Projected cumulative cash shortfall of $${Math.abs(cumulative).toFixed(2)} over ${weeksAhead} weeks`,
      severity: "high",
      suggestedAction: "Accelerate receivables collection or arrange credit facility",
    }] : [],
  };
}

// ============================================
// SMART TRANSACTION CLASSIFICATION
// ============================================

export async function classifyTransactions(params: {
  transactionIds: number[];
}): Promise<TransactionClassification> {
  const allTransactions = await db.getTransactions();
  const targetTransactions = allTransactions.filter(t => params.transactionIds.includes(t.id));
  const accounts = await db.getAccounts();

  if (targetTransactions.length === 0) {
    return { classifications: [] };
  }

  const prompt = `Classify these transactions into appropriate accounting categories and suggest GL accounts.

CHART OF ACCOUNTS:
${accounts.slice(0, 30).map(a => `- ${a.code}: ${a.name} (${a.type})`).join("\n")}

TRANSACTIONS TO CLASSIFY:
${targetTransactions.map(t => `- ID:${t.id} Ref:"${t.reference || 'N/A'}" Amount:$${t.totalAmount || 0} Type:${t.type} Description:"${t.description || 'N/A'}"`).join("\n")}

Respond ONLY with valid JSON:
{
  "classifications": [{ "transactionId": number, "suggestedCategory": string, "suggestedAccount": string (account code), "confidence": number (0-100), "reasoning": string }]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert bookkeeper and accountant. Classify financial transactions accurately. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = TransactionClassificationSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Transaction classification LLM failed:", e);
  }

  return {
    classifications: targetTransactions.map(t => ({
      transactionId: t.id,
      suggestedCategory: t.type || "general",
      suggestedAccount: "0000",
      confidence: 20,
      reasoning: "Automated fallback - manual review recommended",
    })),
  };
}

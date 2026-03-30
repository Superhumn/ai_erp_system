import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import {
  orders,
  invoices,
  payments,
  purchaseOrders,
  workOrders,
  inventory,
  shipments,
  customers,
  vendors,
  products,
  employees,
  supplierPerformance,
  autonomousDecisions,
  workflowRuns,
} from "../drizzle/schema";
import { eq, sql, desc, gte, and, count as drizzleCount } from "drizzle-orm";

// ============================================
// COO EXECUTIVE REASONING ENGINE
// Cross-functional intelligence layer that aggregates
// KPIs, detects risks, identifies bottlenecks, and
// generates strategic recommendations.
// ============================================

export interface ExecutiveKPIs {
  finance: {
    totalRevenue: number;
    outstandingReceivables: number;
    overdueReceivables: number;
    invoiceCount: number;
    overdueInvoiceCount: number;
    paymentCollectionRate: number;
    revenueByStatus: Record<string, { count: number; total: number }>;
  };
  operations: {
    openOrderCount: number;
    pendingOrderValue: number;
    activeWorkOrders: number;
    completedWorkOrders: number;
    workOrderCompletionRate: number;
    avgOrderCycleIndicator: string;
  };
  supplyChain: {
    pendingPOs: number;
    pendingPOValue: number;
    activePOs: number;
    activeShipments: number;
    deliveredShipments: number;
    lowStockItems: number;
    outOfStockItems: number;
    totalInventoryValue: number;
    vendorCount: number;
  };
  sales: {
    totalCustomers: number;
    activeCustomers: number;
    totalProducts: number;
    activeProducts: number;
    pipelineValue: number;
    ordersByStatus: Record<string, number>;
  };
  workforce: {
    totalEmployees: number;
    activeEmployees: number;
    departmentDistribution: Record<string, number>;
  };
  automation: {
    recentWorkflowRuns: number;
    successfulRuns: number;
    failedRuns: number;
    automationSuccessRate: number;
    recentDecisions: number;
  };
  collectedAt: string;
}

export interface StrategicAnalysis {
  executiveSummary: string;
  criticalRisks: Array<{
    area: string;
    risk: string;
    severity: "critical" | "high" | "medium" | "low";
    recommendation: string;
  }>;
  bottlenecks: Array<{
    process: string;
    impact: string;
    rootCause: string;
    suggestedAction: string;
  }>;
  opportunities: Array<{
    area: string;
    opportunity: string;
    estimatedImpact: string;
    priority: "immediate" | "short_term" | "medium_term";
  }>;
  operationalHealth: {
    overall: "excellent" | "good" | "needs_attention" | "critical";
    finance: "green" | "yellow" | "red";
    operations: "green" | "yellow" | "red";
    supplyChain: "green" | "yellow" | "red";
    sales: "green" | "yellow" | "red";
  };
  actionItems: Array<{
    priority: number;
    action: string;
    owner: string;
    department: string;
    deadline: string;
  }>;
  kpis: ExecutiveKPIs;
}

export interface ExecutiveBriefing {
  title: string;
  generatedAt: string;
  analysis: StrategicAnalysis;
  narrativeBriefing: string;
}

/**
 * Collects cross-functional KPIs from all departments.
 * This is the data foundation for executive reasoning.
 */
export async function collectExecutiveKPIs(companyId?: number): Promise<ExecutiveKPIs> {
  const db = await getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Run all queries in parallel for speed
  const [
    revenueByStatus,
    overdueInvoices,
    allPayments,
    ordersByStatus,
    pendingOrderValue,
    workOrderStats,
    poStats,
    shipmentStats,
    inventoryStats,
    customerStats,
    productStats,
    vendorStats,
    employeeStats,
    workflowStats,
    decisionStats,
  ] = await Promise.all([
    // Finance: Revenue by invoice status
    db.select({
      status: invoices.status,
      count: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS DECIMAL)), 0)`,
    }).from(invoices).groupBy(invoices.status).catch(() => []),

    // Finance: Overdue invoices
    db.select({
      count: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS DECIMAL)), 0)`,
    }).from(invoices).where(
      and(eq(invoices.status, "sent"))
    ).catch(() => [{ count: 0, total: 0 }]),

    // Finance: Payment totals
    db.select({
      total: sql<number>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
    }).from(payments).catch(() => [{ total: 0 }]),

    // Sales: Orders by status
    db.select({
      status: orders.status,
      count: sql<number>`COUNT(*)`,
    }).from(orders).groupBy(orders.status).catch(() => []),

    // Sales: Pending order value
    db.select({
      total: sql<number>`COALESCE(SUM(CAST(${orders.totalAmount} AS DECIMAL)), 0)`,
    }).from(orders).where(eq(orders.status, "pending")).catch(() => [{ total: 0 }]),

    // Operations: Work order stats
    db.select({
      status: workOrders.status,
      count: sql<number>`COUNT(*)`,
    }).from(workOrders).groupBy(workOrders.status).catch(() => []),

    // Supply Chain: PO stats
    db.select({
      status: purchaseOrders.status,
      count: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(CAST(${purchaseOrders.totalAmount} AS DECIMAL)), 0)`,
    }).from(purchaseOrders).groupBy(purchaseOrders.status).catch(() => []),

    // Supply Chain: Shipment stats
    db.select({
      status: shipments.status,
      count: sql<number>`COUNT(*)`,
    }).from(shipments).groupBy(shipments.status).catch(() => []),

    // Supply Chain: Inventory health
    db.select({
      totalItems: sql<number>`COUNT(*)`,
      totalValue: sql<number>`COALESCE(SUM(CAST(${inventory.quantity} AS DECIMAL) * CAST(${inventory.unitCost} AS DECIMAL)), 0)`,
      lowStock: sql<number>`SUM(CASE WHEN CAST(${inventory.quantity} AS SIGNED) <= CAST(${inventory.reorderPoint} AS SIGNED) AND CAST(${inventory.quantity} AS SIGNED) > 0 THEN 1 ELSE 0 END)`,
      outOfStock: sql<number>`SUM(CASE WHEN CAST(${inventory.quantity} AS SIGNED) <= 0 THEN 1 ELSE 0 END)`,
    }).from(inventory).catch(() => [{ totalItems: 0, totalValue: 0, lowStock: 0, outOfStock: 0 }]),

    // Sales: Customer stats
    db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${customers.status} = 'active' THEN 1 ELSE 0 END)`,
    }).from(customers).catch(() => [{ total: 0, active: 0 }]),

    // Products
    db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${products.status} = 'active' THEN 1 ELSE 0 END)`,
    }).from(products).catch(() => [{ total: 0, active: 0 }]),

    // Vendors
    db.select({
      count: sql<number>`COUNT(*)`,
    }).from(vendors).catch(() => [{ count: 0 }]),

    // Workforce
    db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${employees.status} = 'active' THEN 1 ELSE 0 END)`,
    }).from(employees).catch(() => [{ total: 0, active: 0 }]),

    // Automation: Recent workflow runs (last 30 days)
    db.select({
      status: workflowRuns.status,
      count: sql<number>`COUNT(*)`,
    }).from(workflowRuns)
      .where(gte(workflowRuns.startedAt, thirtyDaysAgo))
      .groupBy(workflowRuns.status)
      .catch(() => []),

    // Automation: Recent autonomous decisions
    db.select({
      count: sql<number>`COUNT(*)`,
    }).from(autonomousDecisions)
      .where(gte(autonomousDecisions.createdAt, thirtyDaysAgo))
      .catch(() => [{ count: 0 }]),
  ]);

  // Process revenue by status
  const revByStatus: Record<string, { count: number; total: number }> = {};
  let totalRevenue = 0;
  let outstandingReceivables = 0;
  let invoiceCount = 0;
  for (const row of revenueByStatus) {
    revByStatus[row.status] = { count: Number(row.count), total: Number(row.total) };
    totalRevenue += Number(row.total);
    invoiceCount += Number(row.count);
    if (row.status === "sent" || row.status === "overdue") {
      outstandingReceivables += Number(row.total);
    }
  }

  const overdueData = overdueInvoices[0] ?? { count: 0, total: 0 };
  const totalPayments = Number(allPayments[0]?.total ?? 0);
  const collectionRate = totalRevenue > 0 ? (totalPayments / totalRevenue) * 100 : 0;

  // Process orders by status
  const orderStatusMap: Record<string, number> = {};
  let openOrderCount = 0;
  for (const row of ordersByStatus) {
    orderStatusMap[row.status] = Number(row.count);
    if (row.status !== "completed" && row.status !== "cancelled") {
      openOrderCount += Number(row.count);
    }
  }

  // Process work orders
  let activeWO = 0;
  let completedWO = 0;
  let totalWO = 0;
  for (const row of workOrderStats) {
    const c = Number(row.count);
    totalWO += c;
    if (row.status === "in_progress" || row.status === "pending") activeWO += c;
    if (row.status === "completed") completedWO += c;
  }

  // Process PO stats
  let pendingPOs = 0;
  let pendingPOValue = 0;
  let activePOs = 0;
  for (const row of poStats) {
    const c = Number(row.count);
    if (row.status === "pending") { pendingPOs = c; pendingPOValue = Number(row.total); }
    if (row.status === "approved" || row.status === "sent" || row.status === "partial") activePOs += c;
  }

  // Process shipments
  let activeShipments = 0;
  let deliveredShipments = 0;
  for (const row of shipmentStats) {
    if (row.status === "in_transit" || row.status === "pending") activeShipments += Number(row.count);
    if (row.status === "delivered") deliveredShipments += Number(row.count);
  }

  // Process inventory
  const inv = inventoryStats[0] ?? { totalItems: 0, totalValue: 0, lowStock: 0, outOfStock: 0 };

  // Process workforce
  const emp = employeeStats[0] ?? { total: 0, active: 0 };

  // Process automation stats
  let recentRuns = 0;
  let successfulRuns = 0;
  let failedRuns = 0;
  for (const row of workflowStats) {
    const c = Number(row.count);
    recentRuns += c;
    if (row.status === "completed") successfulRuns += c;
    if (row.status === "failed") failedRuns += c;
  }

  return {
    finance: {
      totalRevenue,
      outstandingReceivables,
      overdueReceivables: Number(overdueData.total),
      invoiceCount,
      overdueInvoiceCount: Number(overdueData.count),
      paymentCollectionRate: Math.round(collectionRate * 100) / 100,
      revenueByStatus: revByStatus,
    },
    operations: {
      openOrderCount,
      pendingOrderValue: Number(pendingOrderValue[0]?.total ?? 0),
      activeWorkOrders: activeWO,
      completedWorkOrders: completedWO,
      workOrderCompletionRate: totalWO > 0 ? Math.round((completedWO / totalWO) * 10000) / 100 : 0,
      avgOrderCycleIndicator: openOrderCount > 20 ? "backlogged" : openOrderCount > 10 ? "moderate" : "healthy",
    },
    supplyChain: {
      pendingPOs,
      pendingPOValue,
      activePOs,
      activeShipments,
      deliveredShipments,
      lowStockItems: Number(inv.lowStock),
      outOfStockItems: Number(inv.outOfStock),
      totalInventoryValue: Number(inv.totalValue),
      vendorCount: Number(vendorStats[0]?.count ?? 0),
    },
    sales: {
      totalCustomers: Number(customerStats[0]?.total ?? 0),
      activeCustomers: Number(customerStats[0]?.active ?? 0),
      totalProducts: Number(productStats[0]?.total ?? 0),
      activeProducts: Number(productStats[0]?.active ?? 0),
      pipelineValue: Number(pendingOrderValue[0]?.total ?? 0),
      ordersByStatus: orderStatusMap,
    },
    workforce: {
      totalEmployees: Number(emp.total),
      activeEmployees: Number(emp.active),
      departmentDistribution: {},
    },
    automation: {
      recentWorkflowRuns: recentRuns,
      successfulRuns,
      failedRuns,
      automationSuccessRate: recentRuns > 0 ? Math.round((successfulRuns / recentRuns) * 10000) / 100 : 0,
      recentDecisions: Number(decisionStats[0]?.count ?? 0),
    },
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Generates a full COO-level strategic analysis using LLM reasoning
 * over aggregated cross-functional KPIs.
 */
export async function generateStrategicAnalysis(
  companyId?: number,
  focusArea?: string,
): Promise<StrategicAnalysis> {
  const kpis = await collectExecutiveKPIs(companyId);

  const focusInstruction = focusArea
    ? `\nPay special attention to: ${focusArea}`
    : "";

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are the AI Chief Operating Officer for Superhumn ERP. You provide executive-level strategic analysis based on real-time operational data. Think like a seasoned COO who has run manufacturing, distribution, and supply chain operations.

Your analysis must be:
- Data-driven: Reference specific numbers from the KPIs
- Actionable: Every insight must have a clear next step
- Prioritized: Most critical items first
- Cross-functional: Identify dependencies between departments
- Forward-looking: Anticipate problems before they escalate

Respond ONLY with valid JSON matching this exact structure:
{
  "executiveSummary": "2-3 sentence overview of operational state",
  "criticalRisks": [{ "area": "department", "risk": "description", "severity": "critical|high|medium|low", "recommendation": "what to do" }],
  "bottlenecks": [{ "process": "name", "impact": "business impact", "rootCause": "why", "suggestedAction": "fix" }],
  "opportunities": [{ "area": "department", "opportunity": "description", "estimatedImpact": "quantified if possible", "priority": "immediate|short_term|medium_term" }],
  "operationalHealth": { "overall": "excellent|good|needs_attention|critical", "finance": "green|yellow|red", "operations": "green|yellow|red", "supplyChain": "green|yellow|red", "sales": "green|yellow|red" },
  "actionItems": [{ "priority": 1, "action": "specific action", "owner": "role", "department": "dept", "deadline": "timeframe" }]
}`,
      },
      {
        role: "user",
        content: `Analyze these real-time operational KPIs and provide your COO strategic assessment:${focusInstruction}

${JSON.stringify(kpis, null, 2)}`,
      },
    ],
    maxTokens: 4000,
  });

  const responseText = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : Array.isArray(result.choices[0]?.message?.content)
      ? (result.choices[0].message.content as any[]).filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
      : "";

  let analysis: Omit<StrategicAnalysis, "kpis">;
  try {
    // Extract JSON from potential markdown code fences
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
    analysis = JSON.parse(jsonMatch[1]!.trim());
  } catch {
    analysis = {
      executiveSummary: responseText || "Unable to generate analysis. Review KPIs manually.",
      criticalRisks: [],
      bottlenecks: [],
      opportunities: [],
      operationalHealth: { overall: "needs_attention", finance: "yellow", operations: "yellow", supplyChain: "yellow", sales: "yellow" },
      actionItems: [],
    };
  }

  return { ...analysis, kpis };
}

/**
 * Generates a full executive briefing with narrative summary.
 */
export async function generateExecutiveBriefing(
  companyId?: number,
  focusArea?: string,
): Promise<ExecutiveBriefing> {
  const analysis = await generateStrategicAnalysis(companyId, focusArea);

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are the AI COO writing a concise executive briefing for the CEO/leadership team. Write in a direct, professional tone. Use bullet points for clarity. Be specific with numbers. Keep it under 500 words.`,
      },
      {
        role: "user",
        content: `Write an executive briefing based on this strategic analysis:

${JSON.stringify(analysis, null, 2)}

Structure:
1. State of Operations (2-3 sentences)
2. Critical Items Requiring Attention (bullet points)
3. Key Metrics Snapshot (bullet points with numbers)
4. Recommended Priorities This Week (numbered list)
5. Outlook (1-2 sentences)`,
      },
    ],
    maxTokens: 2000,
  });

  const narrative = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : Array.isArray(result.choices[0]?.message?.content)
      ? (result.choices[0].message.content as any[]).filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
      : "Briefing generation failed.";

  return {
    title: `Executive Briefing — ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    generatedAt: new Date().toISOString(),
    analysis,
    narrativeBriefing: narrative,
  };
}

/**
 * Answers a specific strategic question using COO-level reasoning
 * over live operational data.
 */
export async function askExecutiveQuestion(
  question: string,
  companyId?: number,
): Promise<{ answer: string; dataUsed: ExecutiveKPIs; confidence: string }> {
  const kpis = await collectExecutiveKPIs(companyId);

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are the AI COO for Superhumn ERP. Answer the executive's question using the operational data provided. Be specific, cite numbers, and provide actionable recommendations. If the data doesn't fully answer the question, say what additional information would be needed.`,
      },
      {
        role: "user",
        content: `Question: ${question}

Current operational data:
${JSON.stringify(kpis, null, 2)}`,
      },
    ],
    maxTokens: 2000,
  });

  const answer = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : Array.isArray(result.choices[0]?.message?.content)
      ? (result.choices[0].message.content as any[]).filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
      : "Unable to generate answer.";

  return {
    answer,
    dataUsed: kpis,
    confidence: kpis.finance.invoiceCount > 0 || kpis.operations.openOrderCount > 0 ? "high" : "low_data",
  };
}

/**
 * Performs a focused operational deep-dive on a specific department.
 */
export async function departmentDeepDive(
  department: "finance" | "operations" | "supply_chain" | "sales" | "workforce",
  companyId?: number,
): Promise<{ analysis: string; metrics: Record<string, unknown>; recommendations: string[] }> {
  const kpis = await collectExecutiveKPIs(companyId);

  const deptData = department === "supply_chain" ? kpis.supplyChain
    : department === "workforce" ? kpis.workforce
    : kpis[department];

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are the AI COO performing a deep-dive analysis on the ${department} department. Provide detailed analysis with specific metrics, identify issues, and give 3-5 concrete recommendations. Consider cross-functional impacts.`,
      },
      {
        role: "user",
        content: `Perform a deep-dive on ${department}:

Department data:
${JSON.stringify(deptData, null, 2)}

Full operational context:
${JSON.stringify(kpis, null, 2)}`,
      },
    ],
    maxTokens: 2000,
  });

  const analysisText = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : Array.isArray(result.choices[0]?.message?.content)
      ? (result.choices[0].message.content as any[]).filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
      : "Unable to perform deep-dive.";

  return {
    analysis: analysisText,
    metrics: deptData as Record<string, unknown>,
    recommendations: [],
  };
}

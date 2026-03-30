import { invokeLLM, Message } from "./_core/llm";
import * as db from "./db";

// ============================================
// CFO INSIGHT & REASONING ENGINE
// ============================================

export interface CfoAnalysisContext {
  userId: number;
  userName: string;
  companyId?: number;
}

// ============================================
// FINANCIAL DATA GATHERING
// ============================================

async function gatherFinancialContext(): Promise<string> {
  const summary = await db.getCfoFinancialSummary();
  if (!summary) return "No financial data available.";

  const kpiSnapshots = await db.getCfoKpiSnapshots(3);
  const latestKpi = kpiSnapshots[0];

  let context = `## Current Financial Position\n`;
  context += `- Total Revenue (paid invoices): $${Number(summary.invoices.totalRevenue).toLocaleString()}\n`;
  context += `- Outstanding Receivables: $${Number(summary.invoices.totalOutstanding).toLocaleString()}\n`;
  context += `- Overdue Receivables: $${Number(summary.invoices.totalOverdue).toLocaleString()}\n`;
  context += `- Cash Balance: $${Number(summary.accounts.cashBalance).toLocaleString()}\n`;
  context += `- Total Assets: $${Number(summary.accounts.totalAssets).toLocaleString()}\n`;
  context += `- Total Liabilities: $${Number(summary.accounts.totalLiabilities).toLocaleString()}\n`;
  context += `- Payments Received: $${Number(summary.payments.totalPaymentsReceived).toLocaleString()}\n`;
  context += `- Payments Made: $${Number(summary.payments.totalPaymentsMade).toLocaleString()}\n`;
  context += `\n## Order Activity\n`;
  context += `- Total Orders: ${summary.orders.totalOrders} ($${Number(summary.orders.totalOrderValue).toLocaleString()})\n`;
  context += `- Pending Orders: ${summary.orders.pendingOrders}\n`;
  context += `- Purchase Orders: ${summary.purchaseOrders.totalPOs} ($${Number(summary.purchaseOrders.totalPOValue).toLocaleString()})\n`;
  context += `- Pending POs: ${summary.purchaseOrders.pendingPOs}\n`;

  if (latestKpi) {
    context += `\n## Latest KPI Snapshot\n`;
    if (latestKpi.grossMargin) context += `- Gross Margin: ${latestKpi.grossMargin}%\n`;
    if (latestKpi.ebitda) context += `- EBITDA: $${Number(latestKpi.ebitda).toLocaleString()}\n`;
    if (latestKpi.currentRatio) context += `- Current Ratio: ${latestKpi.currentRatio}\n`;
    if (latestKpi.dso) context += `- DSO: ${latestKpi.dso} days\n`;
    if (latestKpi.dpo) context += `- DPO: ${latestKpi.dpo} days\n`;
    if (latestKpi.burnRate) context += `- Burn Rate: $${Number(latestKpi.burnRate).toLocaleString()}/month\n`;
    if (latestKpi.runway) context += `- Runway: ${latestKpi.runway} months\n`;
  }

  return context;
}

// ============================================
// AI-POWERED INSIGHT GENERATION
// ============================================

export async function generateCfoInsights(ctx: CfoAnalysisContext): Promise<any[]> {
  const startTime = Date.now();
  const financialContext = await gatherFinancialContext();

  const messages: Message[] = [
    {
      role: "system",
      content: `You are an expert CFO AI advisor for a growing CPG/food & beverage company. You analyze financial data and generate actionable insights.

Your responses must be valid JSON arrays of insight objects with this structure:
[{
  "category": "cash_flow|profitability|revenue|cost_optimization|risk|working_capital|debt|tax|growth|compliance",
  "severity": "info|warning|critical|opportunity",
  "title": "Brief insight title",
  "summary": "One paragraph executive summary",
  "analysis": "Detailed multi-paragraph analysis with reasoning",
  "recommendation": "Specific actionable recommendation",
  "impact": "Expected business impact if action is taken",
  "impactAmount": 0,
  "confidence": 0.85
}]

Generate 3-5 high-value insights based on the financial data provided. Focus on:
1. Cash flow risks and opportunities
2. Margin optimization
3. Working capital efficiency
4. Revenue growth patterns
5. Cost reduction opportunities

Be specific with numbers. If data is limited, note that and provide insights based on available patterns.`,
    },
    {
      role: "user",
      content: `Analyze the following financial data for our company and generate CFO-level insights:\n\n${financialContext}`,
    },
  ];

  try {
    const result = await invokeLLM({ messages, maxTokens: 4096 });
    const content = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const insights = JSON.parse(jsonMatch[0]);
    const durationMs = Date.now() - startTime;

    // Save insights and reasoning log
    const savedInsights = [];
    for (const insight of insights) {
      const saved = await db.createCfoInsight({
        companyId: ctx.companyId,
        category: insight.category,
        severity: insight.severity,
        title: insight.title,
        summary: insight.summary,
        analysis: insight.analysis,
        recommendation: insight.recommendation,
        impact: insight.impact,
        impactAmount: insight.impactAmount?.toString(),
        confidence: insight.confidence?.toString(),
        dataPoints: JSON.stringify({ financialContext: "aggregated_erp_data" }),
        createdBy: ctx.userId,
      });
      savedInsights.push(saved);
    }

    await db.createCfoReasoningLog({
      companyId: ctx.companyId,
      requestType: "insight_generation",
      prompt: `Generate CFO insights from financial data`,
      reasoning: content,
      conclusion: `Generated ${savedInsights.length} insights`,
      dataSourcesSummary: "invoices, payments, orders, purchase_orders, accounts",
      tokensUsed: result.usage?.total_tokens,
      durationMs,
      requestedBy: ctx.userId,
    });

    return savedInsights;
  } catch (error) {
    console.error("[CFO Insights] Generation failed:", error);
    return [];
  }
}

// ============================================
// AI-POWERED STRATEGY GENERATION
// ============================================

export async function generateCfoStrategy(
  ctx: CfoAnalysisContext,
  params: {
    objective: string;
    category: string;
    timeHorizon: string;
    constraints?: string;
  }
): Promise<any> {
  const startTime = Date.now();
  const financialContext = await gatherFinancialContext();
  const existingStrategies = await db.getCfoStrategies({ status: "active" });

  const messages: Message[] = [
    {
      role: "system",
      content: `You are an expert CFO strategic advisor for a growing CPG/food & beverage company. You develop comprehensive financial strategies with detailed reasoning.

Your response must be valid JSON with this structure:
{
  "title": "Strategy title",
  "objective": "Clear strategic objective",
  "reasoning": "Multi-paragraph detailed reasoning explaining WHY this strategy makes sense given the financial data. Include financial logic, market considerations, and risk-reward analysis.",
  "assumptions": "Key assumptions underlying this strategy",
  "risks": "Identified risks and mitigations",
  "milestones": [{"name": "Milestone name", "target": "Target description", "timeline": "Timeline"}],
  "kpis": [{"metric": "KPI name", "current": "Current value", "target": "Target value", "timeline": "Achievement timeline"}],
  "estimatedImpact": 0,
  "priority": "low|medium|high|critical"
}

Provide deep financial reasoning. Consider:
- Current financial position and trends
- Industry benchmarks for CPG companies
- Cash flow implications
- Risk-adjusted returns
- Opportunity costs
- Implementation feasibility`,
    },
    {
      role: "user",
      content: `Develop a ${params.timeHorizon.replace("_", " ")} financial strategy for: "${params.objective}"

Category: ${params.category.replace("_", " ")}
${params.constraints ? `Constraints: ${params.constraints}` : ""}

Current financial position:
${financialContext}

${existingStrategies.length > 0 ? `\nActive strategies to consider (avoid conflicts):\n${existingStrategies.map(s => `- ${s.title} (${s.category})`).join("\n")}` : ""}`,
    },
  ];

  try {
    const result = await invokeLLM({ messages, maxTokens: 4096 });
    const content = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse strategy response");

    const strategy = JSON.parse(jsonMatch[0]);
    const durationMs = Date.now() - startTime;

    const saved = await db.createCfoStrategy({
      companyId: ctx.companyId,
      title: strategy.title,
      objective: strategy.objective || params.objective,
      timeHorizon: params.timeHorizon as any,
      category: params.category as any,
      reasoning: strategy.reasoning,
      assumptions: strategy.assumptions,
      risks: strategy.risks,
      milestones: JSON.stringify(strategy.milestones || []),
      kpis: JSON.stringify(strategy.kpis || []),
      estimatedImpact: strategy.estimatedImpact?.toString(),
      priority: strategy.priority || "medium",
      createdBy: ctx.userId,
    });

    await db.createCfoReasoningLog({
      companyId: ctx.companyId,
      strategyId: saved.id,
      requestType: "strategy_creation",
      prompt: `Strategy: ${params.objective} (${params.category}, ${params.timeHorizon})`,
      reasoning: content,
      conclusion: strategy.title,
      dataSourcesSummary: "invoices, payments, orders, purchase_orders, accounts, existing_strategies",
      tokensUsed: result.usage?.total_tokens,
      durationMs,
      requestedBy: ctx.userId,
    });

    return saved;
  } catch (error) {
    console.error("[CFO Strategy] Generation failed:", error);
    throw error;
  }
}

// ============================================
// CASH FLOW FORECASTING
// ============================================

export async function generateCashFlowForecast(
  ctx: CfoAnalysisContext,
  params: { months: number; granularity: string; scenarioType?: string }
): Promise<any[]> {
  const startTime = Date.now();
  const financialContext = await gatherFinancialContext();

  const messages: Message[] = [
    {
      role: "system",
      content: `You are an expert CFO AI that generates cash flow forecasts. Based on the financial data, project cash flows for the requested period.

Your response must be a valid JSON array of period projections:
[{
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "projectedInflow": 0,
  "projectedOutflow": 0,
  "projectedNetCash": 0,
  "arCollections": 0,
  "apPayments": 0,
  "payrollExpense": 0,
  "capitalExpenditure": 0,
  "debtService": 0,
  "otherInflows": 0,
  "otherOutflows": 0,
  "assumptions": "Brief assumptions for this period",
  "confidence": 0.85
}]

Use realistic projections based on the data. For ${params.scenarioType || "base"} case:
- Base: Most likely outcome based on trends
- Optimistic: 15-20% better than base on revenue, 5-10% lower costs
- Pessimistic: 15-20% worse on revenue, 10-15% higher costs

Today is ${new Date().toISOString().split("T")[0]}.`,
    },
    {
      role: "user",
      content: `Generate a ${params.months}-month ${params.granularity} cash flow forecast (${params.scenarioType || "base"} scenario).

${financialContext}`,
    },
  ];

  try {
    const result = await invokeLLM({ messages, maxTokens: 4096 });
    const content = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const projections = JSON.parse(jsonMatch[0]);
    const durationMs = Date.now() - startTime;

    const toSave = projections.map((p: any) => ({
      companyId: ctx.companyId,
      periodStart: new Date(p.periodStart),
      periodEnd: new Date(p.periodEnd),
      granularity: params.granularity as any,
      projectedInflow: p.projectedInflow?.toString() || "0",
      projectedOutflow: p.projectedOutflow?.toString() || "0",
      projectedNetCash: p.projectedNetCash?.toString() || "0",
      arCollections: p.arCollections?.toString(),
      apPayments: p.apPayments?.toString(),
      payrollExpense: p.payrollExpense?.toString(),
      capitalExpenditure: p.capitalExpenditure?.toString(),
      debtService: p.debtService?.toString(),
      otherInflows: p.otherInflows?.toString(),
      otherOutflows: p.otherOutflows?.toString(),
      assumptions: p.assumptions,
      scenarioType: (params.scenarioType || "base") as any,
      confidence: p.confidence?.toString(),
      createdBy: ctx.userId,
    }));

    if (toSave.length > 0) {
      await db.createCfoCashFlowProjectionsBatch(toSave);
    }

    await db.createCfoReasoningLog({
      companyId: ctx.companyId,
      requestType: "cash_flow_forecast",
      prompt: `${params.months}-month ${params.granularity} forecast (${params.scenarioType || "base"})`,
      reasoning: content,
      conclusion: `Generated ${projections.length} period projections`,
      dataSourcesSummary: "invoices, payments, orders, purchase_orders, accounts",
      tokensUsed: result.usage?.total_tokens,
      durationMs,
      requestedBy: ctx.userId,
    });

    return projections;
  } catch (error) {
    console.error("[CFO Cash Flow] Forecast failed:", error);
    return [];
  }
}

// ============================================
// SCENARIO ANALYSIS ("WHAT IF")
// ============================================

export async function runScenarioAnalysis(
  ctx: CfoAnalysisContext,
  params: { scenario: string; variables?: Record<string, any> }
): Promise<any> {
  const startTime = Date.now();
  const financialContext = await gatherFinancialContext();

  const messages: Message[] = [
    {
      role: "system",
      content: `You are an expert CFO AI that performs scenario analysis. Given a business scenario, analyze its financial implications with detailed reasoning.

Your response must be valid JSON:
{
  "scenario": "Scenario description",
  "analysis": "Multi-paragraph detailed financial analysis",
  "impacts": [
    {"area": "Area affected", "impact": "Description", "magnitude": "high|medium|low", "timeframe": "When impact occurs"}
  ],
  "financialProjection": {
    "revenueImpact": 0,
    "costImpact": 0,
    "cashFlowImpact": 0,
    "netImpact": 0,
    "paybackPeriod": "X months",
    "roi": "XX%"
  },
  "risks": ["Risk 1", "Risk 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "confidence": 0.75
}`,
    },
    {
      role: "user",
      content: `Analyze this scenario: "${params.scenario}"

${params.variables ? `Variables:\n${JSON.stringify(params.variables, null, 2)}` : ""}

Current financial position:
${financialContext}`,
    },
  ];

  try {
    const result = await invokeLLM({ messages, maxTokens: 4096 });
    const content = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse scenario analysis");

    const analysis = JSON.parse(jsonMatch[0]);
    const durationMs = Date.now() - startTime;

    await db.createCfoReasoningLog({
      companyId: ctx.companyId,
      requestType: "what_if",
      prompt: params.scenario,
      reasoning: content,
      conclusion: JSON.stringify(analysis.financialProjection),
      dataSourcesSummary: "invoices, payments, orders, purchase_orders, accounts",
      tokensUsed: result.usage?.total_tokens,
      durationMs,
      requestedBy: ctx.userId,
    });

    return analysis;
  } catch (error) {
    console.error("[CFO Scenario] Analysis failed:", error);
    throw error;
  }
}

// ============================================
// KPI SNAPSHOT CAPTURE
// ============================================

export async function captureKpiSnapshot(ctx: CfoAnalysisContext): Promise<any> {
  const summary = await db.getCfoFinancialSummary();
  if (!summary) throw new Error("No financial data available");

  const revenue = Number(summary.invoices.totalRevenue) || 0;
  const cashBalance = Number(summary.accounts.cashBalance) || 0;
  const ar = Number(summary.invoices.totalOutstanding) || 0;
  const totalAssets = Number(summary.accounts.totalAssets) || 0;
  const totalLiabilities = Number(summary.accounts.totalLiabilities) || 0;
  const paymentsReceived = Number(summary.payments.totalPaymentsReceived) || 0;
  const paymentsMade = Number(summary.payments.totalPaymentsMade) || 0;

  const currentRatio = totalLiabilities > 0 ? totalAssets / totalLiabilities : 0;
  const burnRate = paymentsMade > 0 ? paymentsMade / 12 : 0;
  const runway = burnRate > 0 ? cashBalance / burnRate : 0;

  const snapshot = await db.createCfoKpiSnapshot({
    companyId: ctx.companyId,
    snapshotDate: new Date(),
    revenue: revenue.toString(),
    cashOnHand: cashBalance.toString(),
    accountsReceivable: ar.toString(),
    currentRatio: currentRatio.toFixed(2),
    burnRate: burnRate.toFixed(2),
    runway: runway.toFixed(2),
  });

  return snapshot;
}

// ============================================
// BOARD REPORT GENERATION
// ============================================

export async function generateBoardReport(ctx: CfoAnalysisContext): Promise<any> {
  const startTime = Date.now();
  const financialContext = await gatherFinancialContext();
  const insights = await db.getCfoInsights({ status: "new" });
  const strategies = await db.getCfoStrategies({ status: "active" });
  const kpis = await db.getCfoKpiSnapshots(3);

  const messages: Message[] = [
    {
      role: "system",
      content: `You are an expert CFO preparing a board-ready financial report. Generate a comprehensive but concise executive financial summary.

Your response must be valid JSON:
{
  "title": "Financial Report - [Period]",
  "executiveSummary": "2-3 paragraph high-level summary for board members",
  "keyMetrics": [{"metric": "Name", "value": "Value", "trend": "up|down|stable", "commentary": "Brief note"}],
  "highlights": ["Positive highlight 1", "Positive highlight 2"],
  "concerns": ["Concern 1 with context", "Concern 2 with context"],
  "strategicRecommendations": ["Recommendation 1", "Recommendation 2"],
  "outlook": "Forward-looking paragraph on financial trajectory"
}`,
    },
    {
      role: "user",
      content: `Generate a board-ready financial report.

${financialContext}

${insights.length > 0 ? `\nActive Insights:\n${insights.slice(0, 5).map(i => `- [${i.severity}] ${i.title}: ${i.summary}`).join("\n")}` : ""}

${strategies.length > 0 ? `\nActive Strategies:\n${strategies.map(s => `- ${s.title} (${s.status}, ${s.priority} priority)`).join("\n")}` : ""}`,
    },
  ];

  try {
    const result = await invokeLLM({ messages, maxTokens: 4096 });
    const content = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse board report");

    const report = JSON.parse(jsonMatch[0]);
    const durationMs = Date.now() - startTime;

    await db.createCfoReasoningLog({
      companyId: ctx.companyId,
      requestType: "board_report",
      prompt: "Generate board-ready financial report",
      reasoning: content,
      conclusion: report.title,
      dataSourcesSummary: "invoices, payments, orders, purchase_orders, accounts, insights, strategies, kpis",
      tokensUsed: result.usage?.total_tokens,
      durationMs,
      requestedBy: ctx.userId,
    });

    return report;
  } catch (error) {
    console.error("[CFO Board Report] Generation failed:", error);
    throw error;
  }
}

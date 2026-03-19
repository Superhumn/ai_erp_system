import { invokeLLM, Tool, Message } from "./_core/llm";
import { getDb } from "./db";
import { sendEmail, formatEmailHtml } from "./_core/email";
import {
  vendors,
  customers,
  products,
  rawMaterials,
  purchaseOrders,
  purchaseOrderItems,
  orders,
  orderItems,
  inventory,
  inventoryTransactions,
  invoices,
  freightRfqs,
  freightQuotes,
  freightBookings,
  freightCarriers,
  shipments,
  workOrders,
  billOfMaterials,
  aiAgentTasks,
  aiAgentLogs,
  sentEmails,
  // FP&A tables
  budgets,
  budgetLineItems,
  financialScenarios,
  cashFlowForecasts,
  rollingForecasts,
  performancePacing,
  inventoryAgingSnapshots,
  cashConversionMetrics,
  marketingSpend,
  channelPerformance,
} from "../drizzle/schema";
import { eq, and, like, desc, sql, gte, lte, or, isNull, isNotNull } from "drizzle-orm";

// ============================================
// AI AGENT SERVICE - Comprehensive ERP Integration
// ============================================

export interface AIAgentContext {
  userId: number;
  userName: string;
  userRole: string;
  companyId?: number;
}

export interface AIAgentResponse {
  message: string;
  actions?: AIAgentAction[];
  data?: Record<string, any>;
  suggestions?: string[];
}

export interface AIAgentAction {
  type: string;
  description: string;
  status: "pending" | "completed" | "failed";
  result?: any;
  error?: string;
}

// ============================================
// TOOL DEFINITIONS FOR AI AGENT
// ============================================

const AI_TOOLS: Tool[] = [
  // Data Analysis Tools
  {
    type: "function",
    function: {
      name: "analyze_data",
      description: "Analyze business data including sales trends, inventory levels, vendor performance, and financial metrics",
      parameters: {
        type: "object",
        properties: {
          dataType: {
            type: "string",
            enum: ["sales", "inventory", "vendors", "customers", "finances", "orders", "procurement", "production", "budgets", "cash_flow", "channels", "marketing"],
            description: "Type of data to analyze",
          },
          timeRange: {
            type: "string",
            enum: ["today", "week", "month", "quarter", "year", "all"],
            description: "Time range for analysis",
          },
          filters: {
            type: "object",
            description: "Optional filters for the analysis",
          },
        },
        required: ["dataType"],
      },
    },
  },
  // Email Tools
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a vendor, customer, or team member",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body content" },
          entityType: {
            type: "string",
            enum: ["vendor", "customer", "employee", "custom"],
            description: "Type of recipient",
          },
          entityId: { type: "number", description: "ID of the vendor/customer/employee" },
        },
        required: ["subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Draft an email without sending it, for user review",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body content" },
          purpose: {
            type: "string",
            enum: ["followup", "rfq", "order_confirmation", "payment_reminder", "introduction", "custom"],
          },
        },
        required: ["subject", "body"],
      },
    },
  },
  // Tracking Tools
  {
    type: "function",
    function: {
      name: "track_items",
      description: "Track inventory items, orders, shipments, or purchase orders",
      parameters: {
        type: "object",
        properties: {
          trackingType: {
            type: "string",
            enum: ["inventory", "order", "shipment", "purchase_order", "work_order"],
            description: "Type of item to track",
          },
          identifier: { type: "string", description: "Item ID, order number, or tracking number" },
          action: {
            type: "string",
            enum: ["status", "history", "location", "details"],
            description: "What information to retrieve",
          },
        },
        required: ["trackingType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_inventory",
      description: "Update inventory levels, add stock, or transfer between warehouses",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
          warehouseId: { type: "number", description: "Warehouse ID" },
          quantity: { type: "number", description: "Quantity to add/remove" },
          action: {
            type: "string",
            enum: ["add", "remove", "transfer", "adjust"],
          },
          reason: { type: "string", description: "Reason for the change" },
          targetWarehouseId: { type: "number", description: "Target warehouse for transfers" },
        },
        required: ["action"],
      },
    },
  },
  // Supplier/Vendor Management Tools
  {
    type: "function",
    function: {
      name: "manage_vendor",
      description: "Create, update, or get information about vendors/suppliers",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "performance"],
            description: "Action to perform",
          },
          vendorId: { type: "number", description: "Vendor ID for update/get operations" },
          data: {
            type: "object",
            description: "Vendor data for create/update operations",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              contactName: { type: "string" },
              category: { type: "string" },
              status: { type: "string" },
            },
          },
          searchQuery: { type: "string", description: "Search query for finding vendors" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_purchase_order",
      description: "Create a new purchase order for a vendor",
      parameters: {
        type: "object",
        properties: {
          vendorId: { type: "number", description: "Vendor ID" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: { type: "number" },
                rawMaterialId: { type: "number" },
                description: { type: "string" },
                quantity: { type: "number" },
                unitPrice: { type: "number" },
              },
            },
            description: "Line items for the PO",
          },
          notes: { type: "string", description: "Notes for the PO" },
          expectedDate: { type: "string", description: "Expected delivery date" },
        },
        required: ["vendorId", "items"],
      },
    },
  },
  // Copacker Management Tools
  {
    type: "function",
    function: {
      name: "manage_copacker",
      description: "Manage co-packers/contract manufacturers - create work orders, track production, manage relationships",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "get", "create_work_order", "track_production", "performance"],
            description: "Action to perform",
          },
          copackerId: { type: "number", description: "Co-packer vendor ID" },
          workOrderData: {
            type: "object",
            description: "Data for creating work orders",
            properties: {
              productId: { type: "number" },
              bomId: { type: "number" },
              quantity: { type: "number" },
              dueDate: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // Customer Management Tools
  {
    type: "function",
    function: {
      name: "manage_customer",
      description: "Create, update, or get information about customers",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "order_history"],
            description: "Action to perform",
          },
          customerId: { type: "number", description: "Customer ID" },
          data: {
            type: "object",
            description: "Customer data for create/update operations",
          },
          searchQuery: { type: "string", description: "Search query" },
        },
        required: ["action"],
      },
    },
  },
  // Order Management Tools
  {
    type: "function",
    function: {
      name: "manage_order",
      description: "Create, update, or track sales orders",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "cancel", "fulfill"],
            description: "Action to perform",
          },
          orderId: { type: "number", description: "Order ID" },
          data: {
            type: "object",
            description: "Order data",
          },
        },
        required: ["action"],
      },
    },
  },
  // Freight/Logistics Tools
  {
    type: "function",
    function: {
      name: "manage_freight",
      description: "Create RFQs, get quotes, book shipments, and track freight",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create_rfq", "get_quotes", "book_shipment", "track", "list_carriers"],
            description: "Action to perform",
          },
          rfqData: {
            type: "object",
            description: "RFQ details",
          },
          bookingId: { type: "number" },
          carrierId: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  // Reporting Tools
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Generate business reports and summaries",
      parameters: {
        type: "object",
        properties: {
          reportType: {
            type: "string",
            enum: ["sales_summary", "inventory_status", "vendor_performance", "customer_analysis", "financial_overview", "production_status", "order_fulfillment", "budget_variance", "cash_flow_summary", "channel_profitability", "pacing_report"],
            description: "Type of report to generate",
          },
          dateRange: {
            type: "object",
            properties: {
              startDate: { type: "string" },
              endDate: { type: "string" },
            },
          },
          format: {
            type: "string",
            enum: ["summary", "detailed", "chart_data"],
          },
        },
        required: ["reportType"],
      },
    },
  },
  // Task Creation Tool
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create an AI agent task for approval and execution",
      parameters: {
        type: "object",
        properties: {
          taskType: {
            type: "string",
            enum: ["generate_po", "send_rfq", "send_email", "update_inventory", "vendor_followup", "create_work_order"],
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
          },
          description: { type: "string" },
          taskData: { type: "object" },
          requiresApproval: { type: "boolean" },
        },
        required: ["taskType", "description", "taskData"],
      },
    },
  },
  // ============================================
  // FP&A TOOLS
  // ============================================
  // Budget Management Tool
  {
    type: "function",
    function: {
      name: "manage_budget",
      description: "View, analyze, and manage budgets including line items, variance analysis, and budget-vs-actual comparisons",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "get", "variance_analysis", "budget_vs_actual", "summary"],
            description: "Action to perform on budgets",
          },
          budgetId: { type: "number", description: "Budget ID for get/analysis operations" },
          fiscalYear: { type: "number", description: "Filter by fiscal year" },
          periodMonth: { type: "number", description: "Specific month (1-12) for analysis" },
        },
        required: ["action"],
      },
    },
  },
  // Scenario Planning Tool
  {
    type: "function",
    function: {
      name: "manage_scenarios",
      description: "View and compare financial scenarios including base, optimistic, pessimistic, and custom projections with P&L outputs",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "get", "compare", "summary"],
            description: "Action to perform on financial scenarios",
          },
          scenarioId: { type: "number", description: "Scenario ID" },
          compareIds: {
            type: "array",
            items: { type: "number" },
            description: "Array of scenario IDs to compare side-by-side",
          },
        },
        required: ["action"],
      },
    },
  },
  // Cash Flow Forecast Tool
  {
    type: "function",
    function: {
      name: "analyze_cash_flow",
      description: "View and analyze cash flow forecasts, cash positions, inflows vs outflows, and cash runway projections",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "get", "current_position", "runway_analysis"],
            description: "Action to perform",
          },
          forecastId: { type: "number", description: "Cash flow forecast ID" },
        },
        required: ["action"],
      },
    },
  },
  // Rolling Forecast Tool
  {
    type: "function",
    function: {
      name: "analyze_rolling_forecast",
      description: "View and analyze rolling P&L forecasts, monthly projections, balance sheet and cash flow trends over the forecast horizon",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "get", "latest", "trend_analysis"],
            description: "Action to perform",
          },
          forecastId: { type: "number", description: "Rolling forecast ID" },
        },
        required: ["action"],
      },
    },
  },
  // Performance Pacing Tool
  {
    type: "function",
    function: {
      name: "analyze_pacing",
      description: "Analyze performance pacing against budget - revenue pacing, expense pacing, EBITDA tracking, and month-end projections",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["current", "history", "by_budget"],
            description: "Action to perform",
          },
          budgetId: { type: "number", description: "Budget ID for pacing analysis" },
          periodMonth: { type: "number", description: "Month (1-12)" },
          periodYear: { type: "number", description: "Year" },
        },
        required: ["action"],
      },
    },
  },
  // Inventory Aging Tool
  {
    type: "function",
    function: {
      name: "analyze_inventory_aging",
      description: "Analyze inventory aging by product - aging buckets (0-30, 31-60, 61-90, 91-120, 121-180, 181+ days), risk levels, days of supply, and write-off exposure",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["latest_snapshot", "by_product", "risk_summary", "trend"],
            description: "Action to perform",
          },
          productId: { type: "number", description: "Product ID for product-specific analysis" },
          riskLevel: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Filter by risk level",
          },
        },
        required: ["action"],
      },
    },
  },
  // Channel Analytics Tool
  {
    type: "function",
    function: {
      name: "analyze_channels",
      description: "Analyze sales channel performance - DTC/Shopify, Amazon, wholesale, retail. View revenue, margins, contribution profit, marketing efficiency (ROAS, CAC) by channel",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["summary", "by_channel", "compare_channels", "marketing_efficiency"],
            description: "Action to perform",
          },
          channel: {
            type: "string",
            enum: ["dtc_shopify", "amazon", "wholesale", "retail", "marketplace_other"],
            description: "Specific channel to analyze",
          },
          periodMonth: { type: "number", description: "Month (1-12)" },
          periodYear: { type: "number", description: "Year" },
        },
        required: ["action"],
      },
    },
  },
  // Cash Conversion Cycle Tool
  {
    type: "function",
    function: {
      name: "analyze_cash_conversion",
      description: "Analyze cash conversion cycle metrics - DSO (days sales outstanding), DIO (days inventory outstanding), DPO (days payable outstanding), and overall CCC trend",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["latest", "trend", "breakdown"],
            description: "Action to perform",
          },
          periodMonth: { type: "number", description: "Month (1-12)" },
          periodYear: { type: "number", description: "Year" },
        },
        required: ["action"],
      },
    },
  },
];

// ============================================
// TOOL EXECUTION FUNCTIONS
// ============================================

async function executeAnalyzeData(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { dataType, timeRange = "month", filters } = params;

  // Calculate date range
  const now = new Date();
  let startDate = new Date();
  switch (timeRange) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      break;
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(now.getMonth() - 1);
      break;
    case "quarter":
      startDate.setMonth(now.getMonth() - 3);
      break;
    case "year":
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate = new Date(0);
  }

  switch (dataType) {
    case "sales": {
      const allOrders = await db.select().from(orders).where(
        timeRange !== "all" ? gte(orders.createdAt, startDate) : undefined
      );
      const totalRevenue = allOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);
      const orderCount = allOrders.length;
      const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

      return {
        summary: `Sales analysis for ${timeRange}`,
        totalRevenue: totalRevenue.toFixed(2),
        orderCount,
        avgOrderValue: avgOrderValue.toFixed(2),
        orders: allOrders.slice(0, 10),
      };
    }

    case "inventory": {
      const allInventory = await db.select().from(inventory);
      const lowStockItems = allInventory.filter(i => parseFloat(i.quantity?.toString() || "0") < 10);
      const totalValue = allInventory.reduce((sum, i) => {
        return sum + (parseFloat(i.quantity?.toString() || "0") * parseFloat(i.unitCost?.toString() || "0"));
      }, 0);

      return {
        summary: "Inventory status analysis",
        totalItems: allInventory.length,
        lowStockCount: lowStockItems.length,
        totalValue: totalValue.toFixed(2),
        lowStockItems: lowStockItems.slice(0, 10),
      };
    }

    case "vendors": {
      const allVendors = await db.select().from(vendors);
      const activeVendors = allVendors.filter(v => v.status === "active");
      const allPOs = await db.select().from(purchaseOrders).where(
        timeRange !== "all" ? gte(purchaseOrders.createdAt, startDate) : undefined
      );

      return {
        summary: "Vendor analysis",
        totalVendors: allVendors.length,
        activeVendors: activeVendors.length,
        poCountInPeriod: allPOs.length,
        vendors: allVendors.slice(0, 10),
      };
    }

    case "customers": {
      const allCustomers = await db.select().from(customers);
      const activeCustomers = allCustomers.filter(c => c.status === "active");
      const allOrders = await db.select().from(orders).where(
        timeRange !== "all" ? gte(orders.createdAt, startDate) : undefined
      );

      return {
        summary: "Customer analysis",
        totalCustomers: allCustomers.length,
        activeCustomers: activeCustomers.length,
        ordersInPeriod: allOrders.length,
        customers: allCustomers.slice(0, 10),
      };
    }

    case "finances": {
      const allInvoices = await db.select().from(invoices).where(
        timeRange !== "all" ? gte(invoices.createdAt, startDate) : undefined
      );
      const paidInvoices = allInvoices.filter(i => i.status === "paid");
      const pendingInvoices = allInvoices.filter(i => i.status === "pending" || i.status === "sent");
      const overdueInvoices = allInvoices.filter(i =>
        (i.status === "pending" || i.status === "sent") &&
        i.dueDate && new Date(i.dueDate) < now
      );

      const totalBilled = allInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);
      const totalPaid = paidInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);
      const totalPending = pendingInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);

      return {
        summary: "Financial analysis",
        totalBilled: totalBilled.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalPending: totalPending.toFixed(2),
        invoiceCount: allInvoices.length,
        overdueCount: overdueInvoices.length,
        overdueAmount: overdueInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0).toFixed(2),
      };
    }

    case "orders": {
      const allOrders = await db.select().from(orders).where(
        timeRange !== "all" ? gte(orders.createdAt, startDate) : undefined
      );
      const pendingOrders = allOrders.filter(o => o.status === "pending");
      const completedOrders = allOrders.filter(o => o.status === "completed" || o.status === "delivered");

      return {
        summary: "Order analysis",
        totalOrders: allOrders.length,
        pendingOrders: pendingOrders.length,
        completedOrders: completedOrders.length,
        orders: allOrders.slice(0, 10),
      };
    }

    case "procurement": {
      const allPOs = await db.select().from(purchaseOrders).where(
        timeRange !== "all" ? gte(purchaseOrders.createdAt, startDate) : undefined
      );
      const pendingPOs = allPOs.filter(po => po.status === "pending" || po.status === "sent");
      const totalSpent = allPOs.reduce((sum, po) => sum + parseFloat(po.totalAmount || "0"), 0);

      return {
        summary: "Procurement analysis",
        totalPOs: allPOs.length,
        pendingPOs: pendingPOs.length,
        totalSpent: totalSpent.toFixed(2),
        purchaseOrders: allPOs.slice(0, 10),
      };
    }

    case "production": {
      const allWorkOrders = await db.select().from(workOrders).where(
        timeRange !== "all" ? gte(workOrders.createdAt, startDate) : undefined
      );
      const inProgressWOs = allWorkOrders.filter(wo => wo.status === "in_progress");
      const completedWOs = allWorkOrders.filter(wo => wo.status === "completed");

      return {
        summary: "Production analysis",
        totalWorkOrders: allWorkOrders.length,
        inProgress: inProgressWOs.length,
        completed: completedWOs.length,
        workOrders: allWorkOrders.slice(0, 10),
      };
    }

    case "budgets": {
      const allBudgets = await db.select().from(budgets);
      const activeBudgets = allBudgets.filter(b => b.status === "active");
      const totalBudgetedRevenue = activeBudgets.reduce((sum, b) => sum + parseFloat(b.totalRevenue || "0"), 0);
      const totalBudgetedExpenses = activeBudgets.reduce((sum, b) => sum + parseFloat(b.totalExpenses || "0"), 0);

      return {
        summary: "Budget analysis",
        totalBudgets: allBudgets.length,
        activeBudgets: activeBudgets.length,
        totalBudgetedRevenue: totalBudgetedRevenue.toFixed(2),
        totalBudgetedExpenses: totalBudgetedExpenses.toFixed(2),
        budgets: allBudgets.slice(0, 10).map(b => ({
          id: b.id, name: b.name, fiscalYear: b.fiscalYear, status: b.status,
          totalRevenue: b.totalRevenue, totalExpenses: b.totalExpenses, targetEbitda: b.targetEbitda,
        })),
      };
    }

    case "cash_flow": {
      const forecasts = await db.select().from(cashFlowForecasts).orderBy(desc(cashFlowForecasts.forecastDate)).limit(5);
      const latest = forecasts[0];

      return {
        summary: "Cash flow analysis",
        totalForecasts: forecasts.length,
        latestForecast: latest ? {
          name: latest.name,
          forecastDate: latest.forecastDate,
          openingBalance: latest.openingCashBalance,
          netCashFlow: latest.projectedNetCashFlow,
          closingBalance: latest.projectedClosingBalance,
          status: latest.status,
        } : null,
        recentForecasts: forecasts.map(f => ({
          id: f.id, name: f.name, status: f.status,
          netCashFlow: f.projectedNetCashFlow, closingBalance: f.projectedClosingBalance,
        })),
      };
    }

    case "channels": {
      const channelData = await db.select().from(channelPerformance);
      const byChannel: Record<string, { revenue: number; profit: number; orders: number }> = {};
      for (const c of channelData) {
        if (!byChannel[c.channel]) byChannel[c.channel] = { revenue: 0, profit: 0, orders: 0 };
        byChannel[c.channel].revenue += parseFloat(c.netRevenue || "0");
        byChannel[c.channel].profit += parseFloat(c.contributionProfit || "0");
        byChannel[c.channel].orders += c.orderCount || 0;
      }

      return {
        summary: "Channel performance analysis",
        channels: Object.entries(byChannel).map(([ch, data]) => ({
          channel: ch,
          netRevenue: data.revenue.toFixed(2),
          contributionProfit: data.profit.toFixed(2),
          margin: data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) + "%" : "0%",
          orderCount: data.orders,
        })),
      };
    }

    case "marketing": {
      const mktgData = await db.select().from(marketingSpend);
      const totalSpend = mktgData.reduce((s, m) => s + parseFloat(m.spend || "0"), 0);
      const totalRevenue = mktgData.reduce((s, m) => s + parseFloat(m.revenue || "0"), 0);
      const totalConversions = mktgData.reduce((s, m) => s + (m.conversions || 0), 0);

      return {
        summary: "Marketing spend analysis",
        totalSpend: totalSpend.toFixed(2),
        totalRevenue: totalRevenue.toFixed(2),
        overallROAS: totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : "N/A",
        totalConversions,
        entries: mktgData.length,
      };
    }

    default:
      throw new Error(`Unknown data type: ${dataType}`);
  }
}

async function executeSendEmail(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let toEmail = params.to;
  let recipientName = "Recipient";

  // Resolve email from entity if provided
  if (params.entityType && params.entityId) {
    switch (params.entityType) {
      case "vendor": {
        const vendor = await db.select().from(vendors).where(eq(vendors.id, params.entityId)).limit(1);
        if (vendor[0]?.email) {
          toEmail = vendor[0].email;
          recipientName = vendor[0].contactName || vendor[0].name || "Vendor";
        }
        break;
      }
      case "customer": {
        const customer = await db.select().from(customers).where(eq(customers.id, params.entityId)).limit(1);
        if (customer[0]?.email) {
          toEmail = customer[0].email;
          recipientName = customer[0].contactName || customer[0].name || "Customer";
        }
        break;
      }
    }
  }

  if (!toEmail) {
    return { success: false, error: "No recipient email provided" };
  }

  const result = await sendEmail({
    to: toEmail,
    subject: params.subject,
    html: formatEmailHtml(params.body),
    text: params.body,
  });

  // Log sent email
  if (result.success) {
    await db.insert(sentEmails).values({
      toEmail,
      toName: recipientName,
      subject: params.subject,
      body: params.body,
      status: "sent",
      sentAt: new Date(),
      sentBy: ctx.userId,
    });
  }

  return {
    success: result.success,
    messageId: result.messageId,
    recipient: toEmail,
    error: result.error,
  };
}

async function executeDraftEmail(params: any, ctx: AIAgentContext): Promise<any> {
  return {
    draft: true,
    to: params.to,
    subject: params.subject,
    body: params.body,
    purpose: params.purpose,
    message: "Email draft created. Please review and send when ready.",
  };
}

async function executeTrackItems(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { trackingType, identifier, action = "status" } = params;

  switch (trackingType) {
    case "inventory": {
      const items = await db.select().from(inventory);
      if (identifier) {
        const filtered = items.filter(i =>
          i.id.toString() === identifier ||
          i.productId?.toString() === identifier
        );
        return { type: "inventory", items: filtered, action };
      }
      return { type: "inventory", totalItems: items.length, items: items.slice(0, 20), action };
    }

    case "order": {
      const allOrders = await db.select().from(orders);
      if (identifier) {
        const order = allOrders.find(o =>
          o.id.toString() === identifier ||
          o.orderNumber === identifier
        );
        if (order) {
          const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          return { type: "order", order, items, action };
        }
      }
      return { type: "orders", totalOrders: allOrders.length, orders: allOrders.slice(0, 20), action };
    }

    case "shipment": {
      const allShipments = await db.select().from(shipments);
      if (identifier) {
        const shipment = allShipments.find(s =>
          s.id.toString() === identifier ||
          s.trackingNumber === identifier
        );
        return { type: "shipment", shipment, action };
      }
      return { type: "shipments", totalShipments: allShipments.length, shipments: allShipments.slice(0, 20), action };
    }

    case "purchase_order": {
      const allPOs = await db.select().from(purchaseOrders);
      if (identifier) {
        const po = allPOs.find(p =>
          p.id.toString() === identifier ||
          p.poNumber === identifier
        );
        if (po) {
          const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
          return { type: "purchase_order", purchaseOrder: po, items, action };
        }
      }
      return { type: "purchase_orders", totalPOs: allPOs.length, purchaseOrders: allPOs.slice(0, 20), action };
    }

    case "work_order": {
      const allWOs = await db.select().from(workOrders);
      if (identifier) {
        const wo = allWOs.find(w =>
          w.id.toString() === identifier ||
          w.workOrderNumber === identifier
        );
        return { type: "work_order", workOrder: wo, action };
      }
      return { type: "work_orders", totalWOs: allWOs.length, workOrders: allWOs.slice(0, 20), action };
    }

    default:
      throw new Error(`Unknown tracking type: ${trackingType}`);
  }
}

async function executeUpdateInventory(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { productId, warehouseId, quantity, action, reason, targetWarehouseId } = params;

  // This creates a task for approval rather than executing directly
  const task = await db.insert(aiAgentTasks).values({
    taskType: "update_inventory",
    status: "pending_approval",
    priority: "medium",
    taskData: JSON.stringify({
      productId,
      warehouseId,
      quantity,
      action,
      reason,
      targetWarehouseId,
    }),
    aiReasoning: `Inventory ${action} requested: ${quantity} units. Reason: ${reason || "No reason provided"}`,
    aiConfidence: "0.85",
    relatedEntityType: "inventory",
    requiresApproval: true,
  }).$returningId();

  return {
    taskCreated: true,
    taskId: task[0].id,
    message: `Inventory ${action} task created and pending approval`,
    details: { productId, warehouseId, quantity, action },
  };
}

async function executeManageVendor(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, vendorId, data, searchQuery } = params;

  switch (action) {
    case "list": {
      const allVendors = await db.select().from(vendors);
      return { vendors: allVendors, total: allVendors.length };
    }

    case "get": {
      if (!vendorId) throw new Error("Vendor ID required");
      const vendor = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);

      // Get vendor's PO history
      const vendorPOs = await db.select().from(purchaseOrders).where(eq(purchaseOrders.vendorId, vendorId));

      return { vendor: vendor[0], purchaseOrders: vendorPOs };
    }

    case "search": {
      const allVendors = await db.select().from(vendors);
      const filtered = allVendors.filter(v =>
        v.name?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        v.email?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        v.contactName?.toLowerCase().includes(searchQuery?.toLowerCase() || "")
      );
      return { vendors: filtered, total: filtered.length, query: searchQuery };
    }

    case "create": {
      if (!data?.name) throw new Error("Vendor name required");
      const newVendor = await db.insert(vendors).values({
        name: data.name,
        email: data.email,
        phone: data.phone,
        contactName: data.contactName,
        category: data.category || "supplier",
        status: data.status || "active",
      }).$returningId();
      return { created: true, vendorId: newVendor[0].id };
    }

    case "update": {
      if (!vendorId) throw new Error("Vendor ID required");
      await db.update(vendors).set(data).where(eq(vendors.id, vendorId));
      return { updated: true, vendorId };
    }

    case "performance": {
      const allVendors = await db.select().from(vendors);
      const allPOs = await db.select().from(purchaseOrders);

      const vendorPerformance = allVendors.map(v => {
        const vendorPOs = allPOs.filter(po => po.vendorId === v.id);
        const totalPOs = vendorPOs.length;
        const totalSpent = vendorPOs.reduce((sum, po) => sum + parseFloat(po.totalAmount || "0"), 0);

        return {
          vendorId: v.id,
          vendorName: v.name,
          totalPOs,
          totalSpent: totalSpent.toFixed(2),
          status: v.status,
        };
      });

      return { performance: vendorPerformance.sort((a, b) => parseFloat(b.totalSpent) - parseFloat(a.totalSpent)) };
    }

    default:
      throw new Error(`Unknown vendor action: ${action}`);
  }
}

async function executeCreatePurchaseOrder(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { vendorId, items, notes, expectedDate } = params;

  // Validate vendor
  const vendor = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor[0]) throw new Error("Vendor not found");

  // Calculate totals
  const subtotal = items.reduce((sum: number, item: any) => {
    return sum + (item.quantity * item.unitPrice);
  }, 0);

  // Generate PO number
  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

  // Create task for approval
  const task = await db.insert(aiAgentTasks).values({
    taskType: "generate_po",
    status: "pending_approval",
    priority: "medium",
    taskData: JSON.stringify({
      vendorId,
      vendorName: vendor[0].name,
      poNumber,
      items,
      subtotal: subtotal.toFixed(2),
      notes,
      expectedDate,
    }),
    aiReasoning: `PO for ${vendor[0].name} with ${items.length} line items totaling $${subtotal.toFixed(2)}`,
    aiConfidence: "0.90",
    relatedEntityType: "purchase_order",
    requiresApproval: true,
  }).$returningId();

  return {
    taskCreated: true,
    taskId: task[0].id,
    poNumber,
    vendorName: vendor[0].name,
    subtotal: subtotal.toFixed(2),
    itemCount: items.length,
    message: "Purchase order task created and pending approval",
  };
}

async function executeManageCopacker(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, copackerId, workOrderData } = params;

  switch (action) {
    case "list": {
      // Copackers are vendors with category = 'copacker' or 'manufacturer'
      const allVendors = await db.select().from(vendors);
      const copackers = allVendors.filter(v =>
        v.category === "copacker" ||
        v.category === "manufacturer" ||
        v.category === "contract_manufacturer"
      );
      return { copackers, total: copackers.length };
    }

    case "get": {
      if (!copackerId) throw new Error("Copacker ID required");
      const copacker = await db.select().from(vendors).where(eq(vendors.id, copackerId)).limit(1);
      const copackerWOs = await db.select().from(workOrders);
      // Filter work orders that might be associated with this copacker
      return { copacker: copacker[0], workOrders: copackerWOs.slice(0, 10) };
    }

    case "create_work_order": {
      if (!workOrderData) throw new Error("Work order data required");

      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_work_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({
          copackerId,
          ...workOrderData,
        }),
        aiReasoning: `Work order for copacker: ${workOrderData.quantity} units`,
        aiConfidence: "0.85",
        relatedEntityType: "work_order",
        requiresApproval: true,
      }).$returningId();

      return {
        taskCreated: true,
        taskId: task[0].id,
        message: "Work order task created and pending approval",
      };
    }

    case "track_production": {
      const allWOs = await db.select().from(workOrders);
      const inProgress = allWOs.filter(wo => wo.status === "in_progress");
      return {
        totalWorkOrders: allWOs.length,
        inProgress: inProgress.length,
        workOrders: allWOs.slice(0, 20),
      };
    }

    case "performance": {
      const allVendors = await db.select().from(vendors);
      const copackers = allVendors.filter(v =>
        v.category === "copacker" ||
        v.category === "manufacturer"
      );

      return {
        copackers: copackers.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          category: c.category,
        })),
      };
    }

    default:
      throw new Error(`Unknown copacker action: ${action}`);
  }
}

async function executeManageCustomer(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, customerId, data, searchQuery } = params;

  switch (action) {
    case "list": {
      const allCustomers = await db.select().from(customers);
      return { customers: allCustomers, total: allCustomers.length };
    }

    case "get": {
      if (!customerId) throw new Error("Customer ID required");
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      const customerOrders = await db.select().from(orders).where(eq(orders.customerId, customerId));
      return { customer: customer[0], orders: customerOrders };
    }

    case "search": {
      const allCustomers = await db.select().from(customers);
      const filtered = allCustomers.filter(c =>
        c.name?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        c.email?.toLowerCase().includes(searchQuery?.toLowerCase() || "")
      );
      return { customers: filtered, total: filtered.length };
    }

    case "order_history": {
      if (!customerId) throw new Error("Customer ID required");
      const customerOrders = await db.select().from(orders).where(eq(orders.customerId, customerId));
      return { orders: customerOrders, total: customerOrders.length };
    }

    default:
      throw new Error(`Unknown customer action: ${action}`);
  }
}

async function executeManageOrder(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, orderId, data } = params;

  switch (action) {
    case "list": {
      const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(50);
      return { orders: allOrders, total: allOrders.length };
    }

    case "get": {
      if (!orderId) throw new Error("Order ID required");
      const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      return { order: order[0], items };
    }

    default:
      throw new Error(`Unknown order action: ${action}`);
  }
}

async function executeManageFreight(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, rfqData, bookingId, carrierId } = params;

  switch (action) {
    case "list_carriers": {
      const carriers = await db.select().from(freightCarriers);
      return { carriers, total: carriers.length };
    }

    case "create_rfq": {
      const task = await db.insert(aiAgentTasks).values({
        taskType: "send_rfq",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(rfqData),
        aiReasoning: "Freight RFQ creation requested",
        aiConfidence: "0.85",
        relatedEntityType: "freight_rfq",
        requiresApproval: true,
      }).$returningId();

      return {
        taskCreated: true,
        taskId: task[0].id,
        message: "Freight RFQ task created and pending approval",
      };
    }

    case "get_quotes": {
      const quotes = await db.select().from(freightQuotes);
      return { quotes, total: quotes.length };
    }

    case "track": {
      if (!bookingId) {
        const bookings = await db.select().from(freightBookings);
        return { bookings, total: bookings.length };
      }
      const booking = await db.select().from(freightBookings).where(eq(freightBookings.id, bookingId)).limit(1);
      return { booking: booking[0] };
    }

    default:
      throw new Error(`Unknown freight action: ${action}`);
  }
}

async function executeGenerateReport(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { reportType, dateRange, format = "summary" } = params;

  const startDate = dateRange?.startDate ? new Date(dateRange.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : new Date();

  switch (reportType) {
    case "sales_summary": {
      const salesOrders = await db.select().from(orders);
      const filteredOrders = salesOrders.filter(o => {
        const orderDate = new Date(o.createdAt || 0);
        return orderDate >= startDate && orderDate <= endDate;
      });

      const totalRevenue = filteredOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);

      return {
        reportType: "sales_summary",
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        totalOrders: filteredOrders.length,
        totalRevenue: totalRevenue.toFixed(2),
        avgOrderValue: filteredOrders.length > 0 ? (totalRevenue / filteredOrders.length).toFixed(2) : "0.00",
      };
    }

    case "inventory_status": {
      const allInventory = await db.select().from(inventory);
      const lowStock = allInventory.filter(i => parseFloat(i.quantity?.toString() || "0") < 10);

      return {
        reportType: "inventory_status",
        totalItems: allInventory.length,
        lowStockItems: lowStock.length,
        items: format === "detailed" ? allInventory : allInventory.slice(0, 10),
      };
    }

    case "vendor_performance": {
      const allVendors = await db.select().from(vendors);
      const allPOs = await db.select().from(purchaseOrders);

      const vendorStats = allVendors.map(v => {
        const vendorPOs = allPOs.filter(po => po.vendorId === v.id);
        return {
          vendorId: v.id,
          vendorName: v.name,
          totalPOs: vendorPOs.length,
          totalSpent: vendorPOs.reduce((sum, po) => sum + parseFloat(po.totalAmount || "0"), 0).toFixed(2),
        };
      });

      return {
        reportType: "vendor_performance",
        vendors: vendorStats.sort((a, b) => parseFloat(b.totalSpent) - parseFloat(a.totalSpent)),
      };
    }

    case "financial_overview": {
      const allInvoices = await db.select().from(invoices);
      const paidInvoices = allInvoices.filter(i => i.status === "paid");
      const pendingInvoices = allInvoices.filter(i => i.status === "pending" || i.status === "sent");

      return {
        reportType: "financial_overview",
        totalInvoices: allInvoices.length,
        paidInvoices: paidInvoices.length,
        pendingInvoices: pendingInvoices.length,
        totalBilled: allInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0).toFixed(2),
        totalCollected: paidInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0).toFixed(2),
      };
    }

    case "budget_variance": {
      const activeBudgets = await db.select().from(budgets).where(eq(budgets.status, "active"));
      if (activeBudgets.length === 0) return { reportType: "budget_variance", message: "No active budgets found" };

      const budget = activeBudgets[0];
      const lineItems = await db.select().from(budgetLineItems).where(eq(budgetLineItems.budgetId, budget.id));

      const totalBudgeted = lineItems.reduce((s, li) => s + parseFloat(li.budgetedAmount || "0"), 0);
      const totalActual = lineItems.reduce((s, li) => s + parseFloat(li.actualAmount || "0"), 0);

      return {
        reportType: "budget_variance",
        budgetName: budget.name,
        fiscalYear: budget.fiscalYear,
        totalBudgeted: totalBudgeted.toFixed(2),
        totalActual: totalActual.toFixed(2),
        variance: (totalActual - totalBudgeted).toFixed(2),
        variancePct: totalBudgeted > 0 ? (((totalActual - totalBudgeted) / totalBudgeted) * 100).toFixed(1) : "0",
        lineItemCount: lineItems.length,
      };
    }

    case "cash_flow_summary": {
      const forecasts = await db.select().from(cashFlowForecasts).orderBy(desc(cashFlowForecasts.forecastDate)).limit(3);
      const cccMetrics = await db.select().from(cashConversionMetrics)
        .orderBy(desc(cashConversionMetrics.periodYear), desc(cashConversionMetrics.periodMonth))
        .limit(1);

      return {
        reportType: "cash_flow_summary",
        latestForecast: forecasts[0] ? {
          name: forecasts[0].name,
          openingBalance: forecasts[0].openingCashBalance,
          closingBalance: forecasts[0].projectedClosingBalance,
          netCashFlow: forecasts[0].projectedNetCashFlow,
        } : null,
        cashConversionCycle: cccMetrics[0] ? {
          dso: cccMetrics[0].daysRecSalesOutstanding,
          dio: cccMetrics[0].daysInventoryOutstanding,
          dpo: cccMetrics[0].daysPayableOutstanding,
          cccDays: cccMetrics[0].cashConversionCycleDays,
          trend: cccMetrics[0].cccTrend,
        } : null,
      };
    }

    case "channel_profitability": {
      const channelData = await db.select().from(channelPerformance);
      const mktgData = await db.select().from(marketingSpend);

      const byChannel: Record<string, { revenue: number; grossProfit: number; contribution: number; mktgSpend: number }> = {};
      for (const c of channelData) {
        if (!byChannel[c.channel]) byChannel[c.channel] = { revenue: 0, grossProfit: 0, contribution: 0, mktgSpend: 0 };
        byChannel[c.channel].revenue += parseFloat(c.netRevenue || "0");
        byChannel[c.channel].grossProfit += parseFloat(c.grossProfit || "0");
        byChannel[c.channel].contribution += parseFloat(c.contributionProfit || "0");
      }

      return {
        reportType: "channel_profitability",
        channels: Object.entries(byChannel).map(([ch, data]) => ({
          channel: ch,
          netRevenue: data.revenue.toFixed(2),
          grossProfit: data.grossProfit.toFixed(2),
          grossMargin: data.revenue > 0 ? ((data.grossProfit / data.revenue) * 100).toFixed(1) + "%" : "0%",
          contributionProfit: data.contribution.toFixed(2),
          contributionMargin: data.revenue > 0 ? ((data.contribution / data.revenue) * 100).toFixed(1) + "%" : "0%",
        })),
      };
    }

    case "pacing_report": {
      const latestPacing = await db.select().from(performancePacing)
        .orderBy(desc(performancePacing.snapshotDate))
        .limit(1);

      if (!latestPacing[0]) return { reportType: "pacing_report", message: "No pacing data available" };

      const p = latestPacing[0];
      return {
        reportType: "pacing_report",
        period: `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
        daysElapsedPct: p.daysElapsedPct,
        revenue: {
          budgeted: p.budgetedRevenue,
          actual: p.actualRevenue,
          pacePercent: p.revenuePacePercent,
          projectedMonthEnd: p.projectedMonthEndRevenue,
        },
        ebitda: {
          budgeted: p.budgetedEbitda,
          actual: p.actualEbitda,
          projectedMonthEnd: p.projectedMonthEndEbitda,
        },
        overallStatus: p.overallStatus,
      };
    }

    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

async function executeCreateTask(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { taskType, priority = "medium", description, taskData, requiresApproval = true } = params;

  const task = await db.insert(aiAgentTasks).values({
    taskType,
    status: requiresApproval ? "pending_approval" : "approved",
    priority,
    taskData: JSON.stringify(taskData),
    aiReasoning: description,
    aiConfidence: "0.85",
    requiresApproval,
  }).$returningId();

  await db.insert(aiAgentLogs).values({
    taskId: task[0].id,
    action: "task_created",
    status: "info",
    message: `Task created by AI Agent for ${ctx.userName}`,
    details: JSON.stringify({ taskType, description }),
  });

  return {
    taskCreated: true,
    taskId: task[0].id,
    taskType,
    status: requiresApproval ? "pending_approval" : "approved",
    message: requiresApproval ? "Task created and pending approval" : "Task created and approved for execution",
  };
}

// ============================================
// FP&A TOOL EXECUTION FUNCTIONS
// ============================================

async function executeManageBudget(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, budgetId, fiscalYear, periodMonth } = params;

  switch (action) {
    case "list": {
      let allBudgets;
      if (fiscalYear) {
        allBudgets = await db.select().from(budgets).where(eq(budgets.fiscalYear, fiscalYear)).orderBy(desc(budgets.createdAt));
      } else {
        allBudgets = await db.select().from(budgets).orderBy(desc(budgets.createdAt));
      }
      return { budgets: allBudgets, total: allBudgets.length };
    }

    case "get": {
      if (!budgetId) throw new Error("Budget ID required");
      const budget = await db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1);
      if (!budget[0]) throw new Error("Budget not found");

      const lineItems = await db.select().from(budgetLineItems).where(eq(budgetLineItems.budgetId, budgetId));

      return { budget: budget[0], lineItems, lineItemCount: lineItems.length };
    }

    case "variance_analysis": {
      if (!budgetId) throw new Error("Budget ID required");
      const budget = await db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1);
      if (!budget[0]) throw new Error("Budget not found");

      const lineItems = await db.select().from(budgetLineItems).where(eq(budgetLineItems.budgetId, budgetId));

      // Filter by month if specified
      const filtered = periodMonth
        ? lineItems.filter(li => li.periodMonth === periodMonth)
        : lineItems;

      // Group by category
      const categoryVariance: Record<string, { budgeted: number; actual: number; variance: number; variancePct: number }> = {};
      for (const li of filtered) {
        const cat = li.category;
        if (!categoryVariance[cat]) {
          categoryVariance[cat] = { budgeted: 0, actual: 0, variance: 0, variancePct: 0 };
        }
        categoryVariance[cat].budgeted += parseFloat(li.budgetedAmount || "0");
        categoryVariance[cat].actual += parseFloat(li.actualAmount || "0");
        categoryVariance[cat].variance += parseFloat(li.varianceAmount || "0");
      }

      // Calculate variance percentages
      for (const cat of Object.keys(categoryVariance)) {
        const cv = categoryVariance[cat];
        cv.variancePct = cv.budgeted !== 0 ? ((cv.actual - cv.budgeted) / cv.budgeted) * 100 : 0;
      }

      const totalBudgeted = Object.values(categoryVariance).reduce((s, c) => s + c.budgeted, 0);
      const totalActual = Object.values(categoryVariance).reduce((s, c) => s + c.actual, 0);

      return {
        budgetName: budget[0].name,
        fiscalYear: budget[0].fiscalYear,
        periodMonth: periodMonth || "all",
        totalBudgeted: totalBudgeted.toFixed(2),
        totalActual: totalActual.toFixed(2),
        totalVariance: (totalActual - totalBudgeted).toFixed(2),
        totalVariancePct: totalBudgeted !== 0 ? (((totalActual - totalBudgeted) / totalBudgeted) * 100).toFixed(1) : "0",
        byCategory: categoryVariance,
      };
    }

    case "budget_vs_actual": {
      if (!budgetId) throw new Error("Budget ID required");
      const budget = await db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1);
      if (!budget[0]) throw new Error("Budget not found");

      const lineItems = await db.select().from(budgetLineItems).where(eq(budgetLineItems.budgetId, budgetId));

      // Build monthly comparison
      const monthlyComparison: Record<number, { budgeted: number; actual: number }> = {};
      for (const li of lineItems) {
        const month = li.periodMonth || 0;
        if (!monthlyComparison[month]) {
          monthlyComparison[month] = { budgeted: 0, actual: 0 };
        }
        monthlyComparison[month].budgeted += parseFloat(li.budgetedAmount || "0");
        monthlyComparison[month].actual += parseFloat(li.actualAmount || "0");
      }

      return {
        budgetName: budget[0].name,
        status: budget[0].status,
        targetEbitda: budget[0].targetEbitda,
        monthlyComparison,
      };
    }

    case "summary": {
      const allBudgets = await db.select().from(budgets).orderBy(desc(budgets.createdAt));
      const activeBudgets = allBudgets.filter(b => b.status === "active");

      return {
        totalBudgets: allBudgets.length,
        activeBudgets: activeBudgets.length,
        budgets: allBudgets.map(b => ({
          id: b.id,
          name: b.name,
          fiscalYear: b.fiscalYear,
          status: b.status,
          totalRevenue: b.totalRevenue,
          totalExpenses: b.totalExpenses,
          targetEbitda: b.targetEbitda,
        })),
      };
    }

    default:
      throw new Error(`Unknown budget action: ${action}`);
  }
}

async function executeManageScenarios(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, scenarioId, compareIds } = params;

  switch (action) {
    case "list": {
      const allScenarios = await db.select().from(financialScenarios).orderBy(desc(financialScenarios.createdAt));
      return {
        scenarios: allScenarios.map(s => ({
          id: s.id,
          name: s.name,
          scenarioType: s.scenarioType,
          status: s.status,
          projectedRevenue: s.projectedRevenue,
          projectedEbitda: s.projectedEbitda,
          projectedEbitdaMargin: s.projectedEbitdaMargin,
          projectedNetIncome: s.projectedNetIncome,
        })),
        total: allScenarios.length,
      };
    }

    case "get": {
      if (!scenarioId) throw new Error("Scenario ID required");
      const scenario = await db.select().from(financialScenarios).where(eq(financialScenarios.id, scenarioId)).limit(1);
      if (!scenario[0]) throw new Error("Scenario not found");
      return { scenario: scenario[0] };
    }

    case "compare": {
      if (!compareIds || compareIds.length < 2) throw new Error("At least 2 scenario IDs required for comparison");
      const scenarios = await db.select().from(financialScenarios);
      const selected = scenarios.filter(s => compareIds.includes(s.id));

      return {
        comparison: selected.map(s => ({
          id: s.id,
          name: s.name,
          scenarioType: s.scenarioType,
          projectedRevenue: s.projectedRevenue,
          projectedCOGS: s.projectedCOGS,
          projectedGrossProfit: s.projectedGrossProfit,
          projectedGrossMargin: s.projectedGrossMargin,
          projectedOpex: s.projectedOpex,
          projectedEbitda: s.projectedEbitda,
          projectedEbitdaMargin: s.projectedEbitdaMargin,
          projectedNetIncome: s.projectedNetIncome,
          projectedCashBalance: s.projectedCashBalance,
          assumptions: s.assumptions,
        })),
        scenarioCount: selected.length,
      };
    }

    case "summary": {
      const allScenarios = await db.select().from(financialScenarios);
      const active = allScenarios.filter(s => s.status === "active");
      const base = allScenarios.find(s => s.scenarioType === "base" && s.status === "active");

      return {
        totalScenarios: allScenarios.length,
        activeScenarios: active.length,
        baseScenario: base ? {
          name: base.name,
          projectedRevenue: base.projectedRevenue,
          projectedEbitda: base.projectedEbitda,
          projectedNetIncome: base.projectedNetIncome,
        } : null,
        scenarios: allScenarios.map(s => ({
          id: s.id,
          name: s.name,
          scenarioType: s.scenarioType,
          status: s.status,
        })),
      };
    }

    default:
      throw new Error(`Unknown scenario action: ${action}`);
  }
}

async function executeAnalyzeCashFlow(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, forecastId } = params;

  switch (action) {
    case "list": {
      const forecasts = await db.select().from(cashFlowForecasts).orderBy(desc(cashFlowForecasts.forecastDate));
      return {
        forecasts: forecasts.map(f => ({
          id: f.id,
          name: f.name,
          forecastDate: f.forecastDate,
          status: f.status,
          projectedNetCashFlow: f.projectedNetCashFlow,
          projectedClosingBalance: f.projectedClosingBalance,
        })),
        total: forecasts.length,
      };
    }

    case "get": {
      if (!forecastId) throw new Error("Forecast ID required");
      const forecast = await db.select().from(cashFlowForecasts).where(eq(cashFlowForecasts.id, forecastId)).limit(1);
      if (!forecast[0]) throw new Error("Cash flow forecast not found");
      return { forecast: forecast[0] };
    }

    case "current_position": {
      // Get the most recent active forecast
      const latest = await db.select().from(cashFlowForecasts)
        .where(eq(cashFlowForecasts.status, "active"))
        .orderBy(desc(cashFlowForecasts.forecastDate))
        .limit(1);

      if (!latest[0]) {
        // Fall back to any latest forecast
        const anyLatest = await db.select().from(cashFlowForecasts)
          .orderBy(desc(cashFlowForecasts.forecastDate))
          .limit(1);
        if (!anyLatest[0]) return { message: "No cash flow forecasts available" };
        return {
          forecast: anyLatest[0],
          cashPosition: {
            openingBalance: anyLatest[0].openingCashBalance,
            totalInflows: (parseFloat(anyLatest[0].projectedCollections || "0") + parseFloat(anyLatest[0].projectedOtherInflows || "0")).toFixed(2),
            totalOutflows: (
              parseFloat(anyLatest[0].projectedSupplierPayments || "0") +
              parseFloat(anyLatest[0].projectedPayroll || "0") +
              parseFloat(anyLatest[0].projectedRent || "0") +
              parseFloat(anyLatest[0].projectedMarketingSpend || "0") +
              parseFloat(anyLatest[0].projectedOtherOutflows || "0")
            ).toFixed(2),
            netCashFlow: anyLatest[0].projectedNetCashFlow,
            closingBalance: anyLatest[0].projectedClosingBalance,
          },
        };
      }

      const f = latest[0];
      return {
        forecast: f,
        cashPosition: {
          openingBalance: f.openingCashBalance,
          totalInflows: (parseFloat(f.projectedCollections || "0") + parseFloat(f.projectedOtherInflows || "0")).toFixed(2),
          totalOutflows: (
            parseFloat(f.projectedSupplierPayments || "0") +
            parseFloat(f.projectedPayroll || "0") +
            parseFloat(f.projectedRent || "0") +
            parseFloat(f.projectedMarketingSpend || "0") +
            parseFloat(f.projectedOtherOutflows || "0")
          ).toFixed(2),
          netCashFlow: f.projectedNetCashFlow,
          closingBalance: f.projectedClosingBalance,
        },
      };
    }

    case "runway_analysis": {
      const forecasts = await db.select().from(cashFlowForecasts)
        .orderBy(desc(cashFlowForecasts.forecastDate))
        .limit(6);

      if (forecasts.length === 0) return { message: "No cash flow forecasts available for runway analysis" };

      const latest = forecasts[0];
      const closingBalance = parseFloat(latest.projectedClosingBalance || "0");
      const monthlyBurn = (
        parseFloat(latest.projectedSupplierPayments || "0") +
        parseFloat(latest.projectedPayroll || "0") +
        parseFloat(latest.projectedRent || "0") +
        parseFloat(latest.projectedMarketingSpend || "0") +
        parseFloat(latest.projectedOtherOutflows || "0")
      );
      const runwayMonths = monthlyBurn > 0 ? closingBalance / monthlyBurn : Infinity;

      return {
        currentCash: closingBalance.toFixed(2),
        monthlyBurnRate: monthlyBurn.toFixed(2),
        estimatedRunwayMonths: runwayMonths === Infinity ? "N/A (no burn)" : runwayMonths.toFixed(1),
        recentForecasts: forecasts.map(f => ({
          date: f.forecastDate,
          netCashFlow: f.projectedNetCashFlow,
          closingBalance: f.projectedClosingBalance,
        })),
      };
    }

    default:
      throw new Error(`Unknown cash flow action: ${action}`);
  }
}

async function executeAnalyzeRollingForecast(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, forecastId } = params;

  switch (action) {
    case "list": {
      const forecasts = await db.select().from(rollingForecasts).orderBy(desc(rollingForecasts.forecastDate));
      return {
        forecasts: forecasts.map(f => ({
          id: f.id,
          name: f.name,
          forecastDate: f.forecastDate,
          horizonMonths: f.horizonMonths,
          status: f.status,
          totalRevenue: f.totalRevenue,
          totalEbitda: f.totalEbitda,
          averageGrossMargin: f.averageGrossMargin,
          averageEbitdaMargin: f.averageEbitdaMargin,
        })),
        total: forecasts.length,
      };
    }

    case "get": {
      if (!forecastId) throw new Error("Forecast ID required");
      const forecast = await db.select().from(rollingForecasts).where(eq(rollingForecasts.id, forecastId)).limit(1);
      if (!forecast[0]) throw new Error("Rolling forecast not found");
      return { forecast: forecast[0] };
    }

    case "latest": {
      const latest = await db.select().from(rollingForecasts)
        .where(eq(rollingForecasts.status, "active"))
        .orderBy(desc(rollingForecasts.forecastDate))
        .limit(1);

      if (!latest[0]) {
        const anyLatest = await db.select().from(rollingForecasts)
          .orderBy(desc(rollingForecasts.forecastDate))
          .limit(1);
        if (!anyLatest[0]) return { message: "No rolling forecasts available" };
        return { forecast: anyLatest[0] };
      }
      return { forecast: latest[0] };
    }

    case "trend_analysis": {
      const forecasts = await db.select().from(rollingForecasts)
        .orderBy(desc(rollingForecasts.forecastDate))
        .limit(6);

      return {
        trend: forecasts.map(f => ({
          date: f.forecastDate,
          revenue: f.totalRevenue,
          grossProfit: f.totalGrossProfit,
          ebitda: f.totalEbitda,
          grossMargin: f.averageGrossMargin,
          ebitdaMargin: f.averageEbitdaMargin,
        })),
        count: forecasts.length,
      };
    }

    default:
      throw new Error(`Unknown rolling forecast action: ${action}`);
  }
}

async function executeAnalyzePacing(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, budgetId, periodMonth, periodYear } = params;

  switch (action) {
    case "current": {
      // Get most recent pacing snapshot
      const latest = await db.select().from(performancePacing)
        .orderBy(desc(performancePacing.snapshotDate))
        .limit(1);

      if (!latest[0]) return { message: "No pacing data available" };

      const p = latest[0];
      return {
        snapshotDate: p.snapshotDate,
        period: `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
        daysElapsedPct: p.daysElapsedPct,
        revenue: {
          budgeted: p.budgetedRevenue,
          actual: p.actualRevenue,
          paced: p.pacedRevenue,
          pacePercent: p.revenuePacePercent,
          projectedMonthEnd: p.projectedMonthEndRevenue,
        },
        expenses: {
          budgeted: p.budgetedExpenses,
          actual: p.actualExpenses,
          paced: p.pacedExpenses,
          pacePercent: p.expensePacePercent,
        },
        ebitda: {
          budgeted: p.budgetedEbitda,
          actual: p.actualEbitda,
          projectedMonthEnd: p.projectedMonthEndEbitda,
        },
        overallStatus: p.overallStatus,
        aiInsights: p.aiInsights,
      };
    }

    case "history": {
      let query = db.select().from(performancePacing).orderBy(desc(performancePacing.snapshotDate));
      const allPacing = await query.limit(30);

      const filtered = allPacing.filter(p => {
        if (periodMonth && p.periodMonth !== periodMonth) return false;
        if (periodYear && p.periodYear !== periodYear) return false;
        return true;
      });

      return {
        history: filtered.map(p => ({
          snapshotDate: p.snapshotDate,
          period: `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
          revenuePacePercent: p.revenuePacePercent,
          expensePacePercent: p.expensePacePercent,
          overallStatus: p.overallStatus,
        })),
        total: filtered.length,
      };
    }

    case "by_budget": {
      if (!budgetId) throw new Error("Budget ID required");
      const pacing = await db.select().from(performancePacing)
        .where(eq(performancePacing.budgetId, budgetId))
        .orderBy(desc(performancePacing.snapshotDate));

      return {
        budgetId,
        snapshots: pacing.map(p => ({
          snapshotDate: p.snapshotDate,
          period: `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
          revenuePacePercent: p.revenuePacePercent,
          actualRevenue: p.actualRevenue,
          budgetedRevenue: p.budgetedRevenue,
          actualEbitda: p.actualEbitda,
          budgetedEbitda: p.budgetedEbitda,
          overallStatus: p.overallStatus,
        })),
        total: pacing.length,
      };
    }

    default:
      throw new Error(`Unknown pacing action: ${action}`);
  }
}

async function executeAnalyzeInventoryAging(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, productId, riskLevel } = params;

  switch (action) {
    case "latest_snapshot": {
      // Get the latest snapshot date
      const latest = await db.select().from(inventoryAgingSnapshots)
        .orderBy(desc(inventoryAgingSnapshots.snapshotDate))
        .limit(50);

      if (latest.length === 0) return { message: "No inventory aging snapshots available" };

      // Get snapshots from the most recent date
      const latestDate = latest[0].snapshotDate;
      const snapshot = latest.filter(s =>
        s.snapshotDate?.getTime() === latestDate?.getTime()
      );

      const totalValue = snapshot.reduce((s, i) => s + parseFloat(i.totalValue || "0"), 0);
      const agedValue181Plus = snapshot.reduce((s, i) => s + parseFloat(i.val181plus || "0"), 0);
      const highRiskItems = snapshot.filter(i => i.riskLevel === "high" || i.riskLevel === "critical");

      return {
        snapshotDate: latestDate,
        totalProducts: snapshot.length,
        totalInventoryValue: totalValue.toFixed(2),
        agedValue181PlusDays: agedValue181Plus.toFixed(2),
        writeOffExposurePct: totalValue > 0 ? ((agedValue181Plus / totalValue) * 100).toFixed(1) : "0",
        highRiskItemCount: highRiskItems.length,
        items: snapshot.slice(0, 20).map(i => ({
          productId: i.productId,
          sku: i.sku,
          totalQuantity: i.totalQuantity,
          totalValue: i.totalValue,
          averageAgeDays: i.averageAgeDays,
          daysOfSupply: i.daysOfSupply,
          riskLevel: i.riskLevel,
        })),
      };
    }

    case "by_product": {
      if (!productId) throw new Error("Product ID required");
      const snapshots = await db.select().from(inventoryAgingSnapshots)
        .where(eq(inventoryAgingSnapshots.productId, productId))
        .orderBy(desc(inventoryAgingSnapshots.snapshotDate))
        .limit(12);

      if (snapshots.length === 0) return { message: "No aging data for this product" };

      return {
        productId,
        latestSnapshot: snapshots[0],
        agingBuckets: {
          "0-30 days": { qty: snapshots[0].qty0to30, value: snapshots[0].val0to30 },
          "31-60 days": { qty: snapshots[0].qty31to60, value: snapshots[0].val31to60 },
          "61-90 days": { qty: snapshots[0].qty61to90, value: snapshots[0].val61to90 },
          "91-120 days": { qty: snapshots[0].qty91to120, value: snapshots[0].val91to120 },
          "121-180 days": { qty: snapshots[0].qty121to180, value: snapshots[0].val121to180 },
          "181+ days": { qty: snapshots[0].qty181plus, value: snapshots[0].val181plus },
        },
        trend: snapshots.map(s => ({
          date: s.snapshotDate,
          totalValue: s.totalValue,
          averageAgeDays: s.averageAgeDays,
          riskLevel: s.riskLevel,
        })),
      };
    }

    case "risk_summary": {
      const latest = await db.select().from(inventoryAgingSnapshots)
        .orderBy(desc(inventoryAgingSnapshots.snapshotDate))
        .limit(200);

      if (latest.length === 0) return { message: "No inventory aging data available" };

      // Get latest date's snapshots
      const latestDate = latest[0].snapshotDate;
      let snapshot = latest.filter(s =>
        s.snapshotDate?.getTime() === latestDate?.getTime()
      );

      if (riskLevel) {
        snapshot = snapshot.filter(s => s.riskLevel === riskLevel);
      }

      const byRisk: Record<string, { count: number; totalValue: number }> = {
        low: { count: 0, totalValue: 0 },
        medium: { count: 0, totalValue: 0 },
        high: { count: 0, totalValue: 0 },
        critical: { count: 0, totalValue: 0 },
      };

      for (const s of snapshot) {
        const risk = s.riskLevel || "low";
        byRisk[risk].count++;
        byRisk[risk].totalValue += parseFloat(s.totalValue || "0");
      }

      return {
        snapshotDate: latestDate,
        riskBreakdown: Object.entries(byRisk).map(([level, data]) => ({
          riskLevel: level,
          itemCount: data.count,
          totalValue: data.totalValue.toFixed(2),
        })),
        filteredBy: riskLevel || "all",
      };
    }

    case "trend": {
      const snapshots = await db.select().from(inventoryAgingSnapshots)
        .orderBy(desc(inventoryAgingSnapshots.snapshotDate))
        .limit(500);

      // Group by snapshot date
      const byDate: Record<string, { totalValue: number; avgAge: number; count: number; highRisk: number }> = {};
      for (const s of snapshots) {
        const dateKey = s.snapshotDate?.toISOString().split("T")[0] || "unknown";
        if (!byDate[dateKey]) {
          byDate[dateKey] = { totalValue: 0, avgAge: 0, count: 0, highRisk: 0 };
        }
        byDate[dateKey].totalValue += parseFloat(s.totalValue || "0");
        byDate[dateKey].avgAge += parseFloat(s.averageAgeDays || "0");
        byDate[dateKey].count++;
        if (s.riskLevel === "high" || s.riskLevel === "critical") byDate[dateKey].highRisk++;
      }

      return {
        trend: Object.entries(byDate).map(([date, data]) => ({
          date,
          totalValue: data.totalValue.toFixed(2),
          averageAgeDays: data.count > 0 ? (data.avgAge / data.count).toFixed(1) : "0",
          productCount: data.count,
          highRiskCount: data.highRisk,
        })).slice(0, 12),
      };
    }

    default:
      throw new Error(`Unknown inventory aging action: ${action}`);
  }
}

async function executeAnalyzeChannels(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, channel, periodMonth, periodYear } = params;

  switch (action) {
    case "summary": {
      const allPerf = await db.select().from(channelPerformance);
      const allMarketing = await db.select().from(marketingSpend);

      // Filter by period if specified
      let filtered = allPerf;
      if (periodMonth) filtered = filtered.filter(p => p.periodMonth === periodMonth);
      if (periodYear) filtered = filtered.filter(p => p.periodYear === periodYear);

      // Aggregate by channel
      const byChannel: Record<string, { netRevenue: number; grossProfit: number; contributionProfit: number; orders: number; units: number }> = {};
      for (const p of filtered) {
        if (!byChannel[p.channel]) {
          byChannel[p.channel] = { netRevenue: 0, grossProfit: 0, contributionProfit: 0, orders: 0, units: 0 };
        }
        byChannel[p.channel].netRevenue += parseFloat(p.netRevenue || "0");
        byChannel[p.channel].grossProfit += parseFloat(p.grossProfit || "0");
        byChannel[p.channel].contributionProfit += parseFloat(p.contributionProfit || "0");
        byChannel[p.channel].orders += p.orderCount || 0;
        byChannel[p.channel].units += p.unitsSold || 0;
      }

      const totalRevenue = Object.values(byChannel).reduce((s, c) => s + c.netRevenue, 0);

      return {
        channelSummary: Object.entries(byChannel).map(([ch, data]) => ({
          channel: ch,
          netRevenue: data.netRevenue.toFixed(2),
          grossProfit: data.grossProfit.toFixed(2),
          contributionProfit: data.contributionProfit.toFixed(2),
          revenueSharePct: totalRevenue > 0 ? ((data.netRevenue / totalRevenue) * 100).toFixed(1) : "0",
          orderCount: data.orders,
          unitsSold: data.units,
        })),
        totalNetRevenue: totalRevenue.toFixed(2),
        channelCount: Object.keys(byChannel).length,
      };
    }

    case "by_channel": {
      if (!channel) throw new Error("Channel required");
      let perfData = await db.select().from(channelPerformance)
        .where(eq(channelPerformance.channel, channel));

      if (periodYear) perfData = perfData.filter(p => p.periodYear === periodYear);

      return {
        channel,
        periods: perfData.map(p => ({
          period: `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
          grossRevenue: p.grossRevenue,
          netRevenue: p.netRevenue,
          cogs: p.cogs,
          grossProfit: p.grossProfit,
          grossMargin: p.grossMargin,
          contributionProfit: p.contributionProfit,
          contributionMargin: p.contributionMargin,
          orderCount: p.orderCount,
          averageOrderValue: p.averageOrderValue,
          newCustomers: p.newCustomers,
          returningCustomers: p.returningCustomers,
        })),
        total: perfData.length,
      };
    }

    case "compare_channels": {
      let perfData = await db.select().from(channelPerformance);
      if (periodMonth) perfData = perfData.filter(p => p.periodMonth === periodMonth);
      if (periodYear) perfData = perfData.filter(p => p.periodYear === periodYear);

      const byChannel: Record<string, any> = {};
      for (const p of perfData) {
        if (!byChannel[p.channel]) {
          byChannel[p.channel] = {
            netRevenue: 0, grossProfit: 0, contributionProfit: 0,
            orders: 0, newCustomers: 0, periods: 0,
          };
        }
        byChannel[p.channel].netRevenue += parseFloat(p.netRevenue || "0");
        byChannel[p.channel].grossProfit += parseFloat(p.grossProfit || "0");
        byChannel[p.channel].contributionProfit += parseFloat(p.contributionProfit || "0");
        byChannel[p.channel].orders += p.orderCount || 0;
        byChannel[p.channel].newCustomers += p.newCustomers || 0;
        byChannel[p.channel].periods++;
      }

      return {
        comparison: Object.entries(byChannel).map(([ch, data]) => ({
          channel: ch,
          netRevenue: data.netRevenue.toFixed(2),
          grossProfit: data.grossProfit.toFixed(2),
          grossMarginPct: data.netRevenue > 0 ? ((data.grossProfit / data.netRevenue) * 100).toFixed(1) : "0",
          contributionProfit: data.contributionProfit.toFixed(2),
          contributionMarginPct: data.netRevenue > 0 ? ((data.contributionProfit / data.netRevenue) * 100).toFixed(1) : "0",
          orderCount: data.orders,
          newCustomers: data.newCustomers,
        })),
      };
    }

    case "marketing_efficiency": {
      let mktgData = await db.select().from(marketingSpend);
      if (periodMonth) mktgData = mktgData.filter(m => m.periodMonth === periodMonth);
      if (periodYear) mktgData = mktgData.filter(m => m.periodYear === periodYear);
      if (channel) mktgData = mktgData.filter(m => m.channel === channel);

      const byChannel: Record<string, { spend: number; revenue: number; conversions: number; newCustomers: number }> = {};
      for (const m of mktgData) {
        if (!byChannel[m.channel]) {
          byChannel[m.channel] = { spend: 0, revenue: 0, conversions: 0, newCustomers: 0 };
        }
        byChannel[m.channel].spend += parseFloat(m.spend || "0");
        byChannel[m.channel].revenue += parseFloat(m.revenue || "0");
        byChannel[m.channel].conversions += m.conversions || 0;
        byChannel[m.channel].newCustomers += m.newCustomers || 0;
      }

      return {
        marketingEfficiency: Object.entries(byChannel).map(([ch, data]) => ({
          channel: ch,
          totalSpend: data.spend.toFixed(2),
          totalRevenue: data.revenue.toFixed(2),
          roas: data.spend > 0 ? (data.revenue / data.spend).toFixed(2) : "N/A",
          cac: data.newCustomers > 0 ? (data.spend / data.newCustomers).toFixed(2) : "N/A",
          conversions: data.conversions,
          newCustomers: data.newCustomers,
        })),
      };
    }

    default:
      throw new Error(`Unknown channel action: ${action}`);
  }
}

async function executeAnalyzeCashConversion(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, periodMonth, periodYear } = params;

  switch (action) {
    case "latest": {
      const latest = await db.select().from(cashConversionMetrics)
        .orderBy(desc(cashConversionMetrics.periodYear), desc(cashConversionMetrics.periodMonth))
        .limit(1);

      if (!latest[0]) return { message: "No cash conversion cycle data available" };

      const m = latest[0];
      return {
        period: `${m.periodYear}-${String(m.periodMonth).padStart(2, "0")}`,
        dso: m.daysRecSalesOutstanding,
        dio: m.daysInventoryOutstanding,
        dpo: m.daysPayableOutstanding,
        cashConversionCycleDays: m.cashConversionCycleDays,
        trend: m.cccTrend,
        aiAnalysis: m.aiAnalysis,
      };
    }

    case "trend": {
      const metrics = await db.select().from(cashConversionMetrics)
        .orderBy(desc(cashConversionMetrics.periodYear), desc(cashConversionMetrics.periodMonth))
        .limit(12);

      return {
        trend: metrics.map(m => ({
          period: `${m.periodYear}-${String(m.periodMonth).padStart(2, "0")}`,
          dso: m.daysRecSalesOutstanding,
          dio: m.daysInventoryOutstanding,
          dpo: m.daysPayableOutstanding,
          cccDays: m.cashConversionCycleDays,
          trend: m.cccTrend,
        })),
        count: metrics.length,
      };
    }

    case "breakdown": {
      let metrics;
      if (periodMonth && periodYear) {
        metrics = await db.select().from(cashConversionMetrics)
          .where(and(
            eq(cashConversionMetrics.periodMonth, periodMonth),
            eq(cashConversionMetrics.periodYear, periodYear)
          ))
          .limit(1);
      } else {
        metrics = await db.select().from(cashConversionMetrics)
          .orderBy(desc(cashConversionMetrics.periodYear), desc(cashConversionMetrics.periodMonth))
          .limit(1);
      }

      if (!metrics[0]) return { message: "No data for specified period" };

      const m = metrics[0];
      return {
        period: `${m.periodYear}-${String(m.periodMonth).padStart(2, "0")}`,
        components: {
          dso: { days: m.daysRecSalesOutstanding, avgReceivables: m.avgAccountsReceivable, totalRevenue: m.totalRevenue },
          dio: { days: m.daysInventoryOutstanding, avgInventory: m.avgInventoryValue, totalCOGS: m.totalCOGS },
          dpo: { days: m.daysPayableOutstanding, avgPayables: m.avgAccountsPayable, totalPurchases: m.totalPurchases },
        },
        cashConversionCycleDays: m.cashConversionCycleDays,
        trend: m.cccTrend,
      };
    }

    default:
      throw new Error(`Unknown cash conversion action: ${action}`);
  }
}

// ============================================
// TOOL EXECUTION DISPATCHER
// ============================================

async function executeTool(toolName: string, params: any, ctx: AIAgentContext): Promise<any> {
  switch (toolName) {
    case "analyze_data":
      return executeAnalyzeData(params, ctx);
    case "send_email":
      return executeSendEmail(params, ctx);
    case "draft_email":
      return executeDraftEmail(params, ctx);
    case "track_items":
      return executeTrackItems(params, ctx);
    case "update_inventory":
      return executeUpdateInventory(params, ctx);
    case "manage_vendor":
      return executeManageVendor(params, ctx);
    case "create_purchase_order":
      return executeCreatePurchaseOrder(params, ctx);
    case "manage_copacker":
      return executeManageCopacker(params, ctx);
    case "manage_customer":
      return executeManageCustomer(params, ctx);
    case "manage_order":
      return executeManageOrder(params, ctx);
    case "manage_freight":
      return executeManageFreight(params, ctx);
    case "generate_report":
      return executeGenerateReport(params, ctx);
    case "create_task":
      return executeCreateTask(params, ctx);
    // FP&A Tools
    case "manage_budget":
      return executeManageBudget(params, ctx);
    case "manage_scenarios":
      return executeManageScenarios(params, ctx);
    case "analyze_cash_flow":
      return executeAnalyzeCashFlow(params, ctx);
    case "analyze_rolling_forecast":
      return executeAnalyzeRollingForecast(params, ctx);
    case "analyze_pacing":
      return executeAnalyzePacing(params, ctx);
    case "analyze_inventory_aging":
      return executeAnalyzeInventoryAging(params, ctx);
    case "analyze_channels":
      return executeAnalyzeChannels(params, ctx);
    case "analyze_cash_conversion":
      return executeAnalyzeCashConversion(params, ctx);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================
// MAIN AI AGENT FUNCTION
// ============================================

export async function processAIAgentRequest(
  message: string,
  conversationHistory: Message[],
  ctx: AIAgentContext
): Promise<AIAgentResponse> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current business context
  const [vendorCount, customerCount, orderCount, inventoryCount, poCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(vendors),
    db.select({ count: sql<number>`count(*)` }).from(customers),
    db.select({ count: sql<number>`count(*)` }).from(orders),
    db.select({ count: sql<number>`count(*)` }).from(inventory),
    db.select({ count: sql<number>`count(*)` }).from(purchaseOrders),
  ]);

  const systemPrompt = `You are an AI assistant integrated into a comprehensive ERP system. You have access to tools that allow you to:

1. **Analyze Data**: Query and analyze business data including sales, inventory, vendors, customers, finances, orders, procurement, production, budgets, cash flow, channels, and marketing.

2. **Send Emails**: Send emails to vendors, customers, or team members. You can also draft emails for review.

3. **Track Items**: Track inventory, orders, shipments, purchase orders, and work orders.

4. **Manage Suppliers/Vendors**: Create, update, search vendors, view vendor performance, and create purchase orders.

5. **Manage Co-packers**: List co-packers, create work orders for contract manufacturing, and track production.

6. **Manage Customers**: Create, update, search customers, and view order history.

7. **Manage Orders**: View and track sales orders.

8. **Manage Freight**: Create RFQs, get quotes, book shipments, and track freight.

9. **Generate Reports**: Create various business reports including budget variance, cash flow summaries, channel profitability, and pacing reports.

10. **Create Tasks**: Create tasks that require approval before execution.

11. **Budget Management (FP&A)**: View budgets, analyze budget-vs-actual variance, compare periods, and review budget line items by category.

12. **Scenario Planning (FP&A)**: View and compare financial scenarios (base, optimistic, pessimistic, custom) with projected P&L outputs and assumptions.

13. **Cash Flow Analysis (FP&A)**: View cash flow forecasts, analyze current cash position, inflows vs outflows, and estimate cash runway.

14. **Rolling Forecasts (FP&A)**: View rolling P&L forecasts with monthly projections, balance sheet and cash flow trends over the forecast horizon.

15. **Performance Pacing (FP&A)**: Analyze real-time pacing of revenue, expenses, and EBITDA against budget with month-end projections.

16. **Inventory Aging (FP&A)**: Analyze inventory aging buckets (0-30, 31-60, 61-90, 91-120, 121-180, 181+ days), risk levels, write-off exposure, and days of supply.

17. **Channel Analytics (FP&A)**: Analyze sales channel performance (DTC/Shopify, Amazon, wholesale, retail) including revenue, margins, contribution profit, and marketing efficiency (ROAS, CAC).

18. **Cash Conversion Cycle (FP&A)**: Analyze DSO, DIO, DPO, and overall cash conversion cycle trend.

Current System Status:
- Vendors: ${vendorCount[0]?.count || 0}
- Customers: ${customerCount[0]?.count || 0}
- Orders: ${orderCount[0]?.count || 0}
- Inventory Items: ${inventoryCount[0]?.count || 0}
- Purchase Orders: ${poCount[0]?.count || 0}

User Context:
- Name: ${ctx.userName}
- Role: ${ctx.userRole}

Guidelines:
- For sensitive operations (creating POs, sending emails, updating inventory), create tasks that require approval unless explicitly told to execute immediately.
- Provide clear, actionable responses.
- When analyzing data, provide insights and recommendations.
- Format currency values with $ symbol and 2 decimal places.
- When listing items, limit to 10-20 unless more are requested.
- Be proactive in suggesting relevant actions based on the data.`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message },
  ];

  const actions: AIAgentAction[] = [];
  let finalResponse = "";
  let data: Record<string, any> = {};
  let iterations = 0;
  const maxIterations = 5;

  // Iterative tool calling loop
  while (iterations < maxIterations) {
    iterations++;

    const response = await invokeLLM({
      messages,
      tools: AI_TOOLS,
      toolChoice: "auto",
    });

    const choice = response.choices[0];
    const responseMessage = choice.message;

    // Check if there are tool calls
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Add assistant message with tool calls to history (must include tool_calls for valid conversation)
      messages.push({
        role: "assistant",
        content: typeof responseMessage.content === "string" ? responseMessage.content : "",
        tool_calls: responseMessage.tool_calls,
      });

      // Process each tool call
      for (const toolCall of responseMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: any;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (parseError: any) {
          const action: AIAgentAction = {
            type: toolName,
            description: `Executing ${toolName}`,
            status: "failed",
            error: `Invalid arguments: ${parseError.message}`,
          };
          actions.push(action);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Invalid tool arguments: ${parseError.message}` }),
          });
          continue;
        }

        const action: AIAgentAction = {
          type: toolName,
          description: `Executing ${toolName}`,
          status: "pending",
        };

        try {
          const result = await executeTool(toolName, toolArgs, ctx);
          action.status = "completed";
          action.result = result;
          data[toolName] = result;

          // Add tool result to messages
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } catch (error: any) {
          action.status = "failed";
          action.error = error.message;

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message }),
          });
        }

        actions.push(action);
      }
    } else {
      // No more tool calls, get final response
      const content = responseMessage.content;
      finalResponse = typeof content === "string" ? content : "I've completed processing your request.";
      break;
    }
  }

  // If we hit max iterations, get a summary
  if (iterations >= maxIterations && !finalResponse) {
    const summaryResponse = await invokeLLM({
      messages: [
        ...messages,
        { role: "user", content: "Please provide a summary of what you've done so far." },
      ],
    });
    const summaryContent = summaryResponse.choices[0]?.message?.content;
    finalResponse = typeof summaryContent === "string" ? summaryContent : "I've completed the requested operations.";
  }

  // Generate suggestions based on the conversation
  const suggestions = generateSuggestions(message, actions, data);

  return {
    message: finalResponse,
    actions: actions.length > 0 ? actions : undefined,
    data: Object.keys(data).length > 0 ? data : undefined,
    suggestions,
  };
}

function generateSuggestions(message: string, actions: AIAgentAction[], data: Record<string, any>): string[] {
  const suggestions: string[] = [];
  const messageLower = message.toLowerCase();

  // Based on actions performed
  if (actions.some(a => a.type === "analyze_data")) {
    suggestions.push("Generate a detailed report");
    suggestions.push("Export this data to a spreadsheet");
  }

  if (actions.some(a => a.type === "manage_vendor")) {
    suggestions.push("Check vendor performance metrics");
    suggestions.push("Create a purchase order");
    suggestions.push("Send an RFQ to vendors");
  }

  if (actions.some(a => a.type === "track_items")) {
    suggestions.push("Update inventory levels");
    suggestions.push("View item history");
  }

  // Based on message content
  if (messageLower.includes("inventory") || messageLower.includes("stock")) {
    suggestions.push("Show low stock items");
    suggestions.push("Analyze inventory trends");
  }

  if (messageLower.includes("vendor") || messageLower.includes("supplier")) {
    suggestions.push("List all active vendors");
    suggestions.push("Check vendor performance");
  }

  if (messageLower.includes("order")) {
    suggestions.push("View pending orders");
    suggestions.push("Track order shipments");
  }

  if (messageLower.includes("email") || messageLower.includes("send")) {
    suggestions.push("Draft a follow-up email");
    suggestions.push("Send reminder to vendors");
  }

  // FP&A suggestions
  if (messageLower.includes("budget") || messageLower.includes("variance")) {
    suggestions.push("Show budget variance analysis");
    suggestions.push("Compare budget vs actual");
    suggestions.push("View performance pacing");
  }

  if (messageLower.includes("cash") || messageLower.includes("runway") || messageLower.includes("liquidity")) {
    suggestions.push("Analyze cash flow position");
    suggestions.push("View cash runway analysis");
    suggestions.push("Check cash conversion cycle");
  }

  if (messageLower.includes("forecast") || messageLower.includes("projection") || messageLower.includes("scenario")) {
    suggestions.push("View rolling P&L forecast");
    suggestions.push("Compare financial scenarios");
    suggestions.push("Show latest cash flow forecast");
  }

  if (messageLower.includes("channel") || messageLower.includes("dtc") || messageLower.includes("amazon") || messageLower.includes("wholesale")) {
    suggestions.push("Compare channel profitability");
    suggestions.push("View marketing efficiency by channel");
    suggestions.push("Analyze channel contribution margins");
  }

  if (messageLower.includes("pacing") || messageLower.includes("on track") || messageLower.includes("behind")) {
    suggestions.push("View current pacing status");
    suggestions.push("Show month-end revenue projection");
  }

  if (messageLower.includes("aging") || messageLower.includes("write-off") || messageLower.includes("slow moving")) {
    suggestions.push("View inventory aging risk summary");
    suggestions.push("Show high-risk inventory items");
  }

  if (messageLower.includes("margin") || messageLower.includes("ebitda") || messageLower.includes("profit")) {
    suggestions.push("View channel profitability report");
    suggestions.push("Analyze gross margins by channel");
    suggestions.push("Check EBITDA pacing");
  }

  if (messageLower.includes("marketing") || messageLower.includes("roas") || messageLower.includes("cac")) {
    suggestions.push("Analyze marketing spend efficiency");
    suggestions.push("View ROAS by channel");
  }

  // Default suggestions if none generated
  if (suggestions.length === 0) {
    suggestions.push("Analyze sales data");
    suggestions.push("Check inventory status");
    suggestions.push("View pending approvals");
    suggestions.push("View budget & pacing status");
  }

  return suggestions.slice(0, 4);
}

// ============================================
// QUICK ACTION FUNCTIONS
// ============================================

export async function getQuickAnalysis(dataType: string, ctx: AIAgentContext): Promise<any> {
  return executeAnalyzeData({ dataType, timeRange: "month" }, ctx);
}

export async function getSystemOverview(ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [
    vendorStats,
    customerStats,
    orderStats,
    inventoryStats,
    poStats,
    workOrderStats,
  ] = await Promise.all([
    db.select().from(vendors),
    db.select().from(customers),
    db.select().from(orders),
    db.select().from(inventory),
    db.select().from(purchaseOrders),
    db.select().from(workOrders),
  ]);

  const activeVendors = vendorStats.filter(v => v.status === "active").length;
  const activeCustomers = customerStats.filter(c => c.status === "active").length;
  const pendingOrders = orderStats.filter(o => o.status === "pending").length;
  const lowStockItems = inventoryStats.filter(i => parseFloat(i.quantity?.toString() || "0") < 10).length;
  const pendingPOs = poStats.filter(po => po.status === "pending" || po.status === "sent").length;
  const inProgressWOs = workOrderStats.filter(wo => wo.status === "in_progress").length;

  return {
    summary: "System Overview",
    vendors: {
      total: vendorStats.length,
      active: activeVendors,
    },
    customers: {
      total: customerStats.length,
      active: activeCustomers,
    },
    orders: {
      total: orderStats.length,
      pending: pendingOrders,
    },
    inventory: {
      totalItems: inventoryStats.length,
      lowStock: lowStockItems,
    },
    procurement: {
      totalPOs: poStats.length,
      pending: pendingPOs,
    },
    production: {
      totalWorkOrders: workOrderStats.length,
      inProgress: inProgressWOs,
    },
  };
}

export async function getPendingActions(ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const pendingTasks = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "pending_approval"))
    .orderBy(desc(aiAgentTasks.createdAt))
    .limit(20);

  return {
    pendingApprovals: pendingTasks.length,
    tasks: pendingTasks,
  };
}

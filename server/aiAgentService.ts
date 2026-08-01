import { invokeLLM, Tool, Message } from "./_core/llm";
import { getDb, createWorkOrder, createFreightRfq } from "./db";
import { sendEmail, formatEmailHtml } from "./_core/email";
import { getValidGoogleToken } from "./routers/middleware";
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
  inboundEmails,
} from "../drizzle/schema";
import { eq, and, like, desc, sql, gte, lte, or, isNull, isNotNull, count, sum, lt, inArray } from "drizzle-orm";

// Roles allowed to have the agent MUTATE ERP data (create POs, change inventory,
// send email, etc.) — mirrors opsProcedure. Reads/Q&A stay open to all roles.
// Because the chat's mode is client-controlled, this server-side check is what
// actually prevents a non-ops user (or scripted client) from driving writes.
const MUTATION_ROLES = ["admin", "ops", "exec"];
function assertCanMutate(ctx: AIAgentContext, action: string): void {
  if (!MUTATION_ROLES.includes(ctx.userRole)) {
    throw new Error(`Not authorized: "${action}" requires an operations, admin, or executive role.`);
  }
}

// ============================================
// AI AGENT SERVICE - Comprehensive ERP Integration
// ============================================

export interface AIAgentContext {
  userId: number;
  userName: string;
  userRole: string;
  companyId?: number;
  // Set when the agent is replaying an already-approved concierge errand, so it
  // executes the plan directly instead of planning (and queuing) a new errand.
  executingErrand?: boolean;
}

export interface AIAgentResponse {
  message: string;
  actions?: AIAgentAction[];
  data?: Record<string, any>;
  suggestions?: string[];
  /** True when `message` is a proposed plan awaiting user approval (plan-first mode). */
  isPlan?: boolean;
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
            enum: ["sales", "inventory", "vendors", "customers", "finances", "orders", "procurement", "production"],
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
  // Google Drive Search
  {
    type: "function",
    function: {
      name: "search_google_drive",
      description: "Search files and documents in the company's Google Drive. Use this to find vendors, products, specs, invoices, contracts, or any business document.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — file name, content, or keyword to search for",
          },
          fileType: {
            type: "string",
            enum: ["all", "spreadsheet", "document", "pdf", "presentation", "folder"],
            description: "Filter by file type",
          },
        },
        required: ["query"],
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
  // Inbound Email (read-only)
  {
    type: "function",
    function: {
      name: "search_inbox",
      description: "Search and list received (inbound) emails in the company inbox. Use this to FIND an email the user is asking about — e.g. 'find the latest email from Acme', 'any emails about invoice 1234?', 'what did the supplier send yesterday?'. Returns matching emails with id, sender, subject, date, category and a short snippet. Call read_email with an id to see the full body. Read-only — safe to use freely.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free text to match against subject, body, and sender" },
          from: { type: "string", description: "Filter by sender name or email address" },
          category: { type: "string", description: "Optional category filter (e.g. invoice, order, vendor, general)" },
          limit: { type: "number", description: "Max results to return (default 20, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_email",
      description: "Read the full contents of a single received (inbound) email by its id (from search_inbox). Returns the sender, subject, date and full body text. Read-only.",
      parameters: {
        type: "object",
        properties: {
          emailId: { type: "number", description: "The inbound email id returned by search_inbox" },
        },
        required: ["emailId"],
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
            enum: ["sales_summary", "inventory_status", "vendor_performance", "customer_analysis", "financial_overview", "production_status", "order_fulfillment"],
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
  // Concierge Errand Delegation
  {
    type: "function",
    function: {
      name: "plan_errand",
      description: "Delegate a multi-step chore/errand the user wants DONE (not a question to answer). Use this when the user asks you to carry out a task that takes several actions or has real-world consequences — e.g. 'chase the overdue invoice from Acme', 'onboard this new vendor and email them the forms', 'follow up with everyone who didn't reply'. Produce a short title, restate the goal, list the concrete steps you'll take, and set a risk level. Low-risk errands run automatically; medium/high-risk errands are sent to the user's approval queue and only run after they approve the plan. Do NOT use this for simple questions or a single trivial action — answer or do those directly.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short human-readable title for the errand" },
          goal: { type: "string", description: "The user's original request, restated clearly" },
          steps: {
            type: "array",
            items: { type: "string" },
            description: "Ordered list of the concrete steps you will take to complete the errand",
          },
          riskLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "low = safe/reversible, runs automatically; medium/high = needs the user to approve the plan first (money movement, external emails, bulk changes, deletes)",
          },
        },
        required: ["title", "goal", "steps", "riskLevel"],
      },
    },
  },
  // Google Calendar Tools
  {
    type: "function",
    function: {
      name: "manage_calendar",
      description: "View upcoming calendar events or create new ones. Use to check availability, schedule meetings, or add reminders.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list_events", "create_event"], description: "Action to perform" },
          summary: { type: "string", description: "Event title (for create)" },
          startDateTime: { type: "string", description: "Start time ISO format (for create)" },
          endDateTime: { type: "string", description: "End time ISO format (for create)" },
          attendees: { type: "array", items: { type: "string" }, description: "Attendee emails (for create)" },
          description: { type: "string", description: "Event description (for create)" },
        },
        required: ["action"],
      },
    },
  },
  // AI-Powered Analytics Tools
  {
    type: "function",
    function: {
      name: "run_ai_analytics",
      description: "Run AI-powered analytics including financial anomaly detection, revenue forecasting, HR attrition prediction, manufacturing yield prediction, legal contract analysis, project risk assessment, EDI anomaly detection, and supplier performance scoring",
      parameters: {
        type: "object",
        properties: {
          analysisType: {
            type: "string",
            enum: [
              "finance_anomalies", "revenue_forecast", "cash_flow_prediction",
              "hr_attrition", "compensation_benchmark", "performance_analysis", "workforce_plan",
              "manufacturing_yield", "quality_forecast", "production_optimization", "predictive_maintenance",
              "contract_analysis", "dispute_prediction", "compliance_check",
              "project_risks", "effort_estimation", "resource_allocation",
              "edi_anomalies", "edi_error_prediction", "supplier_scoring"
            ],
            description: "Type of AI analysis to run",
          },
          entityId: { type: "number", description: "Optional entity ID (contract ID, project ID, etc.)" },
        },
        required: ["analysisType"],
      },
    },
  },
  // CRM Natural Language Query Tool
  {
    type: "function",
    function: {
      name: "query_crm",
      description: "Query the CRM to answer questions about contacts, deals, pipeline, meetings, revenue, and customer relationships. Use for questions like 'What deals are closing this month?', 'Who did I meet with last week?', 'What's our pipeline value?', 'Show me all leads from conferences'",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The natural language question about CRM data" },
        },
        required: ["question"],
      },
    },
  },
  // Natural Language Query Tool for ALL Modules
  {
    type: "function",
    function: {
      name: "query_system",
      description: "Query ANY module in the ERP system using natural language. Use this for questions about work orders, manufacturing, inventory, purchase orders, vendors, cap table, equity, data room, projects, tasks, banking, transactions, reports, copacker operations, invoices, payments, shipments, or any other business data.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The natural language question about any business data" },
          module: {
            type: "string",
            enum: ["inventory", "work_orders", "purchase_orders", "vendors", "customers", "orders", "invoices", "payments", "shipments", "cap_table", "equity", "data_room", "projects", "tasks", "banking", "manufacturing", "copacker", "reports", "employees", "contracts", "general"],
            description: "Which module to query (helps narrow down the data)",
          },
        },
        required: ["question"],
      },
    },
  },
];

// ============================================
// TOOL EXECUTION FUNCTIONS
// ============================================

async function executeSearchGoogleDrive(params: any, ctx: AIAgentContext): Promise<any> {
  try {
    const { accessToken, error: tokenErr } = await getValidGoogleToken(ctx.userId);
    if (tokenErr || !accessToken) {
      return { error: "Google Drive not connected. Go to Settings → Integrations to connect." };
    }

    let query = `fullText contains '${params.query.replace(/'/g, "\\'")}'`;
    if (params.fileType && params.fileType !== "all") {
      const mimeMap: Record<string, string> = {
        spreadsheet: "application/vnd.google-apps.spreadsheet",
        document: "application/vnd.google-apps.document",
        pdf: "application/pdf",
        presentation: "application/vnd.google-apps.presentation",
        folder: "application/vnd.google-apps.folder",
      };
      if (mimeMap[params.fileType]) {
        query += ` and mimeType='${mimeMap[params.fileType]}'`;
      }
    }
    query += " and trashed=false";

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,webViewLink,size)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { error: `Google Drive search failed: ${response.status}` };
    }

    const data = await response.json();
    const files = (data.files || []).map((f: any) => ({
      name: f.name,
      type: f.mimeType?.includes("spreadsheet") ? "Sheet" : f.mimeType?.includes("document") ? "Doc" : f.mimeType?.includes("pdf") ? "PDF" : f.mimeType?.includes("presentation") ? "Slides" : "File",
      modified: f.modifiedTime,
      link: f.webViewLink,
      size: f.size ? `${(parseInt(f.size) / 1024).toFixed(0)} KB` : "—",
    }));

    return {
      results: files,
      count: files.length,
      query: params.query,
      message: files.length > 0
        ? `Found ${files.length} files matching "${params.query}" in Google Drive`
        : `No files found matching "${params.query}" in Google Drive`,
    };
  } catch (e: any) {
    return { error: `Google Drive search failed: ${e.message}` };
  }
}

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
        return sum + (parseFloat(i.quantity?.toString() || "0") * parseFloat((i as any).unitCost?.toString() || "0"));
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
      const pendingInvoices = allInvoices.filter(i => i.status === "draft" || i.status === "sent");
      const overdueInvoices = allInvoices.filter(i =>
        (i.status === "draft" || i.status === "sent") &&
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
      const pendingOrders = allOrders.filter(o => (o.status as string) === "pending");
      const completedOrders = allOrders.filter(o => (o.status as string) === "completed" || o.status === "delivered");

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
      const pendingPOs = allPOs.filter(po => (po.status as string) === "pending" || po.status === "sent");
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

    default:
      throw new Error(`Unknown data type: ${dataType}`);
  }
}

async function executeSendEmail(params: any, ctx: AIAgentContext): Promise<any> {
  assertCanMutate(ctx, "send email");
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
          recipientName = (customer[0] as any).contactName || customer[0].name || "Customer";
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
      fromEmail: 'noreply@system.local',
      subject: params.subject,
      bodyText: params.body,
      status: "sent",
      sentAt: new Date(),
      sentBy: ctx.userId,
    } as any);
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

// ============================================
// INBOUND EMAIL (READ-ONLY)
// ============================================

type InboundEmailRow = typeof inboundEmails.$inferSelect;

// Prefer plain text; fall back to a stripped-down version of the HTML body.
export function extractEmailBody(email: Pick<InboundEmailRow, "bodyText" | "bodyHtml">): string {
  if (email.bodyText && email.bodyText.trim()) return email.bodyText.trim();
  if (email.bodyHtml && email.bodyHtml.trim()) {
    return email.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

// Compact one-line summary of an inbound email for search results.
export function formatInboundSummary(email: Partial<InboundEmailRow>): {
  id: number | undefined;
  from: string;
  subject: string;
  receivedAt: Date | null | undefined;
  category: string | null | undefined;
  priority: string | null | undefined;
  snippet: string;
} {
  const from = email.fromName ? `${email.fromName} <${email.fromEmail}>` : (email.fromEmail || "unknown");
  const snippet = extractEmailBody({ bodyText: email.bodyText ?? null, bodyHtml: email.bodyHtml ?? null }).slice(0, 200);
  return {
    id: email.id,
    from,
    subject: email.subject || "(no subject)",
    receivedAt: email.receivedAt,
    category: email.category,
    priority: email.priority,
    snippet,
  };
}

async function executeSearchInbox(params: any, _ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (typeof params.query === "string" && params.query.trim()) {
    const q = `%${params.query.trim()}%`;
    conditions.push(
      or(
        like(inboundEmails.subject, q),
        like(inboundEmails.bodyText, q),
        like(inboundEmails.fromEmail, q),
        like(inboundEmails.fromName, q),
      ),
    );
  }
  if (typeof params.from === "string" && params.from.trim()) {
    const f = `%${params.from.trim()}%`;
    conditions.push(or(like(inboundEmails.fromEmail, f), like(inboundEmails.fromName, f)));
  }
  if (typeof params.category === "string" && params.category.trim()) {
    conditions.push(eq(inboundEmails.category, params.category.trim() as any));
  }

  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
  let q = db.select().from(inboundEmails);
  if (conditions.length) q = q.where(and(...conditions)) as any;
  const rows = await q.orderBy(desc(inboundEmails.receivedAt)).limit(limit);

  return {
    count: rows.length,
    emails: rows.map(formatInboundSummary),
    hint: rows.length ? "Use read_email with an id to read the full message." : "No matching emails found.",
  };
}

async function executeReadEmail(params: any, _ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const emailId = Number(params.emailId);
  if (!Number.isFinite(emailId)) return { error: "A numeric emailId is required (get it from search_inbox)." };

  const rows = await db.select().from(inboundEmails).where(eq(inboundEmails.id, emailId)).limit(1);
  const email = rows[0];
  if (!email) return { error: `No inbound email found with id ${emailId}.` };

  return {
    id: email.id,
    from: email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail,
    to: email.toEmail,
    subject: email.subject || "(no subject)",
    receivedAt: email.receivedAt,
    category: email.category,
    priority: email.priority,
    body: extractEmailBody(email).slice(0, 8000),
  };
}

async function executeTrackItems(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { trackingType, identifier, action = "status" } = params;

  switch (trackingType) {
    case "inventory": {
      if (identifier) {
        // Query only matching items instead of loading entire table
        const filtered = await db.select().from(inventory).where(
          or(eq(inventory.id, parseInt(identifier) || 0), eq(inventory.productId, parseInt(identifier) || 0))
        );
        return { type: "inventory", items: filtered, action };
      }
      const [totalCount] = await db.select({ count: count() }).from(inventory);
      const items = await db.select().from(inventory).limit(20);
      return { type: "inventory", totalItems: totalCount?.count || 0, items, action };
    }

    case "order": {
      if (identifier) {
        const [order] = await db.select().from(orders).where(
          or(eq(orders.id, parseInt(identifier) || 0), eq(orders.orderNumber, identifier))
        ).limit(1);
        if (order) {
          const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          return { type: "order", order, items, action };
        }
      }
      const [totalCount] = await db.select({ count: count() }).from(orders);
      const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(20);
      return { type: "orders", totalOrders: totalCount?.count || 0, orders: recentOrders, action };
    }

    case "shipment": {
      if (identifier) {
        const [shipment] = await db.select().from(shipments).where(
          or(eq(shipments.id, parseInt(identifier) || 0), eq(shipments.trackingNumber, identifier))
        ).limit(1);
        return { type: "shipment", shipment, action };
      }
      const [totalCount] = await db.select({ count: count() }).from(shipments);
      const recentShipments = await db.select().from(shipments).limit(20);
      return { type: "shipments", totalShipments: totalCount?.count || 0, shipments: recentShipments, action };
    }

    case "purchase_order": {
      if (identifier) {
        const [po] = await db.select().from(purchaseOrders).where(
          or(eq(purchaseOrders.id, parseInt(identifier) || 0), eq(purchaseOrders.poNumber, identifier))
        ).limit(1);
        if (po) {
          const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
          return { type: "purchase_order", purchaseOrder: po, items, action };
        }
      }
      const [totalCount] = await db.select({ count: count() }).from(purchaseOrders);
      const recentPOs = await db.select().from(purchaseOrders).limit(20);
      return { type: "purchase_orders", totalPOs: totalCount?.count || 0, purchaseOrders: recentPOs, action };
    }

    case "work_order": {
      if (identifier) {
        const [wo] = await db.select().from(workOrders).where(
          or(eq(workOrders.id, parseInt(identifier) || 0), eq(workOrders.workOrderNumber, identifier))
        ).limit(1);
        return { type: "work_order", workOrder: wo, action };
      }
      const [totalCount] = await db.select({ count: count() }).from(workOrders);
      const recentWOs = await db.select().from(workOrders).limit(20);
      return { type: "work_orders", totalWOs: totalCount?.count || 0, workOrders: recentWOs, action };
    }

    default:
      throw new Error(`Unknown tracking type: ${trackingType}`);
  }
}

async function executeUpdateInventory(params: any, ctx: AIAgentContext): Promise<any> {
  assertCanMutate(ctx, "update inventory");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { productId, warehouseId, quantity, action, reason, targetWarehouseId } = params;

  // Validate inputs before touching inventory — the model can pass junk.
  const pId = Number(productId);
  const wId = Number(warehouseId);
  const qty = Number(quantity);
  if (!Number.isFinite(pId)) throw new Error("A valid productId is required");
  if (!Number.isFinite(wId)) throw new Error("A valid warehouseId is required");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("A positive numeric quantity is required");

  // Apply a signed delta to one (product, warehouse) cell within a transaction.
  // Rejects any move that would drop a location below zero on-hand.
  const applyDelta = async (tx: any, product: number, warehouse: number, change: number) => {
    // Lock the (product, warehouse) row for the duration of the transaction so
    // concurrent adjustments can't both read the same value and lose an update
    // (or slip past the non-negative check).
    const existing = await tx.select().from(inventory)
      .where(and(eq(inventory.productId, product), eq(inventory.warehouseId, warehouse))).limit(1).for("update");
    if (existing.length > 0) {
      const current = parseFloat(existing[0].quantity as string) || 0;
      const next = current + change;
      if (next < 0) {
        throw new Error(`Insufficient stock: product ${product} at warehouse ${warehouse} has ${current}, cannot apply ${change}`);
      }
      await tx.update(inventory).set({ quantity: next.toString() })
        .where(and(eq(inventory.productId, product), eq(inventory.warehouseId, warehouse)));
    } else {
      if (change < 0) {
        throw new Error(`No stock of product ${product} at warehouse ${warehouse} to remove`);
      }
      await tx.insert(inventory).values({ companyId: ctx.companyId, productId: product, warehouseId: warehouse, quantity: change.toString() });
    }
  };

  // Execute the change directly (live). The approval gate is Plan-first mode.
  if (action === "transfer") {
    const targetId = Number(targetWarehouseId);
    if (!Number.isFinite(targetId)) throw new Error("A valid targetWarehouseId is required for a transfer");
    if (targetId === wId) throw new Error("Source and target warehouses must differ");
    // Both legs in one transaction so a failure can't leave stock decremented
    // at the source without the matching increment at the target.
    await db.transaction(async (tx) => {
      await applyDelta(tx, pId, wId, -qty);
      await applyDelta(tx, pId, targetId, qty);
    });
    return {
      executed: true,
      action,
      message: `Transferred ${qty} units of product ${pId} from warehouse ${wId} to ${targetId}.`,
      details: { productId: pId, fromWarehouseId: wId, toWarehouseId: targetId, quantity: qty },
    };
  }

  // Adjustment: negative for removals, positive otherwise. Same guarded path so
  // it can't drive a location below zero and stamps companyId on new rows.
  const isRemoval = ["remove", "decrease", "subtract", "out", "consume"].includes(String(action).toLowerCase());
  const delta = isRemoval ? -qty : qty;
  await db.transaction(async (tx) => {
    await applyDelta(tx, pId, wId, delta);
  });

  return {
    executed: true,
    action,
    message: `Adjusted inventory for product ${pId} at warehouse ${wId} by ${delta} units${reason ? ` (${reason})` : ""}.`,
    details: { productId: pId, warehouseId: wId, delta },
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
      assertCanMutate(ctx, "create vendor");
      if (!data?.name) throw new Error("Vendor name required");
      const newVendor = await db.insert(vendors).values({
        name: data.name,
        email: data.email,
        phone: data.phone,
        contactName: data.contactName,
        status: data.status || "active",
      } as any).$returningId();
      return { created: true, vendorId: newVendor[0].id };
    }

    case "update": {
      assertCanMutate(ctx, "update vendor");
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
  assertCanMutate(ctx, "create purchase order");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { vendorId, items, notes, expectedDate } = params;

  // Validate vendor
  const vendor = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor[0]) throw new Error("Vendor not found");

  // Normalize + validate line items before writing anything — the model can
  // pass missing/non-numeric values, which must not become "NaN" in the DB.
  const normalizedItems = (Array.isArray(items) ? items : []).map((item: any, idx: number) => {
    const qty = Number(item.quantity);
    const price = Number(item.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Line item ${idx + 1} has an invalid quantity`);
    if (!Number.isFinite(price) || price < 0) throw new Error(`Line item ${idx + 1} has an invalid unit price`);
    return {
      productId: item.productId,
      description: item.description || item.name || "Item",
      qty,
      price,
      lineTotal: qty * price,
    };
  });
  if (normalizedItems.length === 0) throw new Error("A purchase order needs at least one valid line item");

  const subtotal = normalizedItems.reduce((sum, i) => sum + i.lineTotal, 0);
  if (!Number.isFinite(subtotal)) throw new Error("Could not compute a valid order total");

  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

  // Parse the optional expected date; ignore anything unparseable.
  let expected: Date | undefined;
  if (expectedDate) {
    const d = new Date(expectedDate);
    if (!isNaN(d.getTime())) expected = d;
  }

  // Create the PO header + line items atomically, as a draft (the live approval
  // gate is the assistant's Plan-first mode, not a separate approval queue).
  const poId = await db.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrders).values({
      poNumber,
      companyId: ctx.companyId,
      vendorId,
      status: "draft",
      orderDate: new Date(),
      expectedDate: expected,
      subtotal: subtotal.toFixed(2),
      totalAmount: subtotal.toFixed(2),
      currency: "USD",
      notes: notes || "Created by AI assistant",
      createdBy: ctx.userId,
    }).$returningId();

    for (const i of normalizedItems) {
      await tx.insert(purchaseOrderItems).values({
        purchaseOrderId: po.id,
        productId: i.productId,
        description: i.description,
        quantity: i.qty.toString(),
        unitPrice: i.price.toString(),
        totalAmount: i.lineTotal.toFixed(2),
      });
    }
    return po.id;
  });

  return {
    created: true,
    purchaseOrderId: poId,
    poNumber,
    vendorName: vendor[0].name,
    subtotal: subtotal.toFixed(2),
    itemCount: normalizedItems.length,
    status: "draft",
    message: `Created draft purchase order ${poNumber} for ${vendor[0].name} — ${normalizedItems.length} item(s), $${subtotal.toFixed(2)}.`,
  };
}

async function executeManageCopacker(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, copackerId, workOrderData } = params;

  switch (action) {
    case "list": {
      const allVendors = await db.select().from(vendors);
      const copackers = allVendors.filter(v =>
        v.type === "contractor" || v.type === "service"
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
      assertCanMutate(ctx, "create work order");
      if (!workOrderData) throw new Error("Work order data required");
      const { bomId, productId, quantity, unit, priority, dueDate, notes } = workOrderData;
      if (!bomId || !productId || quantity == null) {
        throw new Error("Work order requires bomId, productId, and quantity");
      }

      // Parse an optional due date into scheduledEndDate; ignore if unparseable.
      let scheduledEndDate: Date | undefined;
      if (dueDate) {
        const d = new Date(dueDate);
        if (!isNaN(d.getTime())) scheduledEndDate = d;
      }

      // Create the work order for real, as a draft. Live approval is handled by
      // the assistant's Plan-first mode rather than a separate approval queue.
      const wo = await createWorkOrder({
        companyId: ctx.companyId,
        bomId,
        productId,
        quantity: String(quantity),
        unit: unit || "EA",
        status: "draft",
        priority: priority || "normal",
        scheduledEndDate,
        notes: notes || undefined,
        createdBy: ctx.userId,
      });

      return {
        created: true,
        workOrderId: wo.id,
        workOrderNumber: wo.workOrderNumber,
        copackerId: copackerId ?? null,
        message: `Created work order ${wo.workOrderNumber} (draft) for ${quantity} units.`,
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
        (v as any).category === "copacker" ||
        (v as any).category === "manufacturer"
      );

      return {
        copackers: copackers.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          category: (c as any).category,
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
      assertCanMutate(ctx, "create freight RFQ");
      if (!rfqData?.title) throw new Error("Freight RFQ requires a title");
      // Create the RFQ for real (draft). Live approval is Plan-first mode.
      const rfq = await createFreightRfq({ ...rfqData, status: rfqData.status || "draft", createdById: ctx.userId });
      return {
        created: true,
        freightRfqId: rfq.id,
        rfqNumber: rfq.rfqNumber,
        message: `Created freight RFQ ${rfq.rfqNumber} (${rfqData.status || "draft"}).`,
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
      // Use database WHERE clause instead of loading all orders into memory
      const filteredOrders = await db.select().from(orders)
        .where(and(gte(orders.createdAt, startDate), lte(orders.createdAt, endDate)));

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
      // Use DB aggregation instead of loading entire table
      const [totalCount] = await db.select({ count: count() }).from(inventory);
      const [lowStockCount] = await db.select({ count: count() }).from(inventory)
        .where(lt(sql`CAST(${inventory.quantity} AS DECIMAL)`, 10));
      const items = format === "detailed"
        ? await db.select().from(inventory)
        : await db.select().from(inventory).limit(10);

      return {
        reportType: "inventory_status",
        totalItems: totalCount?.count || 0,
        lowStockItems: lowStockCount?.count || 0,
        items,
      };
    }

    case "vendor_performance": {
      // Use GROUP BY at DB level instead of loading all POs into memory
      const vendorPOStats = await db.select({
        vendorId: purchaseOrders.vendorId,
        totalPOs: count(),
        totalSpent: sum(purchaseOrders.totalAmount),
      }).from(purchaseOrders)
        .groupBy(purchaseOrders.vendorId);

      const vendorIds = vendorPOStats.map(s => s.vendorId).filter((id): id is number => id != null);
      const vendorList = vendorIds.length > 0
        ? await db.select().from(vendors).where(inArray(vendors.id, vendorIds))
        : [];
      const vendorMap = new Map(vendorList.map(v => [v.id, v]));

      const vendorStats = vendorPOStats
        .filter(s => s.vendorId != null)
        .map(s => ({
          vendorId: s.vendorId!,
          vendorName: vendorMap.get(s.vendorId!)?.name || 'Unknown',
          totalPOs: s.totalPOs,
          totalSpent: parseFloat(s.totalSpent || "0").toFixed(2),
        }))
        .sort((a, b) => parseFloat(b.totalSpent) - parseFloat(a.totalSpent));

      return {
        reportType: "vendor_performance",
        vendors: vendorStats,
      };
    }

    case "financial_overview": {
      const allInvoices = await db.select().from(invoices);
      const paidInvoices = allInvoices.filter(i => i.status === "paid");
      const pendingInvoices = allInvoices.filter(i => (i.status as string) === "pending" || i.status === "sent");

      const totalBilled = allInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);
      const totalCollected = paidInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);

      return {
        reportType: "financial_overview",
        totalInvoices: allInvoices.length,
        paidInvoices: paidInvoices.length,
        pendingInvoices: pendingInvoices.length,
        totalBilled: totalBilled.toFixed(2),
        totalCollected: totalCollected.toFixed(2),
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
// CONCIERGE ERRAND PLANNING
// ============================================

// Turn a user chore into a tracked, plan-based errand. Low-risk errands are
// auto-approved (the background scheduler runs them); medium/high-risk errands
// land in the Approval Queue as a plan the user reviews before anything runs.
async function executePlanErrand(params: any, ctx: AIAgentContext): Promise<any> {
  if (ctx.executingErrand) {
    return {
      error: "You are already executing an approved errand. Perform the steps directly with your action tools instead of creating a new errand.",
    };
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Validate/sanitize inputs so we never queue an un-executable errand (empty
  // goal, non-string steps) that would only fail later, after approval.
  const goal = typeof params.goal === "string" ? params.goal.trim() : "";
  if (!goal) {
    return { error: "Cannot plan an errand without a goal — restate the user's request as the goal and try again." };
  }
  const title = typeof params.title === "string" && params.title.trim() ? params.title.trim() : goal;
  const steps = Array.isArray(params.steps)
    ? params.steps.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
    : [];

  const selfRatedRisk = ["low", "medium", "high"].includes(params.riskLevel) ? params.riskLevel : "medium";
  // Server-side backstop: riskLevel is LLM self-rated, so a prompt-influenced
  // model could mark a consequential errand "low" and get it auto-approved.
  // Never auto-run a "low"-rated errand whose goal/steps show real-world side
  // effects (outbound comms, money movement, deletes, bulk changes) — force it
  // into the approval queue instead. Over-triggering only errs toward asking.
  const HIGH_RISK_INDICATORS = /\b(e-?mail|send|reply|message|call|text|refund|pay|payment|wire|transfer|deposit|withdraw|charge|invoic|delet|remov|cancel|terminat|fire|bulk|everyone|all customers|all vendors|purchase order)\b/i;
  const riskText = `${title} ${goal} ${steps.join(" ")}`;
  const riskLevel = selfRatedRisk === "low" && HIGH_RISK_INDICATORS.test(riskText) ? "medium" : selfRatedRisk;
  // Low-risk errands run automatically; medium/high-risk wait for plan approval.
  const requiresApproval = riskLevel !== "low";
  const priority = riskLevel === "high" ? "high" : riskLevel === "low" ? "low" : "medium";

  const taskData = {
    title,
    goal,
    steps,
    riskLevel,
    // Carried through so the executor can act on behalf of the submitting user.
    submittedByUserId: ctx.userId,
    userName: ctx.userName,
    userRole: ctx.userRole,
    companyId: ctx.companyId,
  };

  const task = await db.insert(aiAgentTasks).values({
    companyId: ctx.companyId ?? null,
    taskType: "concierge_errand",
    status: requiresApproval ? "pending_approval" : "approved",
    priority,
    taskData: JSON.stringify(taskData),
    aiReasoning: title || goal,
    aiConfidence: "85.00", // aiConfidence is a 0-100 percentage, not a 0-1 fraction
    requiresApproval,
  }).$returningId();

  await db.insert(aiAgentLogs).values({
    taskId: task[0].id,
    action: "errand_planned",
    status: "info",
    message: `Concierge errand ${requiresApproval ? "queued for approval" : "auto-approved (low risk)"} for ${ctx.userName}`,
    details: JSON.stringify({ title: taskData.title, riskLevel, steps: taskData.steps }),
  });

  return {
    errandCreated: true,
    taskId: task[0].id,
    title: taskData.title,
    riskLevel,
    steps: taskData.steps,
    requiresApproval,
    status: requiresApproval ? "pending_approval" : "approved",
    message: requiresApproval
      ? "Plan ready for your approval — review the steps and approve to run it now."
      : "Low-risk errand — approved automatically and running now.",
  };
}

// ============================================
// CALENDAR TOOL EXECUTION
// ============================================

async function executeManageCalendar(params: any, ctx: AIAgentContext): Promise<any> {
  const { accessToken, error: tokenErr } = await getValidGoogleToken(ctx.userId);
  if (tokenErr || !accessToken) return { error: "Google Calendar not connected" };

  const { getCalendarEvents, createCalendarEvent } = await import("./calendarService");

  if (params.action === "list_events") {
    const events = await getCalendarEvents(accessToken);
    return {
      events: events.items
        ?.map((e: any) => ({
          title: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          attendees: e.attendees?.map((a: any) => a.email),
          location: e.location,
        }))
        .slice(0, 10),
    };
  }

  if (params.action === "create_event") {
    const event = await createCalendarEvent(accessToken, {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startDateTime },
      end: { dateTime: params.endDateTime },
      attendees: params.attendees?.map((e: string) => ({ email: e })),
    });
    return { created: true, eventId: event.id, link: event.htmlLink };
  }

  return { error: "Unknown calendar action" };
}

async function executeQueryCrm(params: any, _ctx: AIAgentContext): Promise<any> {
  const dbModule = await import("./db");

  // Gather all CRM data
  const [contacts, deals, pipelines] = await Promise.all([
    dbModule.getCrmContacts?.() || [],
    dbModule.getCrmDeals?.() || [],
    dbModule.getCrmPipelines?.() || [],
  ]);

  // Use AI to answer the question based on CRM data
  const { invokeLLM } = await import("./_core/llm");
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a CRM assistant. Answer questions about contacts, deals, and pipeline using this data. Be concise and specific.

Contacts (${(contacts as any[]).length}):
${(contacts as any[]).slice(0, 30).map((c: any) => `- ${c.fullName || c.firstName}: ${c.email || ''} | ${c.organization || ''} | ${c.jobTitle || ''} | Source: ${c.source || ''}`).join('\n')}

Deals (${(deals as any[]).length}):
${(deals as any[]).slice(0, 30).map((d: any) => `- ${d.name}: Stage=${d.stage} | Amount=$${d.amount || 0} | Source=${d.source || ''}`).join('\n')}

Pipelines (${(pipelines as any[]).length}):
${(pipelines as any[]).slice(0, 10).map((p: any) => `- ${p.name}: Type=${p.type}`).join('\n')}

Answer the user's question based on this data. If specific data isn't available, say so.`
      },
      { role: "user", content: params.question },
    ],
  });

  const answer = response.choices?.[0]?.message?.content;
  return {
    answer: typeof answer === 'string' ? answer : 'Unable to query CRM data',
    contactCount: (contacts as any[]).length,
    dealCount: (deals as any[]).length,
  };
}

async function executeQuerySystem(params: any, ctx: AIAgentContext): Promise<any> {
  const dbModule = await import("./db");
  const module = params.module || "general";

  // Gather data based on module
  let contextData = "";

  try {
    switch (module) {
      case "inventory": {
        const inventory = await dbModule.getInventory();
        const warehouses = await dbModule.getWarehouses();
        contextData = `Inventory (${inventory.length} items):\n${inventory.slice(0, 50).map((i: any) => `- ${i.product?.name || i.sku || 'Item'}: Qty=${i.quantity}, Reserved=${i.reservedQuantity || 0}, Location=${i.warehouse?.name || 'N/A'}`).join('\n')}\n\nWarehouses: ${warehouses.map((w: any) => w.name).join(', ')}`;
        break;
      }
      case "work_orders":
      case "manufacturing": {
        const workOrders = await dbModule.getWorkOrders();
        contextData = `Work Orders (${workOrders.length}):\n${workOrders.slice(0, 30).map((wo: any) => `- ${wo.workOrderNumber}: ${wo.product?.name || 'Product'} | Status=${wo.status} | Qty=${wo.quantity} | Due=${wo.scheduledEndDate || 'N/A'}`).join('\n')}`;
        break;
      }
      case "purchase_orders": {
        const pos = await dbModule.getPurchaseOrders();
        contextData = `Purchase Orders (${pos.length}):\n${pos.slice(0, 30).map((po: any) => `- ${po.poNumber}: Vendor=${po.vendor?.name || 'N/A'} | Total=$${po.totalAmount} | Status=${po.status} | Date=${po.orderDate}`).join('\n')}`;
        break;
      }
      case "vendors": {
        const vendors = await dbModule.getVendors();
        contextData = `Vendors (${vendors.length}):\n${vendors.slice(0, 30).map((v: any) => `- ${v.name}: Email=${v.email || 'N/A'} | Type=${v.type || 'supplier'} | Terms=${v.paymentTerms || 'N/A'} days`).join('\n')}`;
        break;
      }
      case "customers": {
        const customers = await dbModule.getCustomers();
        contextData = `Customers (${customers.length}):\n${customers.slice(0, 30).map((c: any) => `- ${c.name}: Email=${c.email || 'N/A'} | Phone=${c.phone || 'N/A'}`).join('\n')}`;
        break;
      }
      case "orders": {
        const orders = await dbModule.getOrders();
        contextData = `Orders (${orders.length}):\n${orders.slice(0, 30).map((o: any) => `- ${o.orderNumber}: Customer=${o.customer?.name || 'N/A'} | Total=$${o.totalAmount} | Status=${o.status}`).join('\n')}`;
        break;
      }
      case "invoices": {
        const invoices = await dbModule.getInvoices();
        contextData = `Invoices (${invoices.length}):\n${invoices.slice(0, 30).map((i: any) => `- ${i.invoiceNumber}: $${i.totalAmount} | Status=${i.status} | Due=${i.dueDate || 'N/A'}`).join('\n')}`;
        break;
      }
      case "payments": {
        const payments = await dbModule.getPayments();
        contextData = `Payments (${payments.length}):\n${payments.slice(0, 30).map((p: any) => `- $${p.amount} | Method=${p.paymentMethod || 'N/A'} | Date=${p.paymentDate || 'N/A'}`).join('\n')}`;
        break;
      }
      case "shipments": {
        const shipments = await dbModule.getShipments();
        contextData = `Shipments (${shipments.length}):\n${shipments.slice(0, 30).map((s: any) => `- ${s.trackingNumber || 'No tracking'}: Status=${s.status} | Carrier=${s.carrier || 'N/A'}`).join('\n')}`;
        break;
      }
      case "cap_table":
      case "equity": {
        const stakeholders = await (dbModule as any).getStakeholders?.() || [];
        const grants = await (dbModule as any).getEquityGrants?.() || [];
        const shareClasses = await (dbModule as any).getShareClasses?.() || [];
        contextData = `Share Classes: ${shareClasses.map((sc: any) => `${sc.name} (${sc.type})`).join(', ')}\n\nStakeholders (${stakeholders.length}):\n${stakeholders.slice(0, 30).map((s: any) => `- ${s.name}: Type=${s.type} | Email=${s.email || 'N/A'}`).join('\n')}\n\nGrants (${grants.length}):\n${grants.slice(0, 30).map((g: any) => `- Stakeholder=${g.stakeholderId} | Shares=${g.shares} | Type=${g.grantType} | Status=${g.status} | Vested=${g.sharesVested || 0}`).join('\n')}`;
        break;
      }
      case "data_room": {
        const rooms = await dbModule.getDataRooms();
        contextData = `Data Rooms (${rooms.length}):\n${rooms.map((r: any) => `- ${r.name}: Status=${r.status} | Visitors=${r.visitorCount || 0}`).join('\n')}`;
        // Also get visitors
        try {
          for (const room of rooms.slice(0, 3)) {
            const visitors = await dbModule.getDataRoomVisitors(room.id);
            if (visitors.length > 0) {
              contextData += `\n\nVisitors for "${room.name}": ${visitors.slice(0, 10).map((v: any) => `${v.name || v.email} (${v.lastViewedAt || v.createdAt})`).join(', ')}`;
            }
          }
        } catch {}
        break;
      }
      case "projects":
      case "tasks": {
        const projects = await dbModule.getProjects();
        contextData = `Projects (${projects.length}):\n${projects.slice(0, 20).map((p: any) => `- ${p.name}: Status=${p.status} | Priority=${p.priority || 'N/A'}`).join('\n')}`;
        // Get tasks
        try {
          const tasks = await dbModule.getAllProjectTasks?.();
          if (tasks) {
            contextData += `\n\nTasks (${tasks.length}):\n${tasks.slice(0, 30).map((t: any) => `- ${t.name}: Status=${t.status} | Priority=${t.priority || 'N/A'} | Due=${t.dueDate || 'N/A'} | Project=${t.projectId}`).join('\n')}`;
          }
        } catch {}
        break;
      }
      case "banking": {
        const transactions = await (dbModule as any).getBankTransactions?.() || [];
        contextData = `Bank Transactions (${transactions.length}):\n${transactions.slice(0, 30).map((t: any) => `- ${t.date}: ${t.type} $${t.amount} | ${t.counterpartyName || t.description} | Category=${t.category || 'uncategorized'}`).join('\n')}`;
        break;
      }
      case "copacker": {
        try {
          const invoices = await (dbModule as any).getCopackerInvoices?.() || [];
          const updates = await (dbModule as any).getCopackerInventoryUpdates?.() || [];
          contextData = `Copacker Invoices: ${invoices.length}\nInventory Updates: ${updates.length}`;
          if (invoices.length) {
            contextData += `\n${invoices.slice(0, 10).map((i: any) => `- Invoice ${i.invoiceNumber}: $${i.totalAmount} | Status=${i.status}`).join('\n')}`;
          }
        } catch { contextData = "Copacker data not available"; }
        break;
      }
      case "employees": {
        const employees = await dbModule.getEmployees();
        contextData = `Employees (${employees.length}):\n${employees.slice(0, 30).map((e: any) => `- ${e.firstName} ${e.lastName}: ${e.jobTitle || 'N/A'} | Dept=${e.departmentId || 'N/A'} | Status=${e.status || 'active'}`).join('\n')}`;
        break;
      }
      case "contracts": {
        const contracts = await dbModule.getContracts();
        contextData = `Contracts (${contracts.length}):\n${contracts.slice(0, 20).map((c: any) => `- ${c.title}: Type=${c.type} | Status=${c.status} | Value=$${c.value || 'N/A'}`).join('\n')}`;
        break;
      }
      case "reports":
      default: {
        // General query - gather summary data from multiple modules
        const [orders, invoices, customers, vendors, employees, inventory, pos] = await Promise.all([
          dbModule.getOrders(), dbModule.getInvoices(), dbModule.getCustomers(),
          dbModule.getVendors(), dbModule.getEmployees(), dbModule.getInventory(),
          dbModule.getPurchaseOrders(),
        ]);
        contextData = `System Summary:
- Orders: ${orders.length}
- Invoices: ${invoices.length} (Paid: ${invoices.filter((i: any) => i.status === 'paid').length}, Overdue: ${invoices.filter((i: any) => i.status === 'overdue').length})
- Customers: ${customers.length}
- Vendors: ${vendors.length}
- Employees: ${employees.length}
- Inventory items: ${inventory.length}
- Purchase Orders: ${pos.length} (Open: ${pos.filter((p: any) => ['draft','sent','confirmed'].includes(p.status)).length})
- Total Revenue: $${invoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0).toLocaleString()}`;
        break;
      }
    }
  } catch (e: any) {
    contextData = `Error gathering ${module} data: ${e.message}`;
  }

  // Use AI to answer the question
  const { invokeLLM: invokeLLMForQuery } = await import("./_core/llm");
  const response = await invokeLLMForQuery({
    messages: [
      {
        role: "system",
        content: `You are an ERP assistant for Superhumn Inc. Answer the user's question based on this data. Be concise, specific, and use numbers when available. If data is limited, say so.\n\n${contextData}`
      },
      { role: "user", content: params.question },
    ],
  });

  const answer = response.choices?.[0]?.message?.content;
  return {
    answer: typeof answer === 'string' ? answer : 'Unable to query system data',
    module,
    dataPoints: contextData.split('\n').length,
  };
}

// ============================================
// TOOL EXECUTION DISPATCHER
// ============================================

async function executeTool(toolName: string, params: any, ctx: AIAgentContext): Promise<any> {
  switch (toolName) {
    case "search_google_drive":
      return executeSearchGoogleDrive(params, ctx);
    case "analyze_data":
      return executeAnalyzeData(params, ctx);
    case "send_email":
      return executeSendEmail(params, ctx);
    case "draft_email":
      return executeDraftEmail(params, ctx);
    case "search_inbox":
      return executeSearchInbox(params, ctx);
    case "read_email":
      return executeReadEmail(params, ctx);
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
    case "plan_errand":
      return executePlanErrand(params, ctx);
    case "run_ai_analytics":
      return executeRunAiAnalytics(params, ctx);
    case "manage_calendar":
      return executeManageCalendar(params, ctx);
    case "query_crm":
      return executeQueryCrm(params, ctx);
    case "query_system":
      return executeQuerySystem(params, ctx);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function executeRunAiAnalytics(params: any, ctx: AIAgentContext): Promise<any> {
  const { analysisType, entityId } = params;
  const companyId = ctx.companyId;

  switch (analysisType) {
    case "finance_anomalies": {
      const { detectFinancialAnomalies } = await import("./financeAiService");
      return detectFinancialAnomalies({ companyId });
    }
    case "revenue_forecast": {
      const { forecastRevenue } = await import("./financeAiService");
      return forecastRevenue({ companyId });
    }
    case "cash_flow_prediction": {
      const { predictCashFlow } = await import("./financeAiService");
      return predictCashFlow({ companyId });
    }
    case "hr_attrition": {
      const { predictAttrition } = await import("./hrAiService");
      return predictAttrition({ companyId });
    }
    case "compensation_benchmark": {
      const { benchmarkCompensation } = await import("./hrAiService");
      return benchmarkCompensation({ companyId });
    }
    case "performance_analysis": {
      const { analyzePerformance } = await import("./hrAiService");
      return analyzePerformance({ companyId });
    }
    case "workforce_plan": {
      const { planWorkforce } = await import("./hrAiService");
      return planWorkforce({ companyId });
    }
    case "manufacturing_yield": {
      const { predictYield } = await import("./manufacturingAiService");
      return predictYield();
    }
    case "quality_forecast": {
      const { forecastQuality } = await import("./manufacturingAiService");
      return forecastQuality();
    }
    case "production_optimization": {
      const { optimizeProduction } = await import("./manufacturingAiService");
      return optimizeProduction();
    }
    case "predictive_maintenance": {
      const { predictMaintenance } = await import("./manufacturingAiService");
      return predictMaintenance();
    }
    case "contract_analysis": {
      if (!entityId) return { error: "contractId required for contract analysis" };
      const { analyzeContract } = await import("./legalAiService");
      return analyzeContract({ contractId: entityId });
    }
    case "dispute_prediction": {
      const { predictDisputes } = await import("./legalAiService");
      return predictDisputes({ companyId });
    }
    case "compliance_check": {
      const { checkCompliance } = await import("./legalAiService");
      return checkCompliance({ companyId });
    }
    case "project_risks": {
      const { predictProjectRisks } = await import("./projectsAiService");
      return predictProjectRisks(entityId ? { companyId, projectId: entityId } : { companyId });
    }
    case "effort_estimation": {
      if (!entityId) return { error: "projectId required for effort estimation" };
      const { estimateEffort } = await import("./projectsAiService");
      return estimateEffort({ projectId: entityId });
    }
    case "resource_allocation": {
      const { optimizeResourceAllocation } = await import("./projectsAiService");
      return optimizeResourceAllocation({ companyId });
    }
    case "edi_anomalies": {
      const { detectEdiAnomalies } = await import("./ediAiService");
      return detectEdiAnomalies();
    }
    case "edi_error_prediction": {
      const { predictEdiErrors } = await import("./ediAiService");
      return predictEdiErrors();
    }
    case "supplier_scoring": {
      const { scoreSuppliers } = await import("./supplierScoringService");
      return scoreSuppliers({ companyId });
    }
    default:
      return { error: `Unknown analysis type: ${analysisType}` };
  }
}

// ============================================
// MAIN AI AGENT FUNCTION
// ============================================

/**
 * Plan-first mode: produce a concrete, human-readable plan of what the agent
 * WOULD do to fulfill the request — without taking any action. The user reviews
 * it and, if they approve, the plan is passed back to processAIAgentRequest to
 * execute. Web search is allowed (read-only) so the plan can name real details
 * (e.g. a vendor's actual address); no ERP write tools are exposed here, so
 * nothing can be created, changed, or sent during planning.
 */
export async function planAIAgentRequest(
  message: string,
  conversationHistory: Message[],
  ctx: AIAgentContext
): Promise<AIAgentResponse> {
  const systemPrompt = `You are the planning half of an AI assistant for the Superhumn ERP system. The user has made a request. Your job is to lay out EXACTLY what you would do to fulfill it, so the user can approve before anything happens.

Rules:
- Do NOT take any action. This is a preview only — nothing you describe has happened yet.
- You may use the web_search tool to ground the plan in real facts (e.g. a real company's name, address, phone, website). Use it when the request references a real-world entity.
- Produce a short, concrete, numbered plan. For each step, say specifically what record you would create/update/delete or what message you would send, with the actual values you'd use (names, addresses, amounts, recipients) wherever you can determine them.
- Call out anything that changes data or contacts a real person (creating records, sending emails/SMS, placing orders) clearly.
- If you're missing a detail you genuinely cannot determine, list it under "I'll need from you:".
- Keep it tight. End with one line: "Approve to run this, or tell me what to change."

User's role: ${ctx.userRole}. User: ${ctx.userName}.`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message },
  ];

  let plan = "";
  try {
    const response = await invokeLLM({ messages, webSearch: true, toolChoice: "auto", maxTokens: 1500 });
    const content = response.choices?.[0]?.message?.content;
    plan = typeof content === "string" ? content : "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Only retry without web search when the endpoint specifically rejected the
    // web_search tool. For any other failure (auth, rate limits, bad payload,
    // network) rethrow — retrying would mask the real error.
    if (!/web[_ ]?search/i.test(msg)) {
      throw err;
    }
    const response = await invokeLLM({ messages, maxTokens: 1500 });
    const content = response.choices?.[0]?.message?.content;
    plan = typeof content === "string" ? content : "";
  }

  return {
    message: plan || "I couldn't draft a plan for that. Try rephrasing the request.",
    isPlan: true,
  };
}

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

  const systemPrompt = `You are an AI assistant for the Superhumn ERP system. You have FULL access to create, read, update, and delete all data in the system. You can perform ANY operation the user requests. Use the available tools to take action directly.

Your capabilities include:

1. **Purchase Orders**: Create new POs, approve POs, send POs to vendors, update PO status, and track PO fulfillment.
2. **Invoices**: Create invoices, send invoices to customers, record payments against invoices, and manage invoice status.
3. **Products & Inventory**: Create new products, update stock levels, transfer inventory between warehouses, adjust quantities, and track inventory movements.
4. **Vendors & Suppliers**: Create new vendors, update vendor information, evaluate vendor performance, and manage vendor relationships.
5. **Customers**: Create new customers, update customer records, view order history, and manage customer relationships.
6. **Sales Orders**: Create new orders, update order status, cancel orders, and fulfill orders.
7. **Work Orders & Manufacturing**: Create work orders, start production, complete work orders, and track manufacturing progress.
8. **Shipments & Freight**: Create shipments, book freight, create RFQs for carriers, get quotes, and track shipment status.
9. **BOMs & Recipes**: Create and modify bills of materials and recipes for manufacturing.
10. **Co-packers**: Create work orders for contract manufacturers, track co-packer production, and manage co-packer relationships.
11. **Email & Communication**: Send emails to vendors, customers, or team members. Draft professional emails for review. Follow up on outstanding items. Search and read the received (inbound) email inbox with search_inbox / read_email to find or reference a message the user asks about (e.g. "find the latest email from Acme").
12. **Reports & Analytics**: Generate business reports, analyze sales trends, forecast demand, detect anomalies, and provide actionable insights.
13. **Tasks & Approvals**: Create tasks, approve or reject pending items, and manage workflow approvals.
14. **Web research**: You have a live web_search tool. Use it to look up real-world information that isn't in the ERP — a company's real contact details, address, and website; vendors/suppliers; current market prices; industry data; news. Prefer official sources and don't fabricate details you could verify by searching.

CRITICAL BEHAVIOR RULES:
1. When a user asks you to create something, DO IT directly. Never tell them to do it manually.
2. If required data is missing (e.g., no vendor exists), CREATE the missing entity first, then proceed with the original request. Ask the user only for info you truly cannot guess (e.g., "What vendor should I use?" or "What's the unit price?"). When a user names a real company (e.g. "add BCW as a warehouse vendor"), FIRST use web_search to find its real details (address, phone, website), then create the record with those details instead of asking the user to type them.
3. If there are zero vendors/products/customers, that's fine — create them as part of fulfilling the request. For example, if the user says "create a PO for 5000kg mushrooms" and there's no vendor, ask "Which vendor should I create this PO for? And what's the unit price per kg?" Then create the vendor AND the PO.
4. NEVER list steps for the user to follow. NEVER say "you need to first..." — just do it or ask for the specific missing detail.
5. Use sensible defaults: auto-generate SKUs, use today's date, set status to "draft", etc.
6. Be concise. Don't explain what you're doing — just do it and confirm the result.

DELEGATED ERRANDS (concierge mode):
- Tell apart a QUESTION or single trivial action ("how many orders shipped today?", "mark PO-123 approved") from a CHORE the user wants carried out for them ("chase the overdue invoice from Acme", "onboard this vendor and email them the forms", "follow up with everyone who hasn't replied"). Answer questions and do single trivial actions directly, as above.
- For a multi-step chore with real-world side effects, call plan_errand with a title, the restated goal, an ordered list of concrete steps, and a riskLevel. Low-risk (safe/reversible) errands run automatically; medium/high-risk errands (money movement, outbound emails, bulk changes, deletes) are presented to the user for approval right there in the chat and run only after they approve the plan.
- After calling plan_errand, briefly tell the user the plan is ready and ask them to approve it below to run it now (or that a low-risk errand is already running) — do NOT perform the steps yourself in that same turn; execution happens when they approve.

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
- When a user asks to create something, call the appropriate tool immediately. Do not suggest they do it manually.
- For sensitive operations (large bulk changes, deletes), confirm with the user before proceeding.
- Provide clear, actionable responses.
- When analyzing data, provide insights and recommendations.
- Format currency values with $ symbol and 2 decimal places.
- When listing items, limit to 10-20 unless more are requested.
- Be proactive in suggesting relevant actions based on the data.

You can query ANY module in the system using the query_system tool. When a user asks about data in any module (inventory, work orders, POs, cap table, data room, projects, banking, etc.), use the query_system tool to fetch the data and answer their question.

Examples:
- "What work orders are in progress?" → query_system(question, module="work_orders")
- "Show me overdue POs" → query_system(question, module="purchase_orders")
- "What's my cap table breakdown?" → query_system(question, module="cap_table")
- "Who viewed my data room this week?" → query_system(question, module="data_room")
- "What tasks are overdue?" → query_system(question, module="tasks")
- "How many employees do we have?" → query_system(question, module="employees")
- "Show me all contracts" → query_system(question, module="contracts")
- "What's our banking activity?" → query_system(question, module="banking")
- "Give me an overview of the business" → query_system(question, module="general")`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message },
  ];

  const actions: AIAgentAction[] = [];
  let finalResponse = "";
  let data: Record<string, any> = {};
  let iterations = 0;
  const maxIterations = 8;
  // Let the agent look things up online (real companies, vendors, prices,
  // addresses, etc.) in addition to querying the ERP, so requests like
  // "add BCW as a warehouse vendor" resolve from real public data. If the
  // configured LLM endpoint doesn't support server-side web search, we disable
  // it and carry on rather than failing the whole request.
  let webSearchEnabled = true;

  // Iterative tool calling loop
  while (iterations < maxIterations) {
    iterations++;

    let response;
    try {
      response = await invokeLLM({
        messages,
        tools: AI_TOOLS,
        toolChoice: "auto",
        ...(webSearchEnabled ? { webSearch: true } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only disable web search when the endpoint specifically rejected the
      // web_search tool; other failures (invalid payload, bad model, auth, rate
      // limits) should surface, not be masked by a silent retry.
      if (webSearchEnabled && /web[_ ]?search/i.test(msg)) {
        webSearchEnabled = false;
        response = await invokeLLM({
          messages,
          tools: AI_TOOLS,
          toolChoice: "auto",
        });
      } else {
        throw err;
      }
    }

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

  // Default suggestions if none generated
  if (suggestions.length === 0) {
    suggestions.push("Analyze sales data");
    suggestions.push("Check inventory status");
    suggestions.push("View pending approvals");
    suggestions.push("Generate a business report");
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
  const pendingOrders = orderStats.filter(o => (o.status as string) === "pending").length;
  const lowStockItems = inventoryStats.filter(i => parseFloat(i.quantity?.toString() || "0") < 10).length;
  const pendingPOs = poStats.filter(po => (po.status as string) === "pending" || po.status === "sent").length;
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

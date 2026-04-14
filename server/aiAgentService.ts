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
} from "../drizzle/schema";
import { eq, and, like, desc, sql, gte, lte, or, isNull, isNotNull, count, sum, lt, inArray } from "drizzle-orm";

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
    const dbModule = await import("./db");
    const token = await dbModule.getGoogleOAuthTokenByUserId(ctx.userId);
    if (!token?.accessToken) {
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
      headers: { Authorization: `Bearer ${token.accessToken}` },
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
        status: data.status || "active",
      } as any).$returningId();
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
// CALENDAR TOOL EXECUTION
// ============================================

async function executeManageCalendar(params: any, ctx: AIAgentContext): Promise<any> {
  const dbModule = await import("./db");
  const token = await dbModule.getGoogleOAuthTokenByUserId(ctx.userId);
  if (!token?.accessToken) return { error: "Google Calendar not connected" };

  const { getCalendarEvents, createCalendarEvent } = await import("./calendarService");

  if (params.action === "list_events") {
    const events = await getCalendarEvents(token.accessToken);
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
    const event = await createCalendarEvent(token.accessToken, {
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
11. **Email & Communication**: Send emails to vendors, customers, or team members. Draft professional emails for review. Follow up on outstanding items.
12. **Reports & Analytics**: Generate business reports, analyze sales trends, forecast demand, detect anomalies, and provide actionable insights.
13. **Tasks & Approvals**: Create tasks, approve or reject pending items, and manage workflow approvals.

CRITICAL BEHAVIOR RULES:
1. When a user asks you to create something, DO IT directly. Never tell them to do it manually.
2. If required data is missing (e.g., no vendor exists), CREATE the missing entity first, then proceed with the original request. Ask the user only for info you truly cannot guess (e.g., "What vendor should I use?" or "What's the unit price?").
3. If there are zero vendors/products/customers, that's fine — create them as part of fulfilling the request. For example, if the user says "create a PO for 5000kg mushrooms" and there's no vendor, ask "Which vendor should I create this PO for? And what's the unit price per kg?" Then create the vendor AND the PO.
4. NEVER list steps for the user to follow. NEVER say "you need to first..." — just do it or ask for the specific missing detail.
5. Use sensible defaults: auto-generate SKUs, use today's date, set status to "draft", etc.
6. Be concise. Don't explain what you're doing — just do it and confirm the result.

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

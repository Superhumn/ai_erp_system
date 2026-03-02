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

1. **Analyze Data**: Query and analyze business data including sales, inventory, vendors, customers, finances, orders, procurement, and production.

2. **Send Emails**: Send emails to vendors, customers, or team members. You can also draft emails for review.

3. **Track Items**: Track inventory, orders, shipments, purchase orders, and work orders.

4. **Manage Suppliers/Vendors**: Create, update, search vendors, view vendor performance, and create purchase orders.

5. **Manage Co-packers**: List co-packers, create work orders for contract manufacturing, and track production.

6. **Manage Customers**: Create, update, search customers, and view order history.

7. **Manage Orders**: View and track sales orders.

8. **Manage Freight**: Create RFQs, get quotes, book shipments, and track freight.

9. **Generate Reports**: Create various business reports.

10. **Create Tasks**: Create tasks that require approval before execution.

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

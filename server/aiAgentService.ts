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
  invoiceItems,
  freightRfqs,
  freightQuotes,
  freightBookings,
  freightCarriers,
  shipments,
  workOrders,
  billOfMaterials,
  bomComponents,
  aiAgentTasks,
  aiAgentLogs,
  sentEmails,
  employees,
  contracts,
  warehouses,
  payments,
  transactions,
  productionBatches,
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

  // Product Management Tools
  {
    type: "function",
    function: {
      name: "manage_product",
      description: "Create, update, search, or get information about products in the catalog",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "delete"],
            description: "Action to perform",
          },
          productId: { type: "number", description: "Product ID for get/update/delete" },
          data: {
            type: "object",
            description: "Product data for create/update",
            properties: {
              name: { type: "string" },
              sku: { type: "string" },
              category: { type: "string" },
              unitPrice: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
            },
          },
          searchQuery: { type: "string", description: "Search query" },
        },
        required: ["action"],
      },
    },
  },
  // Raw Material Management Tools
  {
    type: "function",
    function: {
      name: "manage_raw_material",
      description: "Create, update, search, or get information about raw materials",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "delete"],
            description: "Action to perform",
          },
          materialId: { type: "number", description: "Raw material ID" },
          data: {
            type: "object",
            description: "Raw material data for create/update",
            properties: {
              name: { type: "string" },
              sku: { type: "string" },
              unit: { type: "string" },
              category: { type: "string" },
              unitCost: { type: "string" },
              description: { type: "string" },
              reorderPoint: { type: "string" },
              reorderQuantity: { type: "string" },
            },
          },
          searchQuery: { type: "string", description: "Search query" },
        },
        required: ["action"],
      },
    },
  },
  // Invoice Management Tools
  {
    type: "function",
    function: {
      name: "manage_invoice",
      description: "Create, update, search, or manage invoices including marking as paid or void",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "void", "mark_paid"],
            description: "Action to perform",
          },
          invoiceId: { type: "number", description: "Invoice ID" },
          data: {
            type: "object",
            description: "Invoice data for create/update",
            properties: {
              customerId: { type: "number" },
              orderId: { type: "number" },
              dueDate: { type: "string" },
              notes: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    quantity: { type: "number" },
                    unitPrice: { type: "number" },
                  },
                },
              },
            },
          },
          searchQuery: { type: "string", description: "Search query" },
        },
        required: ["action"],
      },
    },
  },
  // BOM (Bill of Materials) Management Tools
  {
    type: "function",
    function: {
      name: "manage_bom",
      description: "Create, update, or manage bills of materials and their components",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "add_component", "remove_component"],
            description: "Action to perform",
          },
          bomId: { type: "number", description: "BOM ID" },
          data: {
            type: "object",
            description: "BOM data for create/update",
            properties: {
              productId: { type: "number" },
              name: { type: "string" },
              batchSize: { type: "string" },
              batchUnit: { type: "string" },
              notes: { type: "string" },
            },
          },
          componentData: {
            type: "object",
            description: "Component data for add/remove",
            properties: {
              rawMaterialId: { type: "number" },
              productId: { type: "number" },
              name: { type: "string" },
              quantity: { type: "string" },
              unit: { type: "string" },
            },
          },
          componentId: { type: "number", description: "Component ID for removal" },
        },
        required: ["action"],
      },
    },
  },
  // Work Order Management Tools
  {
    type: "function",
    function: {
      name: "manage_work_order",
      description: "Create, update, start, complete, or cancel work orders for manufacturing",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "start", "complete", "cancel"],
            description: "Action to perform",
          },
          workOrderId: { type: "number", description: "Work order ID" },
          data: {
            type: "object",
            description: "Work order data",
            properties: {
              bomId: { type: "number" },
              productId: { type: "number" },
              quantity: { type: "string" },
              priority: { type: "string" },
              notes: { type: "string" },
              dueDate: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // Shipment Management Tools
  {
    type: "function",
    function: {
      name: "manage_shipment",
      description: "Create, update, track, or manage shipments and deliveries",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "track", "mark_delivered"],
            description: "Action to perform",
          },
          shipmentId: { type: "number", description: "Shipment ID" },
          data: {
            type: "object",
            description: "Shipment data",
            properties: {
              orderId: { type: "number" },
              trackingNumber: { type: "string" },
              carrier: { type: "string" },
              status: { type: "string" },
              shippedDate: { type: "string" },
              expectedDeliveryDate: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // Warehouse Management Tools
  {
    type: "function",
    function: {
      name: "manage_warehouse",
      description: "Create, update, or get information about warehouses and storage locations",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "inventory_levels"],
            description: "Action to perform",
          },
          warehouseId: { type: "number", description: "Warehouse ID" },
          data: {
            type: "object",
            description: "Warehouse data",
            properties: {
              name: { type: "string" },
              code: { type: "string" },
              address: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              country: { type: "string" },
              type: { type: "string" },
              contactName: { type: "string" },
              contactEmail: { type: "string" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // Employee Management Tools
  {
    type: "function",
    function: {
      name: "manage_employee",
      description: "Create, update, search, or get information about employees",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search"],
            description: "Action to perform",
          },
          employeeId: { type: "number", description: "Employee ID" },
          data: {
            type: "object",
            description: "Employee data",
            properties: {
              firstName: { type: "string" },
              lastName: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              jobTitle: { type: "string" },
              departmentId: { type: "number" },
              hireDate: { type: "string" },
            },
          },
          searchQuery: { type: "string", description: "Search query" },
        },
        required: ["action"],
      },
    },
  },
  // Contract Management Tools
  {
    type: "function",
    function: {
      name: "manage_contract",
      description: "Create, update, search, or manage legal contracts",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "activate", "terminate"],
            description: "Action to perform",
          },
          contractId: { type: "number", description: "Contract ID" },
          data: {
            type: "object",
            description: "Contract data",
            properties: {
              title: { type: "string" },
              type: { type: "string" },
              partyType: { type: "string" },
              partyId: { type: "number" },
              partyName: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              value: { type: "string" },
              description: { type: "string" },
              terms: { type: "string" },
            },
          },
          searchQuery: { type: "string", description: "Search query" },
        },
        required: ["action"],
      },
    },
  },
  // Payment Management Tools
  {
    type: "function",
    function: {
      name: "manage_payment",
      description: "Create, get, list, or void payments",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "get", "list", "void"],
            description: "Action to perform",
          },
          paymentId: { type: "number", description: "Payment ID" },
          data: {
            type: "object",
            description: "Payment data",
            properties: {
              type: { type: "string", enum: ["received", "made"] },
              invoiceId: { type: "number" },
              vendorId: { type: "number" },
              customerId: { type: "number" },
              amount: { type: "string" },
              paymentMethod: { type: "string" },
              paymentDate: { type: "string" },
              referenceNumber: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        required: ["action"],
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
            enum: [
              "generate_po", "send_rfq", "send_email", "update_inventory", "vendor_followup",
              "create_work_order", "create_product", "create_material", "create_customer",
              "create_bom", "create_invoice", "create_shipment", "create_warehouse",
              "create_employee", "create_contract", "create_payment", "update_order",
              "create_order"
            ],
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

    case "create": {
      if (!data?.name) throw new Error("Customer name required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_customer",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create customer: ${data.name}`,
        aiConfidence: "0.90",
        relatedEntityType: "customer",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Customer creation pending approval" };
    }

    case "update": {
      if (!customerId) throw new Error("Customer ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_customer",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ customerId, ...data }),
        aiReasoning: `Update customer #${customerId}`,
        aiConfidence: "0.85",
        relatedEntityType: "customer",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Customer update pending approval" };
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

    case "create": {
      if (!data?.customerId) throw new Error("Customer ID required for order");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create order for customer #${data.customerId}`,
        aiConfidence: "0.90",
        relatedEntityType: "order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Order creation pending approval" };
    }

    case "update": {
      if (!orderId) throw new Error("Order ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ orderId, ...data }),
        aiReasoning: `Update order #${orderId}`,
        aiConfidence: "0.85",
        relatedEntityType: "order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Order update pending approval" };
    }

    case "cancel": {
      if (!orderId) throw new Error("Order ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "cancel_order",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ orderId }),
        aiReasoning: `Cancel order #${orderId}`,
        aiConfidence: "0.80",
        relatedEntityType: "order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Order cancellation pending approval" };
    }

    case "fulfill": {
      if (!orderId) throw new Error("Order ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "fulfill_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ orderId }),
        aiReasoning: `Fulfill order #${orderId}`,
        aiConfidence: "0.90",
        relatedEntityType: "order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Order fulfillment pending approval" };
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
// NEW ENTITY MANAGEMENT EXECUTION FUNCTIONS
// ============================================

async function executeManageProduct(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, productId, data, searchQuery } = params;

  switch (action) {
    case "list": {
      const allProducts = await db.select().from(products).limit(50);
      return { products: allProducts, total: allProducts.length };
    }
    case "get": {
      if (!productId) throw new Error("Product ID required");
      const product = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      return { product: product[0] };
    }
    case "search": {
      const allProducts = await db.select().from(products);
      const filtered = allProducts.filter(p =>
        p.name?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        p.sku?.toLowerCase().includes(searchQuery?.toLowerCase() || "")
      );
      return { products: filtered, total: filtered.length, query: searchQuery };
    }
    case "create": {
      if (!data?.name) throw new Error("Product name required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_product",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create product: ${data.name}`,
        aiConfidence: "0.90",
        relatedEntityType: "product",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Product creation pending approval" };
    }
    case "update": {
      if (!productId) throw new Error("Product ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_product",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ productId, ...data }),
        aiReasoning: `Update product #${productId}`,
        aiConfidence: "0.85",
        relatedEntityType: "product",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Product update pending approval" };
    }
    case "delete": {
      if (!productId) throw new Error("Product ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "delete_product",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ productId }),
        aiReasoning: `Delete product #${productId}`,
        aiConfidence: "0.80",
        relatedEntityType: "product",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Product deletion pending approval" };
    }
    default:
      throw new Error(`Unknown product action: ${action}`);
  }
}

async function executeManageRawMaterial(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, materialId, data, searchQuery } = params;

  switch (action) {
    case "list": {
      const allMaterials = await db.select().from(rawMaterials).limit(50);
      return { materials: allMaterials, total: allMaterials.length };
    }
    case "get": {
      if (!materialId) throw new Error("Material ID required");
      const material = await db.select().from(rawMaterials).where(eq(rawMaterials.id, materialId)).limit(1);
      return { material: material[0] };
    }
    case "search": {
      const allMaterials = await db.select().from(rawMaterials);
      const filtered = allMaterials.filter(m =>
        m.name?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        m.sku?.toLowerCase().includes(searchQuery?.toLowerCase() || "")
      );
      return { materials: filtered, total: filtered.length, query: searchQuery };
    }
    case "create": {
      if (!data?.name) throw new Error("Material name required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_material",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create raw material: ${data.name}`,
        aiConfidence: "0.90",
        relatedEntityType: "raw_material",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Material creation pending approval" };
    }
    case "update": {
      if (!materialId) throw new Error("Material ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_material",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ materialId, ...data }),
        aiReasoning: `Update raw material #${materialId}`,
        aiConfidence: "0.85",
        relatedEntityType: "raw_material",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Material update pending approval" };
    }
    case "delete": {
      if (!materialId) throw new Error("Material ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "delete_material",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ materialId }),
        aiReasoning: `Delete raw material #${materialId}`,
        aiConfidence: "0.80",
        relatedEntityType: "raw_material",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Material deletion pending approval" };
    }
    default:
      throw new Error(`Unknown material action: ${action}`);
  }
}

async function executeManageInvoice(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, invoiceId, data, searchQuery } = params;

  switch (action) {
    case "list": {
      const allInvoices = await db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(50);
      return { invoices: allInvoices, total: allInvoices.length };
    }
    case "get": {
      if (!invoiceId) throw new Error("Invoice ID required");
      const invoice = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
      return { invoice: invoice[0], items };
    }
    case "search": {
      const allInvoices = await db.select().from(invoices);
      const filtered = allInvoices.filter(i =>
        i.invoiceNumber?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        i.status?.toLowerCase().includes(searchQuery?.toLowerCase() || "")
      );
      return { invoices: filtered, total: filtered.length };
    }
    case "create": {
      if (!data?.customerId) throw new Error("Customer ID required for invoice");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_invoice",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create invoice for customer #${data.customerId}`,
        aiConfidence: "0.90",
        relatedEntityType: "invoice",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Invoice creation pending approval" };
    }
    case "update": {
      if (!invoiceId) throw new Error("Invoice ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_invoice",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ invoiceId, ...data }),
        aiReasoning: `Update invoice #${invoiceId}`,
        aiConfidence: "0.85",
        relatedEntityType: "invoice",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Invoice update pending approval" };
    }
    case "void": {
      if (!invoiceId) throw new Error("Invoice ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "void_invoice",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ invoiceId }),
        aiReasoning: `Void invoice #${invoiceId}`,
        aiConfidence: "0.80",
        relatedEntityType: "invoice",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Invoice void pending approval" };
    }
    case "mark_paid": {
      if (!invoiceId) throw new Error("Invoice ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "mark_invoice_paid",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ invoiceId, paymentDate: data?.paymentDate || new Date().toISOString() }),
        aiReasoning: `Mark invoice #${invoiceId} as paid`,
        aiConfidence: "0.90",
        relatedEntityType: "invoice",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Mark paid pending approval" };
    }
    default:
      throw new Error(`Unknown invoice action: ${action}`);
  }
}

async function executeManageBom(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, bomId, data, componentData, componentId } = params;

  switch (action) {
    case "list": {
      const allBoms = await db.select().from(billOfMaterials).limit(50);
      return { boms: allBoms, total: allBoms.length };
    }
    case "get": {
      if (!bomId) throw new Error("BOM ID required");
      const bom = await db.select().from(billOfMaterials).where(eq(billOfMaterials.id, bomId)).limit(1);
      const components = await db.select().from(bomComponents).where(eq(bomComponents.bomId, bomId));
      return { bom: bom[0], components };
    }
    case "create": {
      if (!data?.name || !data?.productId) throw new Error("BOM name and product ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_bom",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create BOM: ${data.name} for product #${data.productId}`,
        aiConfidence: "0.90",
        relatedEntityType: "bom",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "BOM creation pending approval" };
    }
    case "update": {
      if (!bomId) throw new Error("BOM ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_bom",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ bomId, ...data }),
        aiReasoning: `Update BOM #${bomId}`,
        aiConfidence: "0.85",
        relatedEntityType: "bom",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "BOM update pending approval" };
    }
    case "add_component": {
      if (!bomId || !componentData) throw new Error("BOM ID and component data required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "add_bom_component",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ bomId, ...componentData }),
        aiReasoning: `Add component to BOM #${bomId}: ${componentData.name || 'component'}`,
        aiConfidence: "0.85",
        relatedEntityType: "bom",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Component addition pending approval" };
    }
    case "remove_component": {
      if (!componentId) throw new Error("Component ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "remove_bom_component",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ componentId, bomId }),
        aiReasoning: `Remove component #${componentId} from BOM`,
        aiConfidence: "0.85",
        relatedEntityType: "bom",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Component removal pending approval" };
    }
    default:
      throw new Error(`Unknown BOM action: ${action}`);
  }
}

async function executeManageWorkOrder(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, workOrderId, data } = params;

  switch (action) {
    case "list": {
      const allWOs = await db.select().from(workOrders).orderBy(desc(workOrders.createdAt)).limit(50);
      return { workOrders: allWOs, total: allWOs.length };
    }
    case "get": {
      if (!workOrderId) throw new Error("Work order ID required");
      const wo = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
      return { workOrder: wo[0] };
    }
    case "create": {
      if (!data?.bomId) throw new Error("BOM ID required for work order");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_work_order",
        status: "pending_approval",
        priority: data?.priority || "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create work order for BOM #${data.bomId}, quantity: ${data.quantity || 1}`,
        aiConfidence: "0.90",
        relatedEntityType: "work_order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Work order creation pending approval" };
    }
    case "update": {
      if (!workOrderId) throw new Error("Work order ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_work_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ workOrderId, ...data }),
        aiReasoning: `Update work order #${workOrderId}`,
        aiConfidence: "0.85",
        relatedEntityType: "work_order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Work order update pending approval" };
    }
    case "start": {
      if (!workOrderId) throw new Error("Work order ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "start_work_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ workOrderId }),
        aiReasoning: `Start work order #${workOrderId}`,
        aiConfidence: "0.90",
        relatedEntityType: "work_order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Work order start pending approval" };
    }
    case "complete": {
      if (!workOrderId) throw new Error("Work order ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "complete_work_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ workOrderId }),
        aiReasoning: `Complete work order #${workOrderId}`,
        aiConfidence: "0.90",
        relatedEntityType: "work_order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Work order completion pending approval" };
    }
    case "cancel": {
      if (!workOrderId) throw new Error("Work order ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "cancel_work_order",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ workOrderId }),
        aiReasoning: `Cancel work order #${workOrderId}`,
        aiConfidence: "0.85",
        relatedEntityType: "work_order",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Work order cancellation pending approval" };
    }
    default:
      throw new Error(`Unknown work order action: ${action}`);
  }
}

async function executeManageShipment(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, shipmentId, data } = params;

  switch (action) {
    case "list": {
      const allShipments = await db.select().from(shipments).orderBy(desc(shipments.createdAt)).limit(50);
      return { shipments: allShipments, total: allShipments.length };
    }
    case "get": {
      if (!shipmentId) throw new Error("Shipment ID required");
      const shipment = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
      return { shipment: shipment[0] };
    }
    case "track": {
      if (!shipmentId && !data?.trackingNumber) {
        const activeShipments = await db.select().from(shipments);
        const inTransit = activeShipments.filter(s => s.status === "in_transit" || s.status === "shipped");
        return { shipments: inTransit, total: inTransit.length };
      }
      if (data?.trackingNumber) {
        const allShipments = await db.select().from(shipments);
        const found = allShipments.filter(s => s.trackingNumber === data.trackingNumber);
        return { shipments: found, total: found.length };
      }
      const shipment = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
      return { shipment: shipment[0] };
    }
    case "create": {
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_shipment",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create shipment${data?.orderId ? ` for order #${data.orderId}` : ''}`,
        aiConfidence: "0.90",
        relatedEntityType: "shipment",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Shipment creation pending approval" };
    }
    case "update": {
      if (!shipmentId) throw new Error("Shipment ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_shipment",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ shipmentId, ...data }),
        aiReasoning: `Update shipment #${shipmentId}`,
        aiConfidence: "0.85",
        relatedEntityType: "shipment",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Shipment update pending approval" };
    }
    case "mark_delivered": {
      if (!shipmentId) throw new Error("Shipment ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "deliver_shipment",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ shipmentId, deliveryDate: new Date().toISOString() }),
        aiReasoning: `Mark shipment #${shipmentId} as delivered`,
        aiConfidence: "0.90",
        relatedEntityType: "shipment",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Delivery confirmation pending approval" };
    }
    default:
      throw new Error(`Unknown shipment action: ${action}`);
  }
}

async function executeManageWarehouse(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, warehouseId, data } = params;

  switch (action) {
    case "list": {
      const allWarehouses = await db.select().from(warehouses);
      return { warehouses: allWarehouses, total: allWarehouses.length };
    }
    case "get": {
      if (!warehouseId) throw new Error("Warehouse ID required");
      const warehouse = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
      return { warehouse: warehouse[0] };
    }
    case "inventory_levels": {
      const warehouseInventory = await db.select().from(inventory);
      if (warehouseId) {
        const filtered = warehouseInventory.filter(i => i.warehouseId === warehouseId);
        return { inventory: filtered, total: filtered.length, warehouseId };
      }
      return { inventory: warehouseInventory.slice(0, 50), total: warehouseInventory.length };
    }
    case "create": {
      if (!data?.name) throw new Error("Warehouse name required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_warehouse",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify(data),
        aiReasoning: `Create warehouse: ${data.name}`,
        aiConfidence: "0.90",
        relatedEntityType: "warehouse",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Warehouse creation pending approval" };
    }
    case "update": {
      if (!warehouseId) throw new Error("Warehouse ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_warehouse",
        status: "pending_approval",
        priority: "medium",
        taskData: JSON.stringify({ warehouseId, ...data }),
        aiReasoning: `Update warehouse #${warehouseId}`,
        aiConfidence: "0.85",
        relatedEntityType: "warehouse",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Warehouse update pending approval" };
    }
    default:
      throw new Error(`Unknown warehouse action: ${action}`);
  }
}

async function executeManageEmployee(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, employeeId, data, searchQuery } = params;

  switch (action) {
    case "list": {
      const allEmployees = await db.select().from(employees).limit(50);
      return { employees: allEmployees, total: allEmployees.length };
    }
    case "get": {
      if (!employeeId) throw new Error("Employee ID required");
      const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      return { employee: employee[0] };
    }
    case "search": {
      const allEmployees = await db.select().from(employees);
      const filtered = allEmployees.filter(e =>
        e.firstName?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        e.lastName?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        e.email?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        e.jobTitle?.toLowerCase().includes(searchQuery?.toLowerCase() || "")
      );
      return { employees: filtered, total: filtered.length, query: searchQuery };
    }
    case "create": {
      if (!data?.firstName || !data?.lastName) throw new Error("First and last name required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_employee",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify(data),
        aiReasoning: `Create employee: ${data.firstName} ${data.lastName}`,
        aiConfidence: "0.90",
        relatedEntityType: "employee",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Employee creation pending approval" };
    }
    case "update": {
      if (!employeeId) throw new Error("Employee ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_employee",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ employeeId, ...data }),
        aiReasoning: `Update employee #${employeeId}`,
        aiConfidence: "0.85",
        relatedEntityType: "employee",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Employee update pending approval" };
    }
    default:
      throw new Error(`Unknown employee action: ${action}`);
  }
}

async function executeManageContract(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, contractId, data, searchQuery } = params;

  switch (action) {
    case "list": {
      const allContracts = await db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(50);
      return { contracts: allContracts, total: allContracts.length };
    }
    case "get": {
      if (!contractId) throw new Error("Contract ID required");
      const contract = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
      return { contract: contract[0] };
    }
    case "search": {
      const allContracts = await db.select().from(contracts);
      const filtered = allContracts.filter(c =>
        c.title?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        c.partyName?.toLowerCase().includes(searchQuery?.toLowerCase() || "") ||
        c.contractNumber?.toLowerCase().includes(searchQuery?.toLowerCase() || "")
      );
      return { contracts: filtered, total: filtered.length, query: searchQuery };
    }
    case "create": {
      if (!data?.title || !data?.type) throw new Error("Contract title and type required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_contract",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify(data),
        aiReasoning: `Create contract: ${data.title}`,
        aiConfidence: "0.90",
        relatedEntityType: "contract",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Contract creation pending approval" };
    }
    case "update": {
      if (!contractId) throw new Error("Contract ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "update_contract",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ contractId, ...data }),
        aiReasoning: `Update contract #${contractId}`,
        aiConfidence: "0.85",
        relatedEntityType: "contract",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Contract update pending approval" };
    }
    case "activate": {
      if (!contractId) throw new Error("Contract ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "activate_contract",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ contractId }),
        aiReasoning: `Activate contract #${contractId}`,
        aiConfidence: "0.90",
        relatedEntityType: "contract",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Contract activation pending approval" };
    }
    case "terminate": {
      if (!contractId) throw new Error("Contract ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "terminate_contract",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ contractId }),
        aiReasoning: `Terminate contract #${contractId}`,
        aiConfidence: "0.80",
        relatedEntityType: "contract",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Contract termination pending approval" };
    }
    default:
      throw new Error(`Unknown contract action: ${action}`);
  }
}

async function executeManagePayment(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, paymentId, data } = params;

  switch (action) {
    case "list": {
      const allPayments = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50);
      return { payments: allPayments, total: allPayments.length };
    }
    case "get": {
      if (!paymentId) throw new Error("Payment ID required");
      const payment = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      return { payment: payment[0] };
    }
    case "create": {
      if (!data?.amount || !data?.type) throw new Error("Payment amount and type required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "create_payment",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify(data),
        aiReasoning: `Create ${data.type} payment of $${data.amount}`,
        aiConfidence: "0.90",
        relatedEntityType: "payment",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Payment creation pending approval" };
    }
    case "void": {
      if (!paymentId) throw new Error("Payment ID required");
      const task = await db.insert(aiAgentTasks).values({
        taskType: "void_payment",
        status: "pending_approval",
        priority: "high",
        taskData: JSON.stringify({ paymentId }),
        aiReasoning: `Void payment #${paymentId}`,
        aiConfidence: "0.80",
        relatedEntityType: "payment",
        requiresApproval: true,
      }).$returningId();
      return { taskCreated: true, taskId: task[0].id, message: "Payment void pending approval" };
    }
    default:
      throw new Error(`Unknown payment action: ${action}`);
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
    case "manage_product":
      return executeManageProduct(params, ctx);
    case "manage_raw_material":
      return executeManageRawMaterial(params, ctx);
    case "manage_invoice":
      return executeManageInvoice(params, ctx);
    case "manage_bom":
      return executeManageBom(params, ctx);
    case "manage_work_order":
      return executeManageWorkOrder(params, ctx);
    case "manage_shipment":
      return executeManageShipment(params, ctx);
    case "manage_warehouse":
      return executeManageWarehouse(params, ctx);
    case "manage_employee":
      return executeManageEmployee(params, ctx);
    case "manage_contract":
      return executeManageContract(params, ctx);
    case "manage_payment":
      return executeManagePayment(params, ctx);
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

11. **Manage Products**: Create, update, search, and delete products in the catalog.

12. **Manage Raw Materials**: Create, update, search raw materials used in manufacturing.

13. **Manage Invoices**: Create, update, void, and mark invoices as paid.

14. **Manage BOMs**: Create and manage bills of materials with components.

15. **Manage Work Orders**: Create, start, complete, and cancel manufacturing work orders.

16. **Manage Shipments**: Create, track, update, and mark shipments as delivered.

17. **Manage Warehouses**: Create, update, and check inventory levels at warehouses.

18. **Manage Employees**: Create, update, and search employee records.

19. **Manage Contracts**: Create, update, activate, and terminate legal contracts.

20. **Manage Payments**: Create, view, and void payments.

IMPORTANT: For any operation that creates, modifies, or deletes data (create, update, delete, void, mark_paid, activate, terminate, start, complete, cancel, fulfill), ALWAYS route through the approval workflow by creating a task. Read operations (list, get, search, track, inventory_levels, performance, order_history) can execute directly.

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
      // Add assistant message with tool calls to history
      messages.push({
        role: "assistant",
        content: typeof responseMessage.content === "string" ? responseMessage.content : "",
      });

      // Process each tool call
      for (const toolCall of responseMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

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

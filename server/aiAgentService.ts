import { invokeLLM, invokeLLMStream, Tool, Message, InvokeResult } from "./_core/llm";
import type { AIAgentResponse, AIAgentAction, AgentStreamEvent } from "@shared/aiChat";

// Re-exported for existing server importers; the canonical definitions live in
// shared/ so the client can type streamed responses without importing this module.
export type { AIAgentResponse, AIAgentAction, AgentStreamEvent } from "@shared/aiChat";
import { getDb, createWorkOrder, createFreightRfq } from "./db";
import * as dbHelpers from "./db";
import { sendEmail, formatEmailHtml } from "./_core/email";
import { getValidGoogleToken } from "./routers/middleware";
import { scopeAllows, type Scope } from "./_core/scope";
import { postInvoiceJournalEntry } from "./invoicePosting";
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
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import { eq, and, like, desc, sql, gte, lte, or, isNull, isNotNull, count, sum, lt, inArray, type SQL } from "drizzle-orm";

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

// ============================================
// ROLE GATES
// ============================================

// Roles allowed to have the agent MUTATE ERP data (create POs, change inventory,
// send email, etc.) — mirrors opsProcedure. Reads/Q&A stay open to all roles.
// Because the chat's mode is client-controlled, this server-side check is what
// actually prevents a non-ops user (or scripted client) from driving writes.
export const MUTATION_ROLES: readonly string[] = ["admin", "ops", "exec"];
// Mirrors financeProcedure: invoices and payments.
export const FINANCE_ROLES: readonly string[] = ["admin", "exec", "finance"];
// Archive / soft-delete of master data is admin-only, whatever the module's UI allows.
export const ADMIN_ROLES: readonly string[] = ["admin"];

/**
 * Generic role gate for chat tools. `action` is a short human phrase ("create order")
 * used in the error the model relays to the user. Sibling modules registering tools via
 * `registerChatTools` should use this (or the specific gates below) for every write.
 */
export function assertRole(ctx: AIAgentContext, roles: readonly string[], action: string): void {
  if (!roles.includes(ctx.userRole)) {
    throw new Error(`Not authorized: "${action}" requires one of these roles: ${roles.join(", ")}.`);
  }
}

export function assertCanMutate(ctx: AIAgentContext, action: string): void {
  if (!MUTATION_ROLES.includes(ctx.userRole)) {
    throw new Error(`Not authorized: "${action}" requires an operations, admin, or executive role.`);
  }
}

export function assertCanMutateFinance(ctx: AIAgentContext, action: string): void {
  if (!FINANCE_ROLES.includes(ctx.userRole)) {
    throw new Error(`Not authorized: "${action}" requires a finance, admin, or executive role.`);
  }
}

export function assertAdmin(ctx: AIAgentContext, action: string): void {
  if (!ADMIN_ROLES.includes(ctx.userRole)) {
    throw new Error(`Not authorized: "${action}" requires an admin role.`);
  }
}

// ============================================
// COMPANY SCOPING
// ============================================
//
// Every read and write in this file is confined to the caller's company entity when
// `ctx.companyId` is set. When it is undefined the caller is a global/superuser and the
// legacy unscoped behaviour is preserved. Writes always stamp `ctx.companyId`.

/** Entity `Scope` for db helpers that accept one (`getCustomers(scope)`, …); undefined = global. */
export function chatScope(ctx: AIAgentContext): Scope | undefined {
  return ctx.companyId != null ? { mode: "entity", companyIds: [ctx.companyId] } : undefined;
}

/** `{ companyId }` filter object for db helpers that take a filters bag; undefined = global. */
function companyFilter(ctx: AIAgentContext): { companyId: number } | undefined {
  return ctx.companyId != null ? { companyId: ctx.companyId } : undefined;
}

/** `eq(table.companyId, ctx.companyId)` or undefined for a global caller. */
function companyWhere(table: { companyId: MySqlColumn }, ctx: AIAgentContext): SQL | undefined {
  return ctx.companyId != null ? eq(table.companyId, ctx.companyId) : undefined;
}

/** AND of the company predicate and any extra conditions (undefined entries are dropped). */
function scopedWhere(ctx: AIAgentContext, table: { companyId: MySqlColumn }, ...conds: Array<SQL | undefined>): SQL | undefined {
  return and(companyWhere(table, ctx), ...conds);
}

/**
 * By-id reads: a row outside the caller's entity is reported as "not found" (never
 * "forbidden") so cross-entity existence isn't leaked. Global callers see everything.
 */
function assertInScope<T extends { companyId?: number | null }>(
  ctx: AIAgentContext,
  row: T | undefined | null,
  label: string,
): asserts row is T {
  const scope = chatScope(ctx);
  if (!row || (scope && !scopeAllows(scope, row.companyId))) {
    throw new Error(`${label} not found`);
  }
}

// Number helpers shared by the write tools — the model can pass junk.
function toPositiveNumber(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be a positive number`);
  return n;
}
function toNonNegativeNumber(value: unknown, label: string, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number`);
  return n;
}
function parseDateOr(value: unknown, fallback: Date): Date {
  if (value == null || value === "") return fallback;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? fallback : d;
}
function pickFields<T extends Record<string, any>>(data: Record<string, any> | undefined, allowed: readonly string[]): Partial<T> {
  const out: Record<string, any> = {};
  for (const key of allowed) {
    if (data && data[key] !== undefined) out[key] = data[key];
  }
  return out as Partial<T>;
}
async function docNumber(prefix: string): Promise<string> {
  // Same generator the UI routers use, so AI-raised documents number identically.
  const { generateNumber } = await import("./routers/_shared");
  return generateNumber(prefix);
}
async function audit(ctx: AIAgentContext, action: "create" | "update" | "delete" | "approve", entityType: string, entityId: number, entityName?: string) {
  try {
    await dbHelpers.createAuditLog({ userId: ctx.userId, action, entityType, entityId, entityName });
  } catch (e) {
    console.warn(`[aiAgent] audit log failed for ${entityType} ${entityId}:`, e);
  }
}

// AIAgentResponse and AIAgentAction are defined in shared/aiChat.ts (imported +
// re-exported above) so the client chat surfaces can share them.

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
      description: "Vendors/suppliers. Reads (list, get, search, performance) are open to all roles. create/update need an ops, admin or exec role. archive (admin only) sets the vendor to inactive — vendors are never permanently deleted because purchase orders reference them.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "performance", "archive"],
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
              address: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              country: { type: "string" },
              postalCode: { type: "string" },
              website: { type: "string" },
              type: { type: "string", enum: ["supplier", "contractor", "service"] },
              status: { type: "string", enum: ["active", "inactive", "pending"] },
              paymentTerms: { type: "number", description: "Payment terms in days" },
              notes: { type: "string" },
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
      description: "Customers. Reads (list, get, search, order_history) are open to all roles. create/update need an ops, admin or exec role. archive (admin only) sets the customer to inactive — customers are never permanently deleted because orders and invoices reference them.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "search", "order_history", "archive"],
            description: "Action to perform",
          },
          customerId: { type: "number", description: "Customer ID" },
          data: {
            type: "object",
            description: "Customer data for create/update operations",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              address: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              country: { type: "string" },
              postalCode: { type: "string" },
              type: { type: "string", enum: ["individual", "business"] },
              status: { type: "string", enum: ["active", "inactive", "prospect"] },
              creditLimit: { type: "number" },
              paymentTerms: { type: "number", description: "Payment terms in days" },
              notes: { type: "string" },
            },
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
      description: "Sales orders. Reads (list, get) are open to all roles. create/update/cancel/fulfill need an ops, admin or exec role. create takes line items (productId, sku or product name + quantity; unitPrice defaults to the product's list price). update changes status/notes/addresses (not to 'shipped' — use fulfill). fulfill allocates and reserves stock, raises an outbound shipment and marks the order shipped, exactly like the order-fulfillment workflow. archive (admin only) cancels the order and keeps its history — orders are never permanently deleted.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "get", "list", "cancel", "fulfill", "archive"],
            description: "Action to perform",
          },
          orderId: { type: "number", description: "Order ID (update/get/cancel/fulfill/archive)" },
          data: {
            type: "object",
            description: "Order data. For create: customerId or customerName, items[], optional orderDate, shippingAddress, billingAddress, taxAmount, shippingAmount, discountAmount, currency, notes. For update: status, notes, shippingAddress, billingAddress. For cancel: optional reason.",
            properties: {
              customerId: { type: "number" },
              customerName: { type: "string", description: "Used to look the customer up when customerId is unknown" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    productId: { type: "number" },
                    sku: { type: "string" },
                    productName: { type: "string" },
                    quantity: { type: "number" },
                    unitPrice: { type: "number", description: "Defaults to the product's unit price" },
                  },
                },
              },
              orderDate: { type: "string" },
              shippingAddress: { type: "string" },
              billingAddress: { type: "string" },
              taxAmount: { type: "number" },
              shippingAmount: { type: "number" },
              discountAmount: { type: "number" },
              currency: { type: "string" },
              notes: { type: "string" },
              status: { type: "string", enum: ["pending", "confirmed", "processing", "delivered", "cancelled", "refunded"], description: "For update" },
              reason: { type: "string", description: "For cancel" },
            },
          },
        },
        required: ["action"],
      },
    },
  },
  // Invoice / Payment Tools (finance roles)
  {
    type: "function",
    function: {
      name: "manage_invoice",
      description: "Customer invoices and payments. Reads (list, get) are open to all roles. create/send/record_payment need a finance, admin or exec role. create builds a draft invoice either from an existing order (orderId — same customer, lines and totals; the order is linked to the invoice) or from explicit line items with a customerId; the AR/Revenue journal entry is posted automatically. send marks a draft invoice as sent/approved (to email it to the customer, call send_email afterwards). record_payment records a received payment against the invoice, updates its paid amount/status, marks the linked order delivered when fully paid, and posts the Cash/AR journal entry.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "send", "record_payment", "get", "list"],
            description: "Action to perform",
          },
          invoiceId: { type: "number", description: "Invoice ID (send/record_payment/get)" },
          orderId: { type: "number", description: "Order to invoice (create)" },
          data: {
            type: "object",
            description: "create: customerId, items[] ({description|productId|productName, quantity, unitPrice}), dueDate, taxAmount, discountAmount, notes, terms. record_payment: amount, date, method, reference, notes. list: status.",
            properties: {
              customerId: { type: "number" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    productId: { type: "number" },
                    productName: { type: "string" },
                    quantity: { type: "number" },
                    unitPrice: { type: "number" },
                  },
                },
              },
              dueDate: { type: "string", description: "ISO date; defaults to issue date + the customer's payment terms" },
              taxAmount: { type: "number" },
              discountAmount: { type: "number" },
              notes: { type: "string" },
              terms: { type: "string" },
              amount: { type: "number", description: "Payment amount (record_payment)" },
              date: { type: "string", description: "Payment date, ISO (record_payment); defaults to today" },
              method: { type: "string", enum: ["cash", "check", "bank_transfer", "credit_card", "ach", "wire", "other"], description: "Payment method (record_payment)" },
              reference: { type: "string", description: "Payment reference / check number (record_payment)" },
              status: { type: "string", description: "Status filter (list)" },
            },
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
      description: "Freight. Reads (get_quotes, track, list_carriers) are open to all roles. create_rfq and book_shipment need an ops, admin or exec role. book_shipment accepts a carrier quote (quoteId from get_quotes): the quote is accepted, sibling quotes rejected, a booking created and the RFQ awarded — the same steps as accepting a quote in the Logistics page.",
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
            description: "RFQ details (create_rfq): title, originCity, originCountry, destinationCity, destinationCountry, cargoDescription, totalWeight, totalVolume, preferredMode, requiredDeliveryDate, notes",
          },
          rfqId: { type: "number", description: "Limit get_quotes to one RFQ" },
          quoteId: { type: "number", description: "Quote to accept (book_shipment)" },
          bookingId: { type: "number", description: "Booking to track" },
          bookingData: {
            type: "object",
            description: "Optional booking notes (book_shipment)",
            properties: { notes: { type: "string" } },
          },
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
      description: "Generate a business report (read-only, scoped to the user's company): sales_summary, inventory_status, vendor_performance, customer_analysis (revenue and orders per customer, new customers), financial_overview, production_status (work orders by status, overdue), order_fulfillment (orders by status, fulfilment rate, outbound shipments, oldest open orders). dateRange defaults to the last 30 days.",
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
      description: "Delegate a multi-step chore/errand the user wants DONE (not a question to answer). Use this when the user asks you to carry out a task that takes several actions or has real-world consequences — e.g. 'chase the overdue invoice from Acme', 'onboard this new vendor and email them the forms', 'follow up with everyone who didn't reply'. Produce a short title, restate the goal, list the concrete steps you'll take, and set a risk level. Low-risk errands run automatically when the user has an ops, admin or exec role; for every other role, and for all medium/high-risk errands, the plan is sent to the approval queue and only runs after an authorised user approves it. Do NOT use this for simple questions or a single trivial action — answer or do those directly.",
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
      description: "View upcoming Google Calendar events (any role) or create a new event (ops, admin or exec role; invites go to attendees). Use to check availability, schedule meetings, or add reminders.",
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

  const { dataType, timeRange = "month" } = params;

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
  const inPeriod = (col: MySqlColumn) => (timeRange !== "all" ? gte(col, startDate) : undefined);

  switch (dataType) {
    case "sales": {
      const allOrders = await db.select().from(orders).where(scopedWhere(ctx, orders, inPeriod(orders.createdAt)));
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
      const allInventory = await db.select().from(inventory).where(companyWhere(inventory, ctx));
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
      const allVendors = await db.select().from(vendors).where(companyWhere(vendors, ctx));
      const activeVendors = allVendors.filter(v => v.status === "active");
      const allPOs = await db.select().from(purchaseOrders).where(scopedWhere(ctx, purchaseOrders, inPeriod(purchaseOrders.createdAt)));

      return {
        summary: "Vendor analysis",
        totalVendors: allVendors.length,
        activeVendors: activeVendors.length,
        poCountInPeriod: allPOs.length,
        vendors: allVendors.slice(0, 10),
      };
    }

    case "customers": {
      const allCustomers = await db.select().from(customers).where(companyWhere(customers, ctx));
      const activeCustomers = allCustomers.filter(c => c.status === "active");
      const allOrders = await db.select().from(orders).where(scopedWhere(ctx, orders, inPeriod(orders.createdAt)));

      return {
        summary: "Customer analysis",
        totalCustomers: allCustomers.length,
        activeCustomers: activeCustomers.length,
        ordersInPeriod: allOrders.length,
        customers: allCustomers.slice(0, 10),
      };
    }

    case "finances": {
      const allInvoices = await db.select().from(invoices).where(scopedWhere(ctx, invoices, inPeriod(invoices.createdAt)));
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
      const allOrders = await db.select().from(orders).where(scopedWhere(ctx, orders, inPeriod(orders.createdAt)));
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
      const allPOs = await db.select().from(purchaseOrders).where(scopedWhere(ctx, purchaseOrders, inPeriod(purchaseOrders.createdAt)));
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
      const allWorkOrders = await db.select().from(workOrders).where(scopedWhere(ctx, workOrders, inPeriod(workOrders.createdAt)));
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

  // Resolve email from entity if provided (scoped: another entity's vendor/customer is invisible).
  if (params.entityType && params.entityId) {
    switch (params.entityType) {
      case "vendor": {
        const vendor = await db.select().from(vendors).where(scopedWhere(ctx, vendors, eq(vendors.id, params.entityId))).limit(1);
        if (vendor[0]?.email) {
          toEmail = vendor[0].email;
          recipientName = vendor[0].contactName || vendor[0].name || "Vendor";
        }
        break;
      }
      case "customer": {
        const customer = await db.select().from(customers).where(scopedWhere(ctx, customers, eq(customers.id, params.entityId))).limit(1);
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

async function executeSearchInbox(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: Array<SQL | undefined> = [companyWhere(inboundEmails, ctx)];
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
  const rows = await db.select().from(inboundEmails)
    .where(and(...conditions))
    .orderBy(desc(inboundEmails.receivedAt)).limit(limit);

  return {
    count: rows.length,
    emails: rows.map(formatInboundSummary),
    hint: rows.length ? "Use read_email with an id to read the full message." : "No matching emails found.",
  };
}

async function executeReadEmail(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const emailId = Number(params.emailId);
  if (!Number.isFinite(emailId)) return { error: "A numeric emailId is required (get it from search_inbox)." };

  const rows = await db.select().from(inboundEmails).where(scopedWhere(ctx, inboundEmails, eq(inboundEmails.id, emailId))).limit(1);
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
        const filtered = await db.select().from(inventory).where(scopedWhere(ctx, inventory,
          or(eq(inventory.id, parseInt(identifier) || 0), eq(inventory.productId, parseInt(identifier) || 0))
        ));
        return { type: "inventory", items: filtered, action };
      }
      const [totalCount] = await db.select({ count: count() }).from(inventory).where(companyWhere(inventory, ctx));
      const items = await db.select().from(inventory).where(companyWhere(inventory, ctx)).limit(20);
      return { type: "inventory", totalItems: totalCount?.count || 0, items, action };
    }

    case "order": {
      if (identifier) {
        const [order] = await db.select().from(orders).where(scopedWhere(ctx, orders,
          or(eq(orders.id, parseInt(identifier) || 0), eq(orders.orderNumber, identifier))
        )).limit(1);
        if (order) {
          const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          return { type: "order", order, items, action };
        }
      }
      const [totalCount] = await db.select({ count: count() }).from(orders).where(companyWhere(orders, ctx));
      const recentOrders = await db.select().from(orders).where(companyWhere(orders, ctx)).orderBy(desc(orders.createdAt)).limit(20);
      return { type: "orders", totalOrders: totalCount?.count || 0, orders: recentOrders, action };
    }

    case "shipment": {
      if (identifier) {
        const [shipment] = await db.select().from(shipments).where(scopedWhere(ctx, shipments,
          or(eq(shipments.id, parseInt(identifier) || 0), eq(shipments.trackingNumber, identifier))
        )).limit(1);
        return { type: "shipment", shipment, action };
      }
      const [totalCount] = await db.select({ count: count() }).from(shipments).where(companyWhere(shipments, ctx));
      const recentShipments = await db.select().from(shipments).where(companyWhere(shipments, ctx)).limit(20);
      return { type: "shipments", totalShipments: totalCount?.count || 0, shipments: recentShipments, action };
    }

    case "purchase_order": {
      if (identifier) {
        const [po] = await db.select().from(purchaseOrders).where(scopedWhere(ctx, purchaseOrders,
          or(eq(purchaseOrders.id, parseInt(identifier) || 0), eq(purchaseOrders.poNumber, identifier))
        )).limit(1);
        if (po) {
          const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
          return { type: "purchase_order", purchaseOrder: po, items, action };
        }
      }
      const [totalCount] = await db.select({ count: count() }).from(purchaseOrders).where(companyWhere(purchaseOrders, ctx));
      const recentPOs = await db.select().from(purchaseOrders).where(companyWhere(purchaseOrders, ctx)).limit(20);
      return { type: "purchase_orders", totalPOs: totalCount?.count || 0, purchaseOrders: recentPOs, action };
    }

    case "work_order": {
      if (identifier) {
        const [wo] = await db.select().from(workOrders).where(scopedWhere(ctx, workOrders,
          or(eq(workOrders.id, parseInt(identifier) || 0), eq(workOrders.workOrderNumber, identifier))
        )).limit(1);
        return { type: "work_order", workOrder: wo, action };
      }
      const [totalCount] = await db.select({ count: count() }).from(workOrders).where(companyWhere(workOrders, ctx));
      const recentWOs = await db.select().from(workOrders).where(companyWhere(workOrders, ctx)).limit(20);
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
  // Rejects any move that would drop a location below zero on-hand. The cell is
  // looked up within the caller's entity, so another company's stock is never touched.
  const applyDelta = async (tx: any, product: number, warehouse: number, change: number) => {
    const cell = scopedWhere(ctx, inventory, eq(inventory.productId, product), eq(inventory.warehouseId, warehouse));
    // Lock the (product, warehouse) row for the duration of the transaction so
    // concurrent adjustments can't both read the same value and lose an update
    // (or slip past the non-negative check).
    const existing = await tx.select().from(inventory).where(cell).limit(1).for("update");
    if (existing.length > 0) {
      const current = parseFloat(existing[0].quantity as string) || 0;
      const next = current + change;
      if (next < 0) {
        throw new Error(`Insufficient stock: product ${product} at warehouse ${warehouse} has ${current}, cannot apply ${change}`);
      }
      await tx.update(inventory).set({ quantity: next.toString() }).where(cell);
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

// ============================================
// VENDORS
// ============================================

const VENDOR_WRITE_FIELDS = [
  "name", "contactName", "email", "phone", "address", "city", "state", "country", "postalCode",
  "type", "status", "paymentTerms", "notes", "website", "whatsappNumber", "defaultLeadTimeDays",
] as const;

async function executeManageVendor(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, vendorId, data, searchQuery } = params;
  const vId = vendorId != null ? Number(vendorId) : NaN;

  switch (action) {
    case "list": {
      const allVendors = await db.select().from(vendors).where(companyWhere(vendors, ctx));
      return { vendors: allVendors, total: allVendors.length };
    }

    case "get": {
      if (!Number.isFinite(vId)) throw new Error("Vendor ID required");
      const [vendor] = await db.select().from(vendors).where(scopedWhere(ctx, vendors, eq(vendors.id, vId))).limit(1);
      if (!vendor) throw new Error("Vendor not found");

      // Get vendor's PO history
      const vendorPOs = await db.select().from(purchaseOrders).where(scopedWhere(ctx, purchaseOrders, eq(purchaseOrders.vendorId, vId)));

      return { vendor, purchaseOrders: vendorPOs };
    }

    case "search": {
      const allVendors = await db.select().from(vendors).where(companyWhere(vendors, ctx));
      const q = (searchQuery || "").toLowerCase();
      const filtered = allVendors.filter(v =>
        v.name?.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q) ||
        v.contactName?.toLowerCase().includes(q)
      );
      return { vendors: filtered, total: filtered.length, query: searchQuery };
    }

    case "create": {
      assertCanMutate(ctx, "create vendor");
      if (!data?.name) throw new Error("Vendor name required");
      const fields = pickFields<Record<string, any>>(data, VENDOR_WRITE_FIELDS);
      const newVendor = await db.insert(vendors).values({
        ...fields,
        name: data.name,
        status: data.status || "active",
        companyId: ctx.companyId ?? null,
      } as any).$returningId();
      await audit(ctx, "create", "vendor", newVendor[0].id, data.name);
      return { created: true, vendorId: newVendor[0].id, message: `Created vendor "${data.name}".` };
    }

    case "update": {
      assertCanMutate(ctx, "update vendor");
      if (!Number.isFinite(vId)) throw new Error("Vendor ID required");
      const [existing] = await db.select().from(vendors).where(scopedWhere(ctx, vendors, eq(vendors.id, vId))).limit(1);
      if (!existing) throw new Error("Vendor not found");
      const fields = pickFields<Record<string, any>>(data, VENDOR_WRITE_FIELDS);
      if (Object.keys(fields).length === 0) throw new Error("No updatable vendor fields provided");
      await db.update(vendors).set(fields as any).where(scopedWhere(ctx, vendors, eq(vendors.id, vId)));
      await audit(ctx, "update", "vendor", vId, existing.name);
      return { updated: true, vendorId: vId, fields: Object.keys(fields) };
    }

    case "archive":
    case "delete": {
      // Vendors are referenced by purchase orders, RFQs and invoices, so the record is
      // never hard-deleted: it is archived by setting status = inactive.
      assertAdmin(ctx, "archive vendor");
      if (!Number.isFinite(vId)) throw new Error("Vendor ID required");
      const [existing] = await db.select().from(vendors).where(scopedWhere(ctx, vendors, eq(vendors.id, vId))).limit(1);
      if (!existing) throw new Error("Vendor not found");
      if (existing.status === "inactive") {
        return { archived: false, vendorId: vId, message: `Vendor "${existing.name}" is already archived (inactive).` };
      }
      const [poCount] = await db.select({ count: count() }).from(purchaseOrders).where(scopedWhere(ctx, purchaseOrders, eq(purchaseOrders.vendorId, vId)));
      await db.update(vendors).set({ status: "inactive" }).where(scopedWhere(ctx, vendors, eq(vendors.id, vId)));
      await audit(ctx, "delete", "vendor", vId, existing.name);
      return {
        archived: true,
        vendorId: vId,
        message: `Archived vendor "${existing.name}" (status set to inactive). ${poCount?.count || 0} purchase order(s) were kept for history; nothing was permanently deleted.`,
      };
    }

    case "performance": {
      const allVendors = await db.select().from(vendors).where(companyWhere(vendors, ctx));
      const allPOs = await db.select().from(purchaseOrders).where(companyWhere(purchaseOrders, ctx));

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

  // Validate vendor (within the caller's entity)
  const vendor = await db.select().from(vendors).where(scopedWhere(ctx, vendors, eq(vendors.id, vendorId))).limit(1);
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
      const allVendors = await db.select().from(vendors).where(companyWhere(vendors, ctx));
      const copackers = allVendors.filter(v =>
        v.type === "contractor" || v.type === "service"
      );
      return { copackers, total: copackers.length };
    }

    case "get": {
      if (!copackerId) throw new Error("Copacker ID required");
      const copacker = await db.select().from(vendors).where(scopedWhere(ctx, vendors, eq(vendors.id, copackerId))).limit(1);
      if (!copacker[0]) throw new Error("Copacker not found");
      const copackerWOs = await db.select().from(workOrders).where(companyWhere(workOrders, ctx));
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
      const allWOs = await db.select().from(workOrders).where(companyWhere(workOrders, ctx));
      const inProgress = allWOs.filter(wo => wo.status === "in_progress");
      return {
        totalWorkOrders: allWOs.length,
        inProgress: inProgress.length,
        workOrders: allWOs.slice(0, 20),
      };
    }

    case "performance": {
      const allVendors = await db.select().from(vendors).where(companyWhere(vendors, ctx));
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

// ============================================
// CUSTOMERS
// ============================================

const CUSTOMER_WRITE_FIELDS = [
  "name", "email", "phone", "address", "city", "state", "country", "postalCode",
  "type", "status", "creditLimit", "paymentTerms", "notes",
] as const;

async function executeManageCustomer(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, customerId, data, searchQuery } = params;
  const cId = customerId != null ? Number(customerId) : NaN;
  const scope = chatScope(ctx);

  switch (action) {
    case "list": {
      const allCustomers = await db.select().from(customers).where(companyWhere(customers, ctx));
      return { customers: allCustomers, total: allCustomers.length };
    }

    case "get": {
      if (!Number.isFinite(cId)) throw new Error("Customer ID required");
      const [customer] = await db.select().from(customers).where(scopedWhere(ctx, customers, eq(customers.id, cId))).limit(1);
      if (!customer) throw new Error("Customer not found");
      const customerOrders = await db.select().from(orders).where(scopedWhere(ctx, orders, eq(orders.customerId, cId)));
      return { customer, orders: customerOrders };
    }

    case "search": {
      const allCustomers = await db.select().from(customers).where(companyWhere(customers, ctx));
      const q = (searchQuery || "").toLowerCase();
      const filtered = allCustomers.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
      return { customers: filtered, total: filtered.length };
    }

    case "order_history": {
      if (!Number.isFinite(cId)) throw new Error("Customer ID required");
      const customerOrders = await db.select().from(orders).where(scopedWhere(ctx, orders, eq(orders.customerId, cId)));
      return { orders: customerOrders, total: customerOrders.length };
    }

    case "create": {
      assertCanMutate(ctx, "create customer");
      if (!data?.name) throw new Error("Customer name required");
      const fields = pickFields<Record<string, any>>(data, CUSTOMER_WRITE_FIELDS);
      if (fields.creditLimit != null) fields.creditLimit = String(fields.creditLimit);
      // Same helper + companyId default as customers.create in the UI.
      const result = await dbHelpers.createCustomer({
        ...(fields as any),
        name: data.name,
        type: data.type || "business",
        status: data.status || "active",
        companyId: ctx.companyId ?? null,
      });
      await audit(ctx, "create", "customer", result.id, data.name);
      return { created: true, customerId: result.id, message: `Created customer "${data.name}".` };
    }

    case "update": {
      assertCanMutate(ctx, "update customer");
      if (!Number.isFinite(cId)) throw new Error("Customer ID required");
      const existing = await dbHelpers.getCustomerById(cId, scope);
      if (!existing) throw new Error("Customer not found");
      const fields = pickFields<Record<string, any>>(data, CUSTOMER_WRITE_FIELDS);
      if (fields.creditLimit != null) fields.creditLimit = String(fields.creditLimit);
      if (Object.keys(fields).length === 0) throw new Error("No updatable customer fields provided");
      await dbHelpers.updateCustomer(cId, fields as any);
      await audit(ctx, "update", "customer", cId, existing.name);
      return { updated: true, customerId: cId, fields: Object.keys(fields) };
    }

    case "archive":
    case "delete": {
      // Customers are referenced by orders and invoices, so the record is never
      // hard-deleted: it is archived by setting status = inactive.
      assertAdmin(ctx, "archive customer");
      if (!Number.isFinite(cId)) throw new Error("Customer ID required");
      const existing = await dbHelpers.getCustomerById(cId, scope);
      if (!existing) throw new Error("Customer not found");
      if (existing.status === "inactive") {
        return { archived: false, customerId: cId, message: `Customer "${existing.name}" is already archived (inactive).` };
      }
      const [orderCount] = await db.select({ count: count() }).from(orders).where(scopedWhere(ctx, orders, eq(orders.customerId, cId)));
      await dbHelpers.updateCustomer(cId, { status: "inactive" });
      await audit(ctx, "delete", "customer", cId, existing.name);
      return {
        archived: true,
        customerId: cId,
        message: `Archived customer "${existing.name}" (status set to inactive). ${orderCount?.count || 0} order(s) were kept for history; nothing was permanently deleted.`,
      };
    }

    default:
      throw new Error(`Unknown customer action: ${action}`);
  }
}

// ============================================
// SALES ORDERS
// ============================================

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Resolve a product for an order/invoice line by id, SKU or (partial) name, within the caller's entity. */
async function resolveProduct(db: any, ctx: AIAgentContext, line: any): Promise<typeof products.$inferSelect | undefined> {
  if (line.productId != null && Number.isFinite(Number(line.productId))) {
    const [p] = await db.select().from(products).where(scopedWhere(ctx, products, eq(products.id, Number(line.productId)))).limit(1);
    return p;
  }
  const sku = typeof line.sku === "string" && line.sku.trim();
  if (sku) {
    const [p] = await db.select().from(products).where(scopedWhere(ctx, products, eq(products.sku, sku))).limit(1);
    if (p) return p;
  }
  const name = typeof (line.productName ?? line.name) === "string" && String(line.productName ?? line.name).trim();
  if (name) {
    const [exact] = await db.select().from(products).where(scopedWhere(ctx, products, eq(products.name, name))).limit(1);
    if (exact) return exact;
    const [partial] = await db.select().from(products).where(scopedWhere(ctx, products, like(products.name, `%${name}%`))).limit(1);
    return partial;
  }
  return undefined;
}

/** Order → invoice cascade from orders.update: a shipped/delivered order marks its draft invoice as sent. */
async function cascadeOrderStatusToInvoice(orderId: number, status: string): Promise<boolean> {
  if (status !== "shipped" && status !== "delivered") return false;
  try {
    const order = await dbHelpers.getOrderById(orderId);
    if (order?.invoiceId) {
      const invoice = await dbHelpers.getInvoiceById(order.invoiceId);
      if (invoice && invoice.status === "draft") {
        await dbHelpers.updateInvoice(order.invoiceId, { status: "sent" });
        return true;
      }
    }
  } catch (e) {
    console.warn("[aiAgent] Order→Invoice status cascade failed:", e);
  }
  return false;
}

async function executeManageOrder(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, orderId, data } = params;
  const oId = orderId != null ? Number(orderId) : NaN;
  const scope = chatScope(ctx);

  switch (action) {
    case "list": {
      const allOrders = await db.select().from(orders).where(companyWhere(orders, ctx)).orderBy(desc(orders.createdAt)).limit(50);
      return { orders: allOrders, total: allOrders.length };
    }

    case "get": {
      if (!Number.isFinite(oId)) throw new Error("Order ID required");
      const order = await dbHelpers.getOrderById(oId, scope);
      if (!order) throw new Error("Order not found");
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, oId));
      return { order, items };
    }

    case "create": {
      assertCanMutate(ctx, "create order");
      const d = data || {};

      // Customer: by id (scoped) or by name within the caller's entity. Optional — walk-in orders exist.
      let customer: typeof customers.$inferSelect | undefined;
      if (d.customerId != null) {
        customer = await dbHelpers.getCustomerById(Number(d.customerId), scope);
        if (!customer) throw new Error("Customer not found");
      } else if (typeof d.customerName === "string" && d.customerName.trim()) {
        const [byName] = await db.select().from(customers)
          .where(scopedWhere(ctx, customers, like(customers.name, `%${d.customerName.trim()}%`))).limit(1);
        if (!byName) throw new Error(`No customer matching "${d.customerName}" — create the customer first with manage_customer.`);
        customer = byName;
      }

      // Line items: product by id / SKU / name; unit price defaults to the product's list price.
      const rawItems = Array.isArray(d.items) ? d.items : [];
      if (rawItems.length === 0) throw new Error("An order needs at least one line item (productId or product name, quantity)");
      const lines: Array<{ productId: number | null; sku: string | null; name: string; qty: number; price: number; total: number }> = [];
      for (let idx = 0; idx < rawItems.length; idx++) {
        const item = rawItems[idx];
        const product = await resolveProduct(db, ctx, item);
        const qty = toPositiveNumber(item.quantity, `Line ${idx + 1} quantity`);
        const rawPrice = item.unitPrice ?? product?.unitPrice;
        if (rawPrice == null) {
          throw new Error(`Line ${idx + 1}: no product matched${item.productName || item.name ? ` "${item.productName || item.name}"` : ""} and no unitPrice was given`);
        }
        const price = toNonNegativeNumber(rawPrice, `Line ${idx + 1} unit price`);
        const name = product?.name || item.productName || item.name;
        if (!name) throw new Error(`Line ${idx + 1} needs a productId, sku, or product name`);
        lines.push({ productId: product?.id ?? null, sku: product?.sku ?? item.sku ?? null, name, qty, price, total: qty * price });
      }

      const subtotal = lines.reduce((s, l) => s + l.total, 0);
      const taxAmount = toNonNegativeNumber(d.taxAmount, "taxAmount");
      const shippingAmount = toNonNegativeNumber(d.shippingAmount, "shippingAmount");
      const discountAmount = toNonNegativeNumber(d.discountAmount, "discountAmount");
      const totalAmount = subtotal + taxAmount + shippingAmount - discountAmount;
      if (totalAmount < 0) throw new Error("Discount exceeds the order total");

      const orderNumber = await docNumber("ORD");
      // Same helpers as orders.create in the UI, with the caller's entity stamped on the header.
      const result = await dbHelpers.createOrder({
        companyId: ctx.companyId,
        orderNumber,
        customerId: customer?.id,
        type: "sales",
        status: "pending",
        orderDate: parseDateOr(d.orderDate, new Date()),
        shippingAddress: d.shippingAddress || customer?.address || undefined,
        billingAddress: d.billingAddress || customer?.address || undefined,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        shippingAmount: shippingAmount.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        currency: d.currency || "USD",
        notes: d.notes || "Created by AI assistant",
        createdBy: ctx.userId,
      });
      for (const l of lines) {
        await dbHelpers.createOrderItem({
          orderId: result.id,
          productId: l.productId,
          sku: l.sku,
          name: l.name,
          quantity: l.qty.toString(),
          unitPrice: l.price.toFixed(2),
          totalAmount: l.total.toFixed(2),
        });
      }
      await audit(ctx, "create", "order", result.id, orderNumber);

      return {
        created: true,
        orderId: result.id,
        orderNumber,
        customerName: customer?.name ?? null,
        itemCount: lines.length,
        subtotal: subtotal.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        status: "pending",
        message: `Created order ${orderNumber}${customer ? ` for ${customer.name}` : ""} — ${lines.length} line(s), $${totalAmount.toFixed(2)} (pending).`,
      };
    }

    case "update": {
      assertCanMutate(ctx, "update order");
      if (!Number.isFinite(oId)) throw new Error("Order ID required");
      const existing = await dbHelpers.getOrderById(oId, scope);
      if (!existing) throw new Error("Order not found");
      const d = data || {};
      const patch: Record<string, any> = {};
      if (d.status != null) {
        if (!ORDER_STATUSES.includes(d.status)) throw new Error(`Invalid order status "${d.status}" (expected one of ${ORDER_STATUSES.join(", ")})`);
        if (d.status === "shipped") throw new Error("Use the fulfill action to ship an order — it allocates stock and raises the shipment.");
        patch.status = d.status as OrderStatus;
      }
      for (const key of ["notes", "shippingAddress", "billingAddress"]) {
        if (d[key] !== undefined) patch[key] = d[key];
      }
      if (Object.keys(patch).length === 0) throw new Error("No updatable order fields provided (status, notes, shippingAddress, billingAddress)");
      await dbHelpers.updateOrder(oId, patch);
      await audit(ctx, "update", "order", oId, existing.orderNumber);
      const invoiceMarkedSent = patch.status ? await cascadeOrderStatusToInvoice(oId, patch.status) : false;
      return { updated: true, orderId: oId, orderNumber: existing.orderNumber, fields: Object.keys(patch), invoiceMarkedSent };
    }

    case "cancel": {
      assertCanMutate(ctx, "cancel order");
      if (!Number.isFinite(oId)) throw new Error("Order ID required");
      const existing = await dbHelpers.getOrderById(oId, scope);
      if (!existing) throw new Error("Order not found");
      if (existing.status === "cancelled") return { cancelled: false, orderId: oId, message: `Order ${existing.orderNumber} is already cancelled.` };
      if (existing.status === "delivered" || existing.status === "refunded") {
        throw new Error(`Order ${existing.orderNumber} is ${existing.status} and cannot be cancelled — use a return/refund instead.`);
      }
      await dbHelpers.updateOrder(oId, { status: "cancelled", ...(data?.reason ? { notes: `${existing.notes ? existing.notes + "\n" : ""}Cancelled: ${data.reason}` } : {}) });
      await audit(ctx, "update", "order", oId, existing.orderNumber);
      return { cancelled: true, orderId: oId, orderNumber: existing.orderNumber, message: `Cancelled order ${existing.orderNumber}.` };
    }

    case "fulfill": {
      assertCanMutate(ctx, "fulfill order");
      if (!Number.isFinite(oId)) throw new Error("Order ID required");
      const existing = await dbHelpers.getOrderById(oId, scope);
      if (!existing) throw new Error("Order not found");
      // Same path as the orderFulfillment workflow: allocate + reserve stock, raise the
      // outbound shipment, mark shipped, cascade the draft invoice to sent.
      const result = await dbHelpers.fulfillOrder(oId, { performedBy: ctx.userId });
      await audit(ctx, "update", "order", oId, existing.orderNumber);
      return {
        fulfilled: true,
        ...result,
        message: `Fulfilled order ${result.orderNumber}: reserved ${result.allocations.length} line(s), raised shipment ${result.shipmentNumber}, status shipped${result.invoiceMarkedSent ? ", linked invoice marked sent" : ""}.`,
      };
    }

    case "archive":
    case "delete": {
      // Orders own line items and are referenced by shipments/invoices; the UI's hard delete
      // is not exposed here. Archiving cancels the order and keeps the history.
      assertAdmin(ctx, "archive order");
      if (!Number.isFinite(oId)) throw new Error("Order ID required");
      const existing = await dbHelpers.getOrderById(oId, scope);
      if (!existing) throw new Error("Order not found");
      if (existing.status === "cancelled") {
        return { archived: false, orderId: oId, message: `Order ${existing.orderNumber} is already cancelled/archived.` };
      }
      const [lineCount] = await db.select({ count: count() }).from(orderItems).where(eq(orderItems.orderId, oId));
      await dbHelpers.updateOrder(oId, { status: "cancelled" });
      await audit(ctx, "delete", "order", oId, existing.orderNumber);
      return {
        archived: true,
        orderId: oId,
        orderNumber: existing.orderNumber,
        message: `Archived order ${existing.orderNumber} (status set to cancelled). ${lineCount?.count || 0} line item(s) were kept for history; nothing was permanently deleted.`,
      };
    }

    default:
      throw new Error(`Unknown order action: ${action}`);
  }
}

// ============================================
// INVOICES & PAYMENTS (finance roles)
// ============================================

const PAYMENT_METHODS = ["cash", "check", "bank_transfer", "credit_card", "ach", "wire", "other"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Journal entry for a received payment, exactly as invoices.recordPayment posts it: Debit Cash (1000) / Credit AR (1200). */
async function postPaymentJournalEntry(input: { paymentId: number; invoiceNumber: string; companyId: number | null | undefined; amount: string; userId: number; date: Date }) {
  try {
    const paymentNumber = `PAY-${input.paymentId}`;
    const txn = await dbHelpers.createTransaction({
      companyId: input.companyId || 1,
      transactionNumber: `JE-PAY-${paymentNumber}`,
      type: "payment",
      referenceType: "payment",
      referenceId: input.paymentId,
      date: input.date,
      description: `Journal entry for payment on Invoice ${input.invoiceNumber}`,
      totalAmount: input.amount,
      status: "posted",
      createdBy: input.userId,
      postedBy: input.userId,
      postedAt: input.date,
    });
    const cid = input.companyId ?? undefined;
    const cashAccount = (await dbHelpers.getAccountByCode("1000", cid)) || (await dbHelpers.getAccountByName("Cash", cid));
    const arAccount = (await dbHelpers.getAccountByCode("1200", cid)) || (await dbHelpers.getAccountByName("Accounts Receivable", cid));
    if (cashAccount) {
      await dbHelpers.createTransactionLine({ transactionId: txn.id, accountId: cashAccount.id, debit: input.amount, credit: "0", description: `Cash received - Invoice ${input.invoiceNumber}` });
    }
    if (arAccount) {
      await dbHelpers.createTransactionLine({ transactionId: txn.id, accountId: arAccount.id, debit: "0", credit: input.amount, description: `AR reduced - Invoice ${input.invoiceNumber}` });
    }
    return txn.id;
  } catch (e) {
    console.warn("[aiAgent] Journal entry for payment failed:", e);
    return null;
  }
}

async function executeManageInvoice(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, invoiceId, orderId, data } = params;
  const iId = invoiceId != null ? Number(invoiceId) : NaN;
  const scope = chatScope(ctx);

  const loadInvoice = async (id: number) => {
    const inv = await dbHelpers.getInvoiceById(id);
    assertInScope(ctx, inv, "Invoice");
    return inv;
  };

  switch (action) {
    case "list": {
      const rows = await dbHelpers.getInvoices(scope, data?.status ? { status: data.status } : undefined);
      return { invoices: rows.slice(0, 50), total: rows.length };
    }

    case "get": {
      if (!Number.isFinite(iId)) throw new Error("Invoice ID required");
      const inv = await dbHelpers.getInvoiceWithItems(iId);
      assertInScope(ctx, inv, "Invoice");
      return { invoice: inv };
    }

    case "create": {
      assertCanMutateFinance(ctx, "create invoice");
      const d = data || {};
      const now = new Date();
      const oId = orderId != null ? Number(orderId) : (d.orderId != null ? Number(d.orderId) : NaN);

      let customer: typeof customers.$inferSelect | undefined;
      let lines: Array<{ productId: number | null; description: string; qty: number; price: number; total: number }> = [];
      let subtotal: number;
      let taxAmount: number;
      let discountAmount: number;
      let totalAmount: number;
      let currency = d.currency || "USD";
      let sourceOrder: typeof orders.$inferSelect | undefined;

      if (Number.isFinite(oId)) {
        // From an order: same customer, same lines and totals; the order is then linked to the invoice.
        sourceOrder = await dbHelpers.getOrderById(oId, scope);
        if (!sourceOrder) throw new Error("Order not found");
        if (sourceOrder.invoiceId) throw new Error(`Order ${sourceOrder.orderNumber} already has invoice #${sourceOrder.invoiceId}`);
        if (sourceOrder.status === "cancelled" || sourceOrder.status === "refunded") throw new Error(`Order ${sourceOrder.orderNumber} is ${sourceOrder.status} and cannot be invoiced`);
        const items = await dbHelpers.getOrderItems(oId);
        if (items.length === 0) throw new Error(`Order ${sourceOrder.orderNumber} has no line items to invoice`);
        lines = items.map((it) => {
          const qty = parseFloat(it.quantity);
          const price = parseFloat(it.unitPrice);
          return { productId: it.productId ?? null, description: it.name, qty, price, total: parseFloat(it.totalAmount) || qty * price };
        });
        if (sourceOrder.customerId) customer = await dbHelpers.getCustomerById(sourceOrder.customerId, scope);
        subtotal = parseFloat(sourceOrder.subtotal);
        taxAmount = parseFloat(sourceOrder.taxAmount || "0");
        discountAmount = parseFloat(sourceOrder.discountAmount || "0");
        totalAmount = parseFloat(sourceOrder.totalAmount);
        currency = sourceOrder.currency || currency;
      } else {
        // Explicit lines: customer required.
        if (d.customerId == null) throw new Error("An invoice needs a customerId (or an orderId to invoice from)");
        customer = await dbHelpers.getCustomerById(Number(d.customerId), scope);
        if (!customer) throw new Error("Customer not found");
        const rawItems = Array.isArray(d.items) ? d.items : [];
        if (rawItems.length === 0) throw new Error("An invoice needs at least one line item (description, quantity, unitPrice)");
        for (let idx = 0; idx < rawItems.length; idx++) {
          const item = rawItems[idx];
          const product = await resolveProduct(db, ctx, item);
          const qty = toPositiveNumber(item.quantity, `Line ${idx + 1} quantity`);
          const rawPrice = item.unitPrice ?? product?.unitPrice;
          if (rawPrice == null) throw new Error(`Line ${idx + 1} needs a unitPrice (or a product it can be read from)`);
          const price = toNonNegativeNumber(rawPrice, `Line ${idx + 1} unit price`);
          const description = item.description || product?.name || item.productName || item.name;
          if (!description) throw new Error(`Line ${idx + 1} needs a description`);
          lines.push({ productId: product?.id ?? null, description, qty, price, total: qty * price });
        }
        subtotal = lines.reduce((s, l) => s + l.total, 0);
        taxAmount = toNonNegativeNumber(d.taxAmount, "taxAmount");
        discountAmount = toNonNegativeNumber(d.discountAmount, "discountAmount");
        totalAmount = subtotal + taxAmount - discountAmount;
        if (totalAmount < 0) throw new Error("Discount exceeds the invoice total");
      }

      const termsDays = Number(customer?.paymentTerms ?? 30) || 30;
      const dueDate = parseDateOr(d.dueDate, new Date(now.getTime() + termsDays * 24 * 60 * 60 * 1000));
      const invoiceNumber = await docNumber("INV");
      const companyId = sourceOrder?.companyId ?? ctx.companyId ?? undefined;

      // Same helpers + ledger posting as invoices.create in the UI.
      const result = await dbHelpers.createInvoice({
        companyId,
        invoiceNumber,
        customerId: customer?.id,
        type: "invoice",
        status: "draft",
        issueDate: now,
        dueDate,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        currency,
        notes: d.notes || (sourceOrder ? `Invoice for order ${sourceOrder.orderNumber}` : "Created by AI assistant"),
        terms: d.terms || undefined,
        createdBy: ctx.userId,
      });
      for (const l of lines) {
        await dbHelpers.createInvoiceItem({
          invoiceId: result.id,
          productId: l.productId,
          description: l.description,
          quantity: l.qty.toString(),
          unitPrice: l.price.toFixed(2),
          totalAmount: l.total.toFixed(2),
        });
      }
      if (sourceOrder) await dbHelpers.updateOrder(sourceOrder.id, { invoiceId: result.id });
      await audit(ctx, "create", "invoice", result.id, invoiceNumber);
      const posting = await postInvoiceJournalEntry({ invoiceId: result.id, invoiceNumber, companyId, totalAmount: totalAmount.toFixed(2), userId: ctx.userId, date: now });

      return {
        created: true,
        invoiceId: result.id,
        invoiceNumber,
        customerName: customer?.name ?? null,
        orderNumber: sourceOrder?.orderNumber ?? null,
        itemCount: lines.length,
        totalAmount: totalAmount.toFixed(2),
        dueDate: dueDate.toISOString(),
        status: "draft",
        journalTransactionId: posting?.transactionId ?? null,
        message: `Created draft invoice ${invoiceNumber}${customer ? ` for ${customer.name}` : ""}${sourceOrder ? ` from order ${sourceOrder.orderNumber}` : ""} — $${totalAmount.toFixed(2)}, due ${dueDate.toISOString().slice(0, 10)}.`,
      };
    }

    case "send": {
      // Mark sent (same as invoices.approve). Emailing the customer is a separate step: send_email.
      assertCanMutateFinance(ctx, "send invoice");
      if (!Number.isFinite(iId)) throw new Error("Invoice ID required");
      const inv = await loadInvoice(iId);
      if (inv.status !== "draft") {
        return { sent: false, invoiceId: iId, invoiceNumber: inv.invoiceNumber, status: inv.status, message: `Invoice ${inv.invoiceNumber} is already ${inv.status}.` };
      }
      await dbHelpers.updateInvoice(iId, { status: "sent", approvedBy: ctx.userId, approvedAt: new Date() });
      await audit(ctx, "approve", "invoice", iId, inv.invoiceNumber);
      return { sent: true, invoiceId: iId, invoiceNumber: inv.invoiceNumber, status: "sent", message: `Marked invoice ${inv.invoiceNumber} as sent. Use send_email to deliver it to the customer.` };
    }

    case "record_payment": {
      // Mirrors invoices.recordPayment: payment row, invoice paid amount/status, order cascade, journal entry.
      assertCanMutateFinance(ctx, "record payment");
      if (!Number.isFinite(iId)) throw new Error("Invoice ID required");
      const d = data || {};
      const inv = await loadInvoice(iId);
      if (inv.status === "cancelled") throw new Error(`Invoice ${inv.invoiceNumber} is cancelled`);
      const amount = toPositiveNumber(d.amount, "Payment amount");
      const method: PaymentMethod = PAYMENT_METHODS.includes(d.method) ? d.method : (PAYMENT_METHODS.includes(d.paymentMethod) ? d.paymentMethod : "bank_transfer");
      const paymentDate = parseDateOr(d.date ?? d.paymentDate, new Date());
      const amountStr = amount.toFixed(2);

      const paymentResult = await dbHelpers.createPayment({
        companyId: inv.companyId,
        type: "received",
        status: "completed",
        amount: amountStr,
        currency: inv.currency || "USD",
        paymentMethod: method,
        paymentNumber: `PAY-${Date.now()}`,
        paymentDate,
        invoiceId: iId,
        customerId: inv.customerId ?? undefined,
        referenceNumber: d.reference || d.referenceNumber || undefined,
        notes: d.notes || `Payment received for invoice ${inv.invoiceNumber}`,
        createdBy: ctx.userId,
      });

      const totalPaid = parseFloat(inv.paidAmount || "0") + amount;
      const totalDue = parseFloat(inv.totalAmount);
      const newStatus = totalPaid >= totalDue ? "paid" : "partial";
      await dbHelpers.updateInvoice(iId, { paidAmount: totalPaid.toFixed(2), status: newStatus });
      await audit(ctx, "update", "invoice", iId, `Payment recorded: ${amountStr}`);

      // Cascade #16b: invoice fully paid → linked order delivered.
      let orderMarkedDelivered: number | null = null;
      if (newStatus === "paid") {
        try {
          const linked = (await dbHelpers.getOrders(scope)).find((o: any) => o.invoiceId === iId);
          if (linked && linked.status !== "delivered" && linked.status !== "cancelled") {
            await dbHelpers.updateOrder(linked.id, { status: "delivered" });
            orderMarkedDelivered = linked.id;
          }
        } catch (e) {
          console.warn("[aiAgent] Invoice paid→Order delivered cascade failed:", e);
        }
      }

      const journalTransactionId = await postPaymentJournalEntry({
        paymentId: paymentResult.id, invoiceNumber: inv.invoiceNumber, companyId: inv.companyId, amount: amountStr, userId: ctx.userId, date: paymentDate,
      });

      return {
        recorded: true,
        paymentId: paymentResult.id,
        invoiceId: iId,
        invoiceNumber: inv.invoiceNumber,
        amount: amountStr,
        method,
        newStatus,
        totalPaid: totalPaid.toFixed(2),
        balance: Math.max(totalDue - totalPaid, 0).toFixed(2),
        orderMarkedDelivered,
        journalTransactionId,
        message: `Recorded $${amountStr} ${method.replace(/_/g, " ")} payment on invoice ${inv.invoiceNumber} — now ${newStatus} (${totalPaid.toFixed(2)} of ${totalDue.toFixed(2)}).`,
      };
    }

    default:
      throw new Error(`Unknown invoice action: ${action}`);
  }
}

// ============================================
// FREIGHT
// ============================================

async function executeManageFreight(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { action, rfqData, bookingId, rfqId, quoteId } = params;

  switch (action) {
    case "list_carriers": {
      // Carriers are a shared directory (no entity column).
      const carriers = await db.select().from(freightCarriers);
      return { carriers, total: carriers.length };
    }

    case "create_rfq": {
      assertCanMutate(ctx, "create freight RFQ");
      if (!rfqData?.title) throw new Error("Freight RFQ requires a title");
      // Create the RFQ for real (draft). Live approval is Plan-first mode.
      const rfq = await createFreightRfq({ ...rfqData, companyId: ctx.companyId, status: rfqData.status || "draft", createdById: ctx.userId });
      return {
        created: true,
        freightRfqId: rfq.id,
        rfqNumber: rfq.rfqNumber,
        message: `Created freight RFQ ${rfq.rfqNumber} (${rfqData.status || "draft"}).`,
      };
    }

    case "get_quotes": {
      // Quotes carry no entity column; they are scoped through their RFQ.
      if (rfqId != null) {
        const rfq = await dbHelpers.getFreightRfqById(Number(rfqId));
        assertInScope(ctx, rfq, "Freight RFQ");
        const quotes = await dbHelpers.getFreightQuotes(rfq.id);
        return { rfqNumber: rfq.rfqNumber, quotes, total: quotes.length };
      }
      const rows = await db.select({ quote: freightQuotes, rfqNumber: freightRfqs.rfqNumber })
        .from(freightQuotes)
        .innerJoin(freightRfqs, eq(freightQuotes.rfqId, freightRfqs.id))
        .where(companyWhere(freightRfqs, ctx));
      const quotes = rows.map((r) => ({ ...r.quote, rfqNumber: r.rfqNumber }));
      return { quotes, total: quotes.length };
    }

    case "book_shipment": {
      // Same steps as freight.quotes.accept in the UI: accept the quote, reject the
      // siblings, create the booking, award the RFQ.
      assertCanMutate(ctx, "book freight shipment");
      const qId = Number(quoteId ?? params.bookingData?.quoteId);
      if (!Number.isFinite(qId)) throw new Error("A quoteId is required to book a shipment (see get_quotes)");
      const quote = await dbHelpers.getFreightQuoteById(qId);
      if (!quote) throw new Error("Freight quote not found");
      const rfq = await dbHelpers.getFreightRfqById(quote.rfqId);
      assertInScope(ctx, rfq, "Freight RFQ");
      if (quote.status === "accepted") throw new Error(`Quote ${quote.quoteNumber || qId} is already accepted and booked`);
      if (quote.status === "rejected" || quote.status === "expired") throw new Error(`Quote ${quote.quoteNumber || qId} is ${quote.status} and cannot be booked`);

      await dbHelpers.updateFreightQuote(qId, { status: "accepted" });
      const otherQuotes = await dbHelpers.getFreightQuotes(quote.rfqId);
      for (const q of otherQuotes) {
        if (q.id !== qId && q.status !== "rejected") {
          await dbHelpers.updateFreightQuote(q.id, { status: "rejected" });
        }
      }
      const booking = await dbHelpers.createFreightBooking({
        companyId: rfq.companyId ?? ctx.companyId ?? null,
        quoteId: qId,
        rfqId: quote.rfqId,
        carrierId: quote.carrierId,
        status: "pending",
        agreedCost: quote.totalCost,
        currency: quote.currency || "USD",
        bookingDate: new Date(),
        notes: params.bookingData?.notes || undefined,
      });
      await dbHelpers.updateFreightRfq(quote.rfqId, { status: "awarded" });
      await audit(ctx, "approve", "freight_quote", qId, `Booking ${booking.bookingNumber} created`);

      return {
        booked: true,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        rfqNumber: rfq.rfqNumber,
        carrierId: quote.carrierId,
        agreedCost: quote.totalCost,
        currency: quote.currency || "USD",
        message: `Booked shipment ${booking.bookingNumber} on RFQ ${rfq.rfqNumber} with carrier #${quote.carrierId} for ${quote.currency || "USD"} ${quote.totalCost ?? "n/a"} (pending confirmation).`,
      };
    }

    case "track": {
      if (!bookingId) {
        const bookings = await db.select().from(freightBookings).where(companyWhere(freightBookings, ctx));
        return { bookings, total: bookings.length };
      }
      const booking = await db.select().from(freightBookings).where(scopedWhere(ctx, freightBookings, eq(freightBookings.id, Number(bookingId)))).limit(1);
      if (!booking[0]) throw new Error("Freight booking not found");
      return { booking: booking[0] };
    }

    default:
      throw new Error(`Unknown freight action: ${action}`);
  }
}

// ============================================
// REPORTS
// ============================================

async function executeGenerateReport(params: any, ctx: AIAgentContext): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { reportType, dateRange, format = "summary" } = params;

  const startDate = dateRange?.startDate ? new Date(dateRange.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : new Date();
  const period = { startDate: startDate.toISOString(), endDate: endDate.toISOString() };

  switch (reportType) {
    case "sales_summary": {
      // Use database WHERE clause instead of loading all orders into memory
      const filteredOrders = await db.select().from(orders)
        .where(scopedWhere(ctx, orders, gte(orders.createdAt, startDate), lte(orders.createdAt, endDate)));

      const totalRevenue = filteredOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);

      return {
        reportType: "sales_summary",
        period,
        totalOrders: filteredOrders.length,
        totalRevenue: totalRevenue.toFixed(2),
        avgOrderValue: filteredOrders.length > 0 ? (totalRevenue / filteredOrders.length).toFixed(2) : "0.00",
      };
    }

    case "inventory_status": {
      // Use DB aggregation instead of loading entire table
      const [totalCount] = await db.select({ count: count() }).from(inventory).where(companyWhere(inventory, ctx));
      const [lowStockCount] = await db.select({ count: count() }).from(inventory)
        .where(scopedWhere(ctx, inventory, lt(sql`CAST(${inventory.quantity} AS DECIMAL)`, 10)));
      const items = format === "detailed"
        ? await db.select().from(inventory).where(companyWhere(inventory, ctx))
        : await db.select().from(inventory).where(companyWhere(inventory, ctx)).limit(10);

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
        .where(companyWhere(purchaseOrders, ctx))
        .groupBy(purchaseOrders.vendorId);

      const vendorIds = vendorPOStats.map(s => s.vendorId).filter((id): id is number => id != null);
      const vendorList = vendorIds.length > 0
        ? await db.select().from(vendors).where(scopedWhere(ctx, vendors, inArray(vendors.id, vendorIds)))
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

    case "customer_analysis": {
      // Revenue and order count per customer in the period, plus new-customer growth.
      const stats = await db.select({
        customerId: orders.customerId,
        orderCount: count(),
        revenue: sum(orders.totalAmount),
      }).from(orders)
        .where(scopedWhere(ctx, orders, gte(orders.createdAt, startDate), lte(orders.createdAt, endDate)))
        .groupBy(orders.customerId);

      const customerIds = stats.map(s => s.customerId).filter((id): id is number => id != null);
      const customerList = customerIds.length > 0
        ? await db.select().from(customers).where(scopedWhere(ctx, customers, inArray(customers.id, customerIds)))
        : [];
      const customerMap = new Map(customerList.map(c => [c.id, c]));

      const ranked = stats
        .map(s => ({
          customerId: s.customerId,
          customerName: s.customerId != null ? (customerMap.get(s.customerId)?.name || "Unknown") : "(no customer)",
          orderCount: Number(s.orderCount),
          revenue: parseFloat(s.revenue || "0"),
        }))
        .sort((a, b) => b.revenue - a.revenue);

      const totalRevenue = ranked.reduce((s, r) => s + r.revenue, 0);
      const [totalCustomers] = await db.select({ count: count() }).from(customers).where(companyWhere(customers, ctx));
      const [activeCustomers] = await db.select({ count: count() }).from(customers).where(scopedWhere(ctx, customers, eq(customers.status, "active")));
      const [newCustomers] = await db.select({ count: count() }).from(customers)
        .where(scopedWhere(ctx, customers, gte(customers.createdAt, startDate), lte(customers.createdAt, endDate)));

      return {
        reportType: "customer_analysis",
        period,
        totalCustomers: totalCustomers?.count || 0,
        activeCustomers: activeCustomers?.count || 0,
        newCustomersInPeriod: newCustomers?.count || 0,
        customersWithOrders: ranked.filter(r => r.customerId != null).length,
        totalRevenue: totalRevenue.toFixed(2),
        topCustomers: (format === "detailed" ? ranked : ranked.slice(0, 10)).map(r => ({
          ...r,
          revenue: r.revenue.toFixed(2),
          revenueShare: totalRevenue > 0 ? `${((r.revenue / totalRevenue) * 100).toFixed(1)}%` : "0%",
        })),
      };
    }

    case "production_status": {
      const byStatus = await db.select({
        status: workOrders.status,
        count: count(),
        quantity: sum(workOrders.quantity),
        completedQuantity: sum(workOrders.completedQuantity),
      }).from(workOrders)
        .where(companyWhere(workOrders, ctx))
        .groupBy(workOrders.status);

      const now = new Date();
      const overdue = await db.select().from(workOrders)
        .where(scopedWhere(ctx, workOrders,
          inArray(workOrders.status, ["scheduled", "in_progress"]),
          lt(workOrders.scheduledEndDate, now),
        ));
      const recent = await db.select().from(workOrders)
        .where(scopedWhere(ctx, workOrders, gte(workOrders.createdAt, startDate), lte(workOrders.createdAt, endDate)))
        .orderBy(desc(workOrders.createdAt))
        .limit(format === "detailed" ? 100 : 10);

      const statusMap: Record<string, { count: number; quantity: string; completedQuantity: string }> = {};
      let total = 0;
      for (const row of byStatus) {
        const n = Number(row.count);
        total += n;
        statusMap[row.status] = { count: n, quantity: parseFloat(row.quantity || "0").toFixed(2), completedQuantity: parseFloat(row.completedQuantity || "0").toFixed(2) };
      }

      return {
        reportType: "production_status",
        period,
        totalWorkOrders: total,
        byStatus: statusMap,
        inProgress: statusMap["in_progress"]?.count || 0,
        completed: statusMap["completed"]?.count || 0,
        overdueCount: overdue.length,
        overdueWorkOrders: overdue.slice(0, 10).map(wo => ({ id: wo.id, workOrderNumber: wo.workOrderNumber, status: wo.status, scheduledEndDate: wo.scheduledEndDate, quantity: wo.quantity })),
        recentWorkOrders: recent,
      };
    }

    case "order_fulfillment": {
      const byStatus = await db.select({ status: orders.status, count: count(), value: sum(orders.totalAmount) })
        .from(orders)
        .where(scopedWhere(ctx, orders, gte(orders.createdAt, startDate), lte(orders.createdAt, endDate)))
        .groupBy(orders.status);
      const shipmentStats = await db.select({ status: shipments.status, count: count() })
        .from(shipments)
        .where(scopedWhere(ctx, shipments, eq(shipments.type, "outbound"), gte(shipments.createdAt, startDate), lte(shipments.createdAt, endDate)))
        .groupBy(shipments.status);
      const openOrders = await db.select().from(orders)
        .where(scopedWhere(ctx, orders, inArray(orders.status, ["pending", "confirmed", "processing"])))
        .orderBy(orders.createdAt)
        .limit(format === "detailed" ? 100 : 10);

      const statusMap: Record<string, { count: number; value: string }> = {};
      let total = 0;
      for (const row of byStatus) {
        const n = Number(row.count);
        total += n;
        statusMap[row.status] = { count: n, value: parseFloat(row.value || "0").toFixed(2) };
      }
      const fulfilled = (statusMap["shipped"]?.count || 0) + (statusMap["delivered"]?.count || 0);
      const cancelled = (statusMap["cancelled"]?.count || 0) + (statusMap["refunded"]?.count || 0);
      const fulfillable = total - cancelled;

      return {
        reportType: "order_fulfillment",
        period,
        totalOrders: total,
        byStatus: statusMap,
        fulfilledOrders: fulfilled,
        openOrders: fulfillable - fulfilled,
        cancelledOrders: cancelled,
        fulfillmentRate: fulfillable > 0 ? `${((fulfilled / fulfillable) * 100).toFixed(1)}%` : "n/a",
        outboundShipments: Object.fromEntries(shipmentStats.map(s => [s.status, Number(s.count)])),
        oldestOpenOrders: openOrders.map(o => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, totalAmount: o.totalAmount, orderDate: o.orderDate, customerId: o.customerId })),
      };
    }

    case "financial_overview": {
      const allInvoices = await db.select().from(invoices).where(companyWhere(invoices, ctx));
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
  assertCanMutate(ctx, "create task");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { taskType, priority = "medium", description, taskData } = params;
  // A caller-supplied `requiresApproval: false` writes the task as "approved",
  // which the scheduler then executes (POs, vendor emails) without the approval
  // queue. Only mutation roles may skip approval; everyone else is forced to
  // pending_approval regardless of what the model passed.
  const requiresApproval = params.requiresApproval === false && MUTATION_ROLES.includes(ctx.userRole) ? false : true;

  const task = await db.insert(aiAgentTasks).values({
    companyId: ctx.companyId ?? null,
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
// auto-approved (the background scheduler runs them) — but only for mutation
// roles; every other role can queue an errand, and it always waits for approval.
// Medium/high-risk errands land in the Approval Queue as a plan the user reviews
// before anything runs.
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
  // Low-risk errands run automatically for mutation roles only. The executor
  // replays the errand with the submitter's role, so a non-mutation user's
  // errand must always go through the approval queue (an approver with the
  // right role owns the side effects).
  const canAutoApprove = MUTATION_ROLES.includes(ctx.userRole);
  const requiresApproval = riskLevel !== "low" || !canAutoApprove;
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
      ? (riskLevel === "low" && !canAutoApprove
          ? "Plan queued for approval — your role cannot auto-run errands, so an ops/admin/exec user must approve it before it runs."
          : "Plan ready for your approval — review the steps and approve to run it now.")
      : "Low-risk errand — approved automatically and running now.",
  };
}

// ============================================
// CALENDAR TOOL EXECUTION
// ============================================

async function executeManageCalendar(params: any, ctx: AIAgentContext): Promise<any> {
  // Gate before touching the token: creating events is a write on the user's
  // calendar with attendee side effects (invites go out).
  if (params.action === "create_event") assertCanMutate(ctx, "create calendar event");

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

async function executeQueryCrm(params: any, ctx: AIAgentContext): Promise<any> {
  // Gather CRM data for the caller's entity (pipelines are a shared config table).
  const cid = ctx.companyId;
  const [contacts, deals, pipelines] = await Promise.all([
    dbHelpers.getCrmContacts(cid != null ? { companyId: cid } : undefined),
    dbHelpers.getCrmDeals(cid != null ? { companyId: cid } : undefined),
    dbHelpers.getCrmPipelines(),
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

/**
 * Gather the context lines for one query_system module, confined to the caller's
 * entity. Exported so tests can assert the scoping without going through the LLM.
 */
export async function gatherQuerySystemContext(module: string, ctx: AIAgentContext): Promise<string> {
  const scope = chatScope(ctx);
  const cid = ctx.companyId;
  const filter = companyFilter(ctx);
  // Rows from helpers with no entity filter of their own are filtered here.
  const inScope = <T extends { companyId?: number | null }>(rows: T[]): T[] =>
    cid == null ? rows : rows.filter((r) => r.companyId === cid);

  switch (module) {
    case "inventory": {
      const inventoryRows = await dbHelpers.getInventory(scope);
      const warehouses = await dbHelpers.getWarehouses(filter);
      return `Inventory (${inventoryRows.length} items):\n${inventoryRows.slice(0, 50).map((i: any) => `- ${i.product?.name || i.sku || 'Item'}: Qty=${i.quantity}, Reserved=${i.reservedQuantity || 0}, Location=${i.warehouse?.name || 'N/A'}`).join('\n')}\n\nWarehouses: ${warehouses.map((w: any) => w.name).join(', ')}`;
    }
    case "work_orders":
    case "manufacturing": {
      const wos = await dbHelpers.getWorkOrders(filter);
      return `Work Orders (${wos.length}):\n${wos.slice(0, 30).map((wo: any) => `- ${wo.workOrderNumber}: ${wo.product?.name || 'Product'} | Status=${wo.status} | Qty=${wo.quantity} | Due=${wo.scheduledEndDate || 'N/A'}`).join('\n')}`;
    }
    case "purchase_orders": {
      const pos = await dbHelpers.getPurchaseOrders(filter);
      return `Purchase Orders (${pos.length}):\n${pos.slice(0, 30).map((po: any) => `- ${po.poNumber}: Vendor=${po.vendor?.name || 'N/A'} | Total=$${po.totalAmount} | Status=${po.status} | Date=${po.orderDate}`).join('\n')}`;
    }
    case "vendors": {
      const vendorRows = await dbHelpers.getVendors(scope);
      return `Vendors (${vendorRows.length}):\n${vendorRows.slice(0, 30).map((v: any) => `- ${v.name}: Email=${v.email || 'N/A'} | Type=${v.type || 'supplier'} | Terms=${v.paymentTerms || 'N/A'} days`).join('\n')}`;
    }
    case "customers": {
      const customerRows = await dbHelpers.getCustomers(scope);
      return `Customers (${customerRows.length}):\n${customerRows.slice(0, 30).map((c: any) => `- ${c.name}: Email=${c.email || 'N/A'} | Phone=${c.phone || 'N/A'}`).join('\n')}`;
    }
    case "orders": {
      const orderRows = await dbHelpers.getOrders(scope);
      return `Orders (${orderRows.length}):\n${orderRows.slice(0, 30).map((o: any) => `- ${o.orderNumber}: Customer=${o.customer?.name || 'N/A'} | Total=$${o.totalAmount} | Status=${o.status}`).join('\n')}`;
    }
    case "invoices": {
      const invoiceRows = await dbHelpers.getInvoices(scope);
      return `Invoices (${invoiceRows.length}):\n${invoiceRows.slice(0, 30).map((i: any) => `- ${i.invoiceNumber}: $${i.totalAmount} | Status=${i.status} | Due=${i.dueDate || 'N/A'}`).join('\n')}`;
    }
    case "payments": {
      const payments = await dbHelpers.getPayments(scope);
      return `Payments (${payments.length}):\n${payments.slice(0, 30).map((p: any) => `- $${p.amount} | Method=${p.paymentMethod || 'N/A'} | Date=${p.paymentDate || 'N/A'}`).join('\n')}`;
    }
    case "shipments": {
      const shipmentRows = await dbHelpers.getShipments(filter);
      return `Shipments (${shipmentRows.length}):\n${shipmentRows.slice(0, 30).map((s: any) => `- ${s.trackingNumber || 'No tracking'}: Status=${s.status} | Carrier=${s.carrier || 'N/A'}`).join('\n')}`;
    }
    case "cap_table":
    case "equity": {
      const stakeholders = await dbHelpers.getStakeholders(cid);
      const grants = await dbHelpers.getEquityGrants(cid);
      const shareClasses = await dbHelpers.getShareClasses(cid);
      return `Share Classes: ${shareClasses.map((sc: any) => `${sc.name} (${sc.type})`).join(', ')}\n\nStakeholders (${stakeholders.length}):\n${stakeholders.slice(0, 30).map((s: any) => `- ${s.name}: Type=${s.type} | Email=${s.email || 'N/A'}`).join('\n')}\n\nGrants (${grants.length}):\n${grants.slice(0, 30).map((g: any) => `- Stakeholder=${g.stakeholderId} | Shares=${g.shares} | Type=${g.grantType} | Status=${g.status} | Vested=${g.sharesVested || 0}`).join('\n')}`;
    }
    case "data_room": {
      const rooms = await dbHelpers.getDataRooms(undefined, cid);
      let out = `Data Rooms (${rooms.length}):\n${rooms.map((r: any) => `- ${r.name}: Status=${r.status} | Visitors=${r.visitorCount || 0}`).join('\n')}`;
      // Also get visitors (only for rooms already confirmed in scope)
      try {
        for (const room of rooms.slice(0, 3)) {
          const visitors = await dbHelpers.getDataRoomVisitors(room.id);
          if (visitors.length > 0) {
            out += `\n\nVisitors for "${room.name}": ${visitors.slice(0, 10).map((v: any) => `${v.name || v.email} (${v.lastViewedAt || v.createdAt})`).join(', ')}`;
          }
        }
      } catch {}
      return out;
    }
    case "projects":
    case "tasks": {
      const projects = await dbHelpers.getProjects(filter);
      let out = `Projects (${projects.length}):\n${projects.slice(0, 20).map((p: any) => `- ${p.name}: Status=${p.status} | Priority=${p.priority || 'N/A'}`).join('\n')}`;
      // Tasks carry no entity column: keep only tasks of the projects visible above.
      try {
        const visibleProjectIds = new Set(projects.map((p: any) => p.id));
        const allTasks = await dbHelpers.getAllProjectTasks();
        const tasks = cid == null ? allTasks : allTasks.filter((t: any) => visibleProjectIds.has(t.projectId));
        out += `\n\nTasks (${tasks.length}):\n${tasks.slice(0, 30).map((t: any) => `- ${t.name}: Status=${t.status} | Priority=${t.priority || 'N/A'} | Due=${t.dueDate || 'N/A'} | Project=${t.projectId}`).join('\n')}`;
      } catch {}
      return out;
    }
    case "banking": {
      const transactions = await dbHelpers.getBankTransactions(filter);
      return `Bank Transactions (${transactions.length}):\n${transactions.slice(0, 30).map((t: any) => `- ${t.date}: ${t.type} $${t.amount} | ${t.counterpartyName || t.description} | Category=${t.category || 'uncategorized'}`).join('\n')}`;
    }
    case "copacker": {
      try {
        const copackerInvoices = inScope(await dbHelpers.getCopackerInvoices());
        const updates = inScope(await dbHelpers.getCopackerInventoryUpdates());
        let out = `Copacker Invoices: ${copackerInvoices.length}\nInventory Updates: ${updates.length}`;
        if (copackerInvoices.length) {
          out += `\n${copackerInvoices.slice(0, 10).map((i: any) => `- Invoice ${i.invoiceNumber}: $${i.totalAmount} | Status=${i.status}`).join('\n')}`;
        }
        return out;
      } catch { return "Copacker data not available"; }
    }
    case "employees": {
      const employees = await dbHelpers.getEmployees(filter);
      return `Employees (${employees.length}):\n${employees.slice(0, 30).map((e: any) => `- ${e.firstName} ${e.lastName}: ${e.jobTitle || 'N/A'} | Dept=${e.departmentId || 'N/A'} | Status=${e.status || 'active'}`).join('\n')}`;
    }
    case "contracts": {
      const contracts = await dbHelpers.getContracts(filter);
      return `Contracts (${contracts.length}):\n${contracts.slice(0, 20).map((c: any) => `- ${c.title}: Type=${c.type} | Status=${c.status} | Value=$${c.value || 'N/A'}`).join('\n')}`;
    }
    case "reports":
    default: {
      // General query - gather summary data from multiple modules
      const [orderRows, invoiceRows, customerRows, vendorRows, employees, inventoryRows, pos] = await Promise.all([
        dbHelpers.getOrders(scope), dbHelpers.getInvoices(scope), dbHelpers.getCustomers(scope),
        dbHelpers.getVendors(scope), dbHelpers.getEmployees(filter), dbHelpers.getInventory(scope),
        dbHelpers.getPurchaseOrders(filter),
      ]);
      return `System Summary:
- Orders: ${orderRows.length}
- Invoices: ${invoiceRows.length} (Paid: ${invoiceRows.filter((i: any) => i.status === 'paid').length}, Overdue: ${invoiceRows.filter((i: any) => i.status === 'overdue').length})
- Customers: ${customerRows.length}
- Vendors: ${vendorRows.length}
- Employees: ${employees.length}
- Inventory items: ${inventoryRows.length}
- Purchase Orders: ${pos.length} (Open: ${pos.filter((p: any) => ['draft','sent','confirmed'].includes(p.status)).length})
- Total Revenue: $${invoiceRows.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0).toLocaleString()}`;
    }
  }
}

async function executeQuerySystem(params: any, ctx: AIAgentContext): Promise<any> {
  const module = params.module || "general";

  // Gather data based on module (scoped to the caller's entity)
  let contextData = "";
  try {
    contextData = await gatherQuerySystemContext(module, ctx);
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
// TOOL REGISTRY (extension hook for other modules)
// ============================================

export type ChatToolExecutor = (name: string, params: any, ctx: AIAgentContext) => Promise<any>;

const registeredToolExecutors = new Map<string, ChatToolExecutor>();

/**
 * Let a sibling module (e.g. server/aiChatTools/index.ts) add tools to the top-bar
 * assistant without editing this file. The tool schemas are appended to the set sent
 * to the model; `executor` is invoked for any of their names. Registered tools must
 * gate their own writes with `assertRole` / `assertCanMutate` and scope reads with
 * `chatScope(ctx)`. Registering a name that already exists (built-in or registered)
 * throws, so a collision surfaces at boot instead of silently shadowing a tool.
 */
export function registerChatTools(tools: Tool[], executor: ChatToolExecutor): void {
  for (const tool of tools) {
    const name = tool?.function?.name;
    if (!name) throw new Error("registerChatTools: every tool needs a function.name");
    if (AI_TOOLS.some((t) => t.function.name === name) || registeredToolExecutors.has(name)) {
      throw new Error(`registerChatTools: a tool named "${name}" is already registered`);
    }
  }
  for (const tool of tools) {
    AI_TOOLS.push(tool);
    registeredToolExecutors.set(tool.function.name, executor);
  }
}

/** Names of every tool the assistant currently exposes (built-in + registered). */
export function listChatToolNames(): string[] {
  return AI_TOOLS.map((t) => t.function.name);
}

// ============================================
// TOOL EXECUTION DISPATCHER
// ============================================

export async function executeTool(toolName: string, params: any, ctx: AIAgentContext): Promise<any> {
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
    case "manage_invoice":
      return executeManageInvoice(params, ctx);
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
    default: {
      const registered = registeredToolExecutors.get(toolName);
      if (registered) return registered(toolName, params, ctx);
      throw new Error(`Unknown tool: ${toolName}`);
    }
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

async function buildAgentMessages(
  message: string,
  conversationHistory: Message[],
  ctx: AIAgentContext,
): Promise<Message[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current business context (scoped to the caller's entity; a global caller
  // keeps the unfiltered count query).
  const countRows = (table: typeof vendors | typeof customers | typeof orders | typeof inventory | typeof purchaseOrders) => {
    const q = db.select({ count: sql<number>`count(*)` }).from(table);
    const w = companyWhere(table, ctx);
    return w ? q.where(w) : q;
  };
  const [vendorCount, customerCount, orderCount, inventoryCount, poCount] = await Promise.all([
    countRows(vendors),
    countRows(customers),
    countRows(orders),
    countRows(inventory),
    countRows(purchaseOrders),
  ]);

  const canMutate = MUTATION_ROLES.includes(ctx.userRole);
  const canFinance = FINANCE_ROLES.includes(ctx.userRole);
  const isAdmin = ADMIN_ROLES.includes(ctx.userRole);

  const systemPrompt = `You are the AI assistant for the Superhumn ERP system. You act ONLY through the tools listed below. Never claim to have created, changed, sent or deleted anything unless a tool call returned success, and never promise an operation no tool provides.

WHAT YOU CAN DO (tool → actions):
1. Look things up (every role): query_system (any module: inventory, work orders, POs, vendors, customers, orders, invoices, payments, shipments, cap table, data room, projects/tasks, banking, copacker, employees, contracts, general overview), query_crm, analyze_data, track_items, generate_report (sales_summary, inventory_status, vendor_performance, customer_analysis, financial_overview, production_status, order_fulfillment), search_inbox / read_email, search_google_drive, run_ai_analytics, manage_calendar list_events, and the read actions of manage_vendor / manage_customer / manage_order / manage_invoice / manage_freight / manage_copacker.
2. Vendors (ops/admin/exec): manage_vendor create, update. Archive = admin only.
3. Customers (ops/admin/exec): manage_customer create, update. Archive = admin only.
4. Sales orders (ops/admin/exec): manage_order create (with line items), update (status/notes/addresses), cancel, fulfill (reserves stock, raises the outbound shipment, marks shipped). Archive (= cancel, keeps history) = admin only.
5. Invoices & payments (finance/admin/exec): manage_invoice create (from an order or explicit lines; posts the AR/Revenue journal entry), send (mark sent), record_payment (payment row + invoice status + Cash/AR journal entry).
6. Purchasing & production (ops/admin/exec): create_purchase_order (draft PO), update_inventory (add/remove/transfer/adjust), manage_copacker create_work_order (draft).
7. Freight (ops/admin/exec): manage_freight create_rfq, book_shipment (accept a quote → booking); get_quotes/track/list_carriers for anyone.
8. Communication: draft_email (anyone); send_email and manage_calendar create_event (ops/admin/exec).
9. Tasks & errands: create_task (ops/admin/exec) queues an item for the Approval Queue; plan_errand (anyone) for multi-step chores — see below.
10. Web research: the web_search tool for real-world facts (company details, addresses, market prices, news). Prefer official sources; never fabricate details you could verify.

NOT AVAILABLE HERE (say so plainly and point the user to the right page): permanently deleting any record (only archive/cancel exists), creating or editing products, BOMs or recipes, approving or sending purchase orders, receiving POs, starting/completing work orders, HR/payroll changes, cap-table edits, bank transfers or refunds, sending invoices by email in one step (use manage_invoice send, then send_email).

ACCESS RULES:
- Data scope: you only see and change records that belong to the user's company entity${ctx.companyId != null ? ` (entity #${ctx.companyId})` : " (this user has global visibility)"}. Anything you create is stamped to it.
- This user's role is "${ctx.userRole}": ${canMutate ? "they CAN run operational writes (orders, vendors, customers, inventory, POs, freight, email, calendar events)" : "they CANNOT run operational writes — offer plan_errand (which queues the work for approval) or explain which role is needed"}; ${canFinance ? "they CAN create invoices and record payments" : "they CANNOT create invoices or record payments"}; ${isAdmin ? "they CAN archive vendors, customers and orders" : "they CANNOT archive vendors, customers or orders (admin only)"}.
- If a tool returns "Not authorized", relay which role is required and stop — do not retry or work around it.

BEHAVIOUR RULES:
1. When a user asks for something a tool can do, DO IT directly. Never tell them to do it manually.
2. If required data is missing (e.g., no vendor exists), CREATE the missing entity first when you have the tool and the role, then proceed. Ask the user only for details you genuinely cannot determine (e.g., "Which vendor?" or "What unit price?"). When a user names a real company (e.g. "add BCW as a warehouse vendor"), FIRST use web_search to find its real details (address, phone, website), then create the record with those details.
3. Zero vendors/products/customers is fine — create what you can as part of fulfilling the request.
4. NEVER list steps for the user to follow when you can take them yourself.
5. Use sensible defaults: today's date, status "draft"/"pending", USD, the product's list price.
6. Be concise. Don't narrate — act, then confirm the result with the real identifiers (order number, invoice number, booking number) the tool returned.

DELEGATED ERRANDS (concierge mode):
- Tell apart a QUESTION or single trivial action ("how many orders shipped today?", "mark order 123 confirmed") from a CHORE the user wants carried out ("chase the overdue invoice from Acme", "onboard this vendor and email them the forms"). Answer questions and do single actions directly.
- For a multi-step chore with real-world side effects, call plan_errand with a title, the restated goal, ordered concrete steps, and a riskLevel. Low-risk errands run automatically only for ops/admin/exec users; everything else waits in the Approval Queue until an authorised user approves the plan.
- After calling plan_errand, briefly tell the user the plan is queued (or already running) — do NOT perform the steps yourself in that same turn.

Current System Status (this entity):
- Vendors: ${vendorCount[0]?.count || 0}
- Customers: ${customerCount[0]?.count || 0}
- Orders: ${orderCount[0]?.count || 0}
- Inventory Items: ${inventoryCount[0]?.count || 0}
- Purchase Orders: ${poCount[0]?.count || 0}

User Context:
- Name: ${ctx.userName}
- Role: ${ctx.userRole}

Guidelines:
- For sensitive operations (bulk changes, archiving, cancelling), confirm with the user before proceeding.
- When analyzing data, provide insights and recommendations.
- Format currency values with $ symbol and 2 decimal places.
- When listing items, limit to 10-20 unless more are requested.
- Be proactive in suggesting relevant next actions that exist in the tool list.

Examples:
- "What work orders are in progress?" → query_system(question, module="work_orders")
- "Show me overdue POs" → query_system(question, module="purchase_orders")
- "What's my cap table breakdown?" → query_system(question, module="cap_table")
- "Who viewed my data room this week?" → query_system(question, module="data_room")
- "Invoice order ORD-2609-0042" → manage_order get (find the id) → manage_invoice create(orderId)
- "Acme paid $1,200 on INV-2609-0007 by wire" → manage_invoice record_payment(invoiceId, {amount: 1200, method: "wire"})
- "Ship order 55" → manage_order fulfill(orderId=55)
- "Book the cheapest quote on RFQ 12" → manage_freight get_quotes(rfqId=12) → manage_freight book_shipment(quoteId)
- "Give me an overview of the business" → query_system(question, module="general")`;

  return [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message },
  ];
}

export async function processAIAgentRequest(
  message: string,
  conversationHistory: Message[],
  ctx: AIAgentContext
): Promise<AIAgentResponse> {
  const messages = await buildAgentMessages(message, conversationHistory, ctx);

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

// ============================================
// STREAMING VARIANT
// ============================================

// AgentStreamEvent is defined in shared/aiChat.ts (imported + re-exported above).

// Friendly, present-tense labels for the status chip shown while a tool runs.
const TOOL_STATUS_LABELS: Record<string, string> = {
  create_purchase_order: "Creating purchase order…",
  manage_order: "Updating order…",
  manage_freight: "Arranging freight…",
  track_items: "Updating shipment…",
  update_inventory: "Updating inventory…",
  manage_vendor: "Updating vendor…",
  manage_customer: "Updating customer…",
  manage_invoice: "Updating invoice…",
  manage_copacker: "Updating co-packer…",
  send_email: "Sending email…",
  draft_email: "Drafting email…",
  search_inbox: "Searching the inbox…",
  read_email: "Reading email…",
  search_google_drive: "Searching Google Drive…",
  generate_report: "Generating report…",
  create_task: "Creating task…",
  plan_errand: "Preparing a plan…",
  manage_calendar: "Updating the calendar…",
  run_ai_analytics: "Running analytics…",
  query_crm: "Checking the CRM…",
  query_system: "Looking that up…",
  analyze_data: "Analyzing data…",
};
function statusLabelForTool(toolName: string): string {
  return TOOL_STATUS_LABELS[toolName] ?? `Running ${toolName.replace(/_/g, " ")}…`;
}

/**
 * Streaming counterpart to `processAIAgentRequest`. Runs the same iterative
 * tool-calling loop, but drives each turn with `invokeLLMStream` so the answer
 * types out token-by-token, and yields status/action events as tools run. The
 * final `done` event carries the exact same payload as the non-streaming version
 * so callers can finalize identically.
 *
 * Pass `opts.signal` (from a Stop button) to abort generation mid-stream.
 */
export async function* processAIAgentRequestStream(
  message: string,
  conversationHistory: Message[],
  ctx: AIAgentContext,
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<AgentStreamEvent, void, void> {
  const messages = await buildAgentMessages(message, conversationHistory, ctx);

  const actions: AIAgentAction[] = [];
  let finalResponse = "";
  const data: Record<string, any> = {};
  let iterations = 0;
  const maxIterations = 8;
  // Web search is enabled unless the endpoint rejects it (then disabled + retried),
  // matching the non-streaming path so the agent keeps its live-lookup ability.
  let webSearchEnabled = true;

  while (iterations < maxIterations) {
    iterations++;
    // Honor a mid-flight Stop: don't start another LLM turn once aborted.
    if (opts.signal?.aborted) return;

    // Stream this turn. Text tokens are forwarded live; the generator's return
    // value is the aggregated result (identical shape to invokeLLM) so the
    // tool-call handling below is unchanged from the non-streaming path.
    let turnText = "";
    let result: InvokeResult | undefined;
    let streamedAny = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        for await (const chunk of invokeLLMStream({
          messages,
          tools: AI_TOOLS,
          toolChoice: "auto",
          signal: opts.signal,
          ...(webSearchEnabled ? { webSearch: true } : {}),
        })) {
          if (chunk.type === "text") {
            streamedAny = true;
            turnText += chunk.delta;
            yield { type: "token", text: chunk.delta };
          } else {
            result = chunk.result;
          }
        }
        break; // turn streamed successfully
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Retry once without web search only if the endpoint specifically rejected
        // it AND nothing has streamed yet this turn (so tokens can't double up).
        if (attempt === 0 && webSearchEnabled && !streamedAny && /web[_ ]?search/i.test(msg)) {
          webSearchEnabled = false;
          continue;
        }
        throw err;
      }
    }

    if (!result) break; // defensive: stream produced no result

    const responseMessage = result.choices[0].message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // This turn was a tool-calling step, not the answer. Drop any preamble text
      // it streamed so the user doesn't keep "let me check…" as the result.
      if (streamedAny) yield { type: "reset" };

      messages.push({
        role: "assistant",
        content: typeof responseMessage.content === "string" ? responseMessage.content : "",
        tool_calls: responseMessage.tool_calls,
      });

      for (const toolCall of responseMessage.tool_calls) {
        // If the user pressed Stop, halt before starting any further tool call.
        // A tool already in flight will finish (individual tools don't take an
        // abort signal), but no additional side effects (creating POs, sending
        // email, etc.) are started after Stop.
        if (opts.signal?.aborted) return;
        const toolName = toolCall.function.name;
        yield { type: "status", label: statusLabelForTool(toolName) };

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
          yield { type: "action", action };
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
          const toolResult = await executeTool(toolName, toolArgs, ctx);
          action.status = "completed";
          action.result = toolResult;
          data[toolName] = toolResult;
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
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
        yield { type: "action", action };
      }
    } else {
      // No more tool calls — the text already streamed IS the final answer.
      finalResponse =
        turnText || (typeof responseMessage.content === "string" ? responseMessage.content : "");
      // If the model returned text without streaming deltas (shouldn't normally
      // happen), emit it once so the client still shows an answer.
      if (!turnText && finalResponse) yield { type: "token", text: finalResponse };
      break;
    }
  }

  // If we hit max iterations without a written answer, summarize (non-streamed).
  if (iterations >= maxIterations && !finalResponse) {
    const summaryResponse = await invokeLLM({
      messages: [
        ...messages,
        { role: "user", content: "Please provide a summary of what you've done so far." },
      ],
    });
    const summaryContent = summaryResponse.choices[0]?.message?.content;
    finalResponse =
      typeof summaryContent === "string" ? summaryContent : "I've completed the requested operations.";
    yield { type: "token", text: finalResponse };
  }

  const suggestions = generateSuggestions(message, actions, data);

  yield {
    type: "done",
    response: {
      message: finalResponse,
      actions: actions.length > 0 ? actions : undefined,
      data: Object.keys(data).length > 0 ? data : undefined,
      suggestions,
    },
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
    db.select().from(vendors).where(companyWhere(vendors, ctx)),
    db.select().from(customers).where(companyWhere(customers, ctx)),
    db.select().from(orders).where(companyWhere(orders, ctx)),
    db.select().from(inventory).where(companyWhere(inventory, ctx)),
    db.select().from(purchaseOrders).where(companyWhere(purchaseOrders, ctx)),
    db.select().from(workOrders).where(companyWhere(workOrders, ctx)),
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
    .where(scopedWhere(ctx, aiAgentTasks, eq(aiAgentTasks.status, "pending_approval")))
    .orderBy(desc(aiAgentTasks.createdAt))
    .limit(20);

  return {
    pendingApprovals: pendingTasks.length,
    tasks: pendingTasks,
  };
}

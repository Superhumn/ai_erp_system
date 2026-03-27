import type Anthropic from "@anthropic-ai/sdk";

/**
 * Returns all agent-callable tool definitions in Anthropic tool_use format.
 * Each tool wraps an existing ERP workflow or DB operation.
 */
export function getTools(): Anthropic.Tool[] {
  return [
    {
      name: "run_sales_pipeline_workflow",
      description:
        "Triggers the sales pipeline workflow. Use for querying orders by status, updating order stages, generating pipeline summaries, or looking up customer order history.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["get_pipeline_summary", "get_orders_by_status", "update_order_status", "get_customer_orders"],
            description: "The sales pipeline action to perform.",
          },
          payload: {
            type: "object",
            description: "Action-specific parameters. For get_orders_by_status: { status }. For update_order_status: { orderId, newStatus }. For get_customer_orders: { customerId }.",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "run_finance_workflow",
      description:
        "Triggers finance workflows including invoice lookups, payment status checks, margin calculations, and revenue summaries. Use for any financial data or operations.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["get_open_invoices", "get_invoice_details", "get_payment_status", "get_revenue_summary", "get_overdue_invoices"],
            description: "The finance action to perform.",
          },
          payload: {
            type: "object",
            description: "Action-specific parameters. For get_invoice_details: { invoiceId }. For get_payment_status: { invoiceId }.",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "query_database",
      description:
        "Read data from any ERP table. Use for lookups before taking action. Supports filtering and limiting results. Available tables include: orders, orderItems, invoices, payments, products, customers, vendors, inventory, purchaseOrders, workOrders, shipments, warehouses, employees, and more.",
      input_schema: {
        type: "object" as const,
        properties: {
          table: {
            type: "string",
            description: "The table name to query (e.g., 'orders', 'invoices', 'products', 'vendors', 'inventory').",
          },
          filters: {
            type: "object",
            description: "Key-value pairs for WHERE clause filtering. Keys are column names, values are the expected values. Example: { \"status\": \"active\", \"companyId\": 1 }",
          },
          limit: {
            type: "number",
            description: "Maximum number of rows to return. Defaults to 50. Max 200.",
          },
        },
        required: ["table"],
      },
    },
    {
      name: "run_supply_chain_workflow",
      description:
        "Triggers an existing autonomous supply chain workflow by type. Use for demand forecasting, production planning, procurement, inventory management, freight, and other supply chain operations. The workflow runs through the existing workflow engine with full step tracking.",
      input_schema: {
        type: "object" as const,
        properties: {
          workflowType: {
            type: "string",
            enum: [
              "demand_forecasting",
              "production_planning",
              "material_requirements",
              "procurement",
              "inventory_reorder",
              "inventory_transfer",
              "inventory_optimization",
              "work_order_generation",
              "production_scheduling",
              "freight_procurement",
              "shipment_tracking",
              "order_fulfillment",
              "supplier_management",
              "quality_inspection",
              "invoice_matching",
              "payment_processing",
              "exception_handling",
            ],
            description: "The type of supply chain workflow to execute.",
          },
          inputData: {
            type: "object",
            description: "Optional input data/config to pass to the workflow processor.",
          },
        },
        required: ["workflowType"],
      },
    },
    {
      name: "send_email",
      description:
        "Send an email to a vendor, customer, or CRM contact. Can auto-generate professional email content with AI. All emails are recorded in the CRM interaction history. Use get_email_history to check past communications first.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["send_email", "get_email_history"],
            description: "send_email to compose and send, or get_email_history to view past email interactions.",
          },
          payload: {
            type: "object",
            description:
              "For send_email: { contactType: 'vendor'|'customer'|'crm_contact', contactId: number, subject?, body?, generateWithAI?: true, purpose?: 'follow up on PO #123' }. For get_email_history: { contactType, contactId }.",
            properties: {
              contactType: { type: "string", enum: ["vendor", "customer", "crm_contact"] },
              contactId: { type: "number" },
              to: { type: "string", description: "Direct email address (optional if contactType+contactId provided)" },
              subject: { type: "string" },
              body: { type: "string" },
              generateWithAI: { type: "boolean", description: "Set true to auto-generate email content from purpose" },
              purpose: { type: "string", description: "Purpose of the email for AI generation" },
            },
          },
        },
        required: ["action"],
      },
    },
    {
      name: "make_phone_call",
      description:
        "Initiate a phone call to a vendor, customer, or CRM contact via Twilio. Can also log a manual call. All calls are recorded in the CRM interaction history.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["make_call", "log_call", "get_call_status"],
            description: "make_call to initiate a Twilio call, log_call to record a manual call, get_call_status to check an active call.",
          },
          payload: {
            type: "object",
            description:
              "For make_call: { contactType, contactId, purpose?, twimlMessage? }. For log_call: { contactType, contactId, purpose? }. For get_call_status: { callSid }.",
            properties: {
              contactType: { type: "string", enum: ["vendor", "customer", "crm_contact"] },
              contactId: { type: "number" },
              phoneNumber: { type: "string", description: "Direct phone number (optional if contactType+contactId provided)" },
              purpose: { type: "string" },
              twimlMessage: { type: "string", description: "Custom TwiML message to play on the call" },
              callSid: { type: "string", description: "Twilio call SID for status checks" },
            },
          },
        },
        required: ["action"],
      },
    },
    {
      name: "manage_contacts",
      description:
        "Search, look up, and manage contacts across vendors, customers, and CRM. View unified interaction history (emails, calls, notes) for any contact. All communication channels in one place.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["search_contacts", "get_contact_details", "get_interaction_history", "add_note"],
            description:
              "search_contacts to find contacts by name/email. get_contact_details for full profile. get_interaction_history for all emails, calls, notes. add_note to log a note.",
          },
          payload: {
            type: "object",
            description:
              "For search_contacts: { searchQuery }. For get_contact_details/get_interaction_history: { contactType, contactId }. For add_note: { contactType, contactId, note }.",
            properties: {
              contactType: { type: "string", enum: ["vendor", "customer", "crm_contact"] },
              contactId: { type: "number" },
              searchQuery: { type: "string" },
              note: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
        required: ["action"],
      },
    },
  ];
}

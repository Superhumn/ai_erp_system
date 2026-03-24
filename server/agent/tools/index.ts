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
  ];
}

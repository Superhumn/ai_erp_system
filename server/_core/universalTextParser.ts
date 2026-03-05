/**
 * Universal Natural Language Parser
 * Extensible framework for parsing natural language text into structured data for any entity
 */

import { invokeLLM } from './llm';

// ============================================
// TYPES
// ============================================

export interface EntitySchema {
  entityType: string;
  fields: EntityField[];
  requiredFields: string[];
  examples: string[];
}

export interface EntityField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  description: string;
  optional?: boolean;
  arrayItemType?: 'string' | 'number' | 'object';
  objectSchema?: EntityField[];
}

export interface ParsedEntityData {
  [key: string]: any;
}

// ============================================
// ENTITY SCHEMAS
// ============================================

export const ENTITY_SCHEMAS: Record<string, EntitySchema> = {
  // Purchase Order
  purchase_order: {
    entityType: 'purchase_order',
    requiredFields: ['vendorName', 'items'],
    fields: [
      { name: 'vendorName', type: 'string', description: 'Vendor or supplier name' },
      { name: 'items', type: 'array', description: 'List of items to order', arrayItemType: 'object', objectSchema: [
        { name: 'materialName', type: 'string', description: 'Material or product name' },
        { name: 'quantity', type: 'number', description: 'Quantity to order' },
        { name: 'unit', type: 'string', description: 'Unit of measurement (kg, lbs, units, etc.)', optional: true },
        { name: 'unitPrice', type: 'number', description: 'Price per unit', optional: true },
      ]},
      { name: 'deliveryDate', type: 'date', description: 'Expected delivery date', optional: true },
      { name: 'notes', type: 'string', description: 'Additional notes or instructions', optional: true },
      { name: 'totalAmount', type: 'number', description: 'Total PO amount', optional: true },
    ],
    examples: [
      'Order 500kg mushrooms and 200kg tomatoes from Fresh Farms by next Friday',
      'Create PO for Sysco: 300lbs beef $2500, 150lbs chicken $800',
      'Purchase order to Vendor ABC for 1000 units of SKU-123 at $5 each'
    ]
  },

  // Shipment
  shipment: {
    entityType: 'shipment',
    requiredFields: ['carrier', 'trackingNumber'],
    fields: [
      { name: 'carrier', type: 'string', description: 'Shipping carrier name (FedEx, UPS, DHL, etc.)' },
      { name: 'trackingNumber', type: 'string', description: 'Tracking number or reference' },
      { name: 'status', type: 'string', description: 'Shipment status (in_transit, delivered, pending, etc.)', optional: true },
      { name: 'origin', type: 'string', description: 'Origin location or address', optional: true },
      { name: 'destination', type: 'string', description: 'Destination location or address', optional: true },
      { name: 'estimatedDelivery', type: 'date', description: 'Estimated delivery date', optional: true },
      { name: 'weight', type: 'number', description: 'Shipment weight', optional: true },
      { name: 'weightUnit', type: 'string', description: 'Weight unit (kg, lbs)', optional: true },
      { name: 'notes', type: 'string', description: 'Additional notes', optional: true },
    ],
    examples: [
      'FedEx tracking 123456789 delivered to warehouse',
      'Shipment from LA to NYC via UPS, tracking ABC123, arriving Friday',
      'DHL package 987654321 in transit, 50kg, ETA March 15'
    ]
  },

  // Payment
  payment: {
    entityType: 'payment',
    requiredFields: ['amount', 'payerName'],
    fields: [
      { name: 'amount', type: 'number', description: 'Payment amount' },
      { name: 'payerName', type: 'string', description: 'Name of payer (customer or vendor)' },
      { name: 'paymentMethod', type: 'string', description: 'Payment method (bank_transfer, credit_card, check, etc.)', optional: true },
      { name: 'referenceNumber', type: 'string', description: 'Payment reference or transaction ID', optional: true },
      { name: 'invoiceNumber', type: 'string', description: 'Related invoice number', optional: true },
      { name: 'paymentDate', type: 'date', description: 'Date of payment', optional: true },
      { name: 'currency', type: 'string', description: 'Currency code (USD, EUR, etc.)', optional: true },
      { name: 'notes', type: 'string', description: 'Additional notes', optional: true },
    ],
    examples: [
      '$5000 payment received from Acme Corp for invoice INV-001',
      'Bank transfer $2500 reference #TX123 from Customer XYZ',
      'Check payment 3500 for invoice 2024-045 dated March 10'
    ]
  },

  // Work Order
  work_order: {
    entityType: 'work_order',
    requiredFields: ['productName', 'quantity'],
    fields: [
      { name: 'productName', type: 'string', description: 'Product to manufacture' },
      { name: 'quantity', type: 'number', description: 'Quantity to produce' },
      { name: 'unit', type: 'string', description: 'Unit of measurement', optional: true },
      { name: 'dueDate', type: 'date', description: 'Production due date', optional: true },
      { name: 'priority', type: 'string', description: 'Priority level (low, medium, high, urgent)', optional: true },
      { name: 'notes', type: 'string', description: 'Production notes or instructions', optional: true },
      { name: 'batchSize', type: 'number', description: 'Batch size', optional: true },
    ],
    examples: [
      'Produce 1000 units of Widget A by end of month',
      'Work order for 500kg pasta batch, high priority, due Friday',
      'Manufacturing order: 250 cases product SKU-789 needed by March 20'
    ]
  },

  // Inventory Transfer
  inventory_transfer: {
    entityType: 'inventory_transfer',
    requiredFields: ['items', 'fromLocation', 'toLocation'],
    fields: [
      { name: 'fromLocation', type: 'string', description: 'Source warehouse or location' },
      { name: 'toLocation', type: 'string', description: 'Destination warehouse or location' },
      { name: 'items', type: 'array', description: 'Items to transfer', arrayItemType: 'object', objectSchema: [
        { name: 'materialName', type: 'string', description: 'Material or product name' },
        { name: 'quantity', type: 'number', description: 'Quantity to transfer' },
        { name: 'unit', type: 'string', description: 'Unit of measurement', optional: true },
      ]},
      { name: 'transferDate', type: 'date', description: 'Transfer date', optional: true },
      { name: 'reason', type: 'string', description: 'Reason for transfer', optional: true },
      { name: 'notes', type: 'string', description: 'Additional notes', optional: true },
    ],
    examples: [
      'Transfer 100kg flour from Main Warehouse to Production Facility',
      'Move 50 units SKU-123 and 30 units SKU-456 from LA to NYC warehouse',
      'Inventory transfer: 200kg tomatoes from storage to processing'
    ]
  },

  // Customer
  customer: {
    entityType: 'customer',
    requiredFields: ['name'],
    fields: [
      { name: 'name', type: 'string', description: 'Customer name or company name' },
      { name: 'email', type: 'string', description: 'Customer email address', optional: true },
      { name: 'phone', type: 'string', description: 'Customer phone number', optional: true },
      { name: 'address', type: 'string', description: 'Customer address', optional: true },
      { name: 'type', type: 'string', description: 'Customer type (business or individual)', optional: true },
      { name: 'taxId', type: 'string', description: 'Tax ID or VAT number', optional: true },
      { name: 'notes', type: 'string', description: 'Additional notes', optional: true },
    ],
    examples: [
      'New customer Acme Corp email contact@acme.com phone 555-1234',
      'Add customer John Doe, individual, 123 Main St',
      'Customer TechStart Inc VAT US123456 address 456 Tech Blvd'
    ]
  },

  // Vendor
  vendor: {
    entityType: 'vendor',
    requiredFields: ['name'],
    fields: [
      { name: 'name', type: 'string', description: 'Vendor name or company name' },
      { name: 'email', type: 'string', description: 'Vendor email address', optional: true },
      { name: 'phone', type: 'string', description: 'Vendor phone number', optional: true },
      { name: 'address', type: 'string', description: 'Vendor address', optional: true },
      { name: 'contactPerson', type: 'string', description: 'Primary contact person', optional: true },
      { name: 'paymentTerms', type: 'string', description: 'Default payment terms', optional: true },
      { name: 'notes', type: 'string', description: 'Additional notes', optional: true },
    ],
    examples: [
      'Vendor Fresh Farms contact sarah@freshfarms.com phone 555-9876',
      'Add supplier Global Foods Inc, payment terms net 30',
      'New vendor ABC Logistics address 789 Supply Lane'
    ]
  },

  // Product
  product: {
    entityType: 'product',
    requiredFields: ['name'],
    fields: [
      { name: 'name', type: 'string', description: 'Product name' },
      { name: 'sku', type: 'string', description: 'Product SKU or code', optional: true },
      { name: 'description', type: 'string', description: 'Product description', optional: true },
      { name: 'price', type: 'number', description: 'Product price', optional: true },
      { name: 'cost', type: 'number', description: 'Product cost', optional: true },
      { name: 'unit', type: 'string', description: 'Unit of measurement', optional: true },
      { name: 'category', type: 'string', description: 'Product category', optional: true },
      { name: 'barcode', type: 'string', description: 'Barcode', optional: true },
    ],
    examples: [
      'Product Premium Pasta SKU PASTA-001 price $12.99',
      'Add product Organic Flour 25kg bag cost $15 sell $25',
      'New product Tomato Sauce category Condiments barcode 123456789'
    ]
  },

  // Material
  material: {
    entityType: 'material',
    requiredFields: ['name'],
    fields: [
      { name: 'name', type: 'string', description: 'Raw material name' },
      { name: 'sku', type: 'string', description: 'Material SKU or code', optional: true },
      { name: 'unit', type: 'string', description: 'Unit of measurement (kg, lbs, L, etc.)', optional: true },
      { name: 'unitCost', type: 'number', description: 'Cost per unit', optional: true },
      { name: 'supplier', type: 'string', description: 'Preferred supplier name', optional: true },
      { name: 'reorderPoint', type: 'number', description: 'Reorder point quantity', optional: true },
      { name: 'leadTime', type: 'number', description: 'Lead time in days', optional: true },
    ],
    examples: [
      'Material Wheat Flour SKU FLOUR-001 unit kg cost $2.50',
      'Add material Olive Oil supplier Italian Foods reorder 100L',
      'Raw material Tomato Paste unit kg lead time 7 days'
    ]
  },
};

// ============================================
// UNIVERSAL PARSER
// ============================================

/**
 * Parse natural language text into structured entity data
 */
export async function parseEntityText(
  text: string,
  entityType: keyof typeof ENTITY_SCHEMAS
): Promise<ParsedEntityData> {
  const schema = ENTITY_SCHEMAS[entityType];
  if (!schema) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  const systemPrompt = `You are a data extraction assistant for ${schema.entityType} entities. Extract structured information from natural language text.

Extract the following fields:
${schema.fields.map(f => `- ${f.name} (${f.type}${f.optional ? ', optional' : ', required'}): ${f.description}`).join('\n')}

${schema.requiredFields.length > 0 ? `REQUIRED fields: ${schema.requiredFields.join(', ')}` : ''}

Return ONLY a valid JSON object. Use null for missing optional fields.

${schema.examples.length > 0 ? `Example inputs:\n${schema.examples.map((ex, i) => `${i + 1}. "${ex}"`).join('\n')}` : ''}`;

  const userPrompt = `Extract ${schema.entityType} data from this text: "${text}"`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    });

    // Extract the text content from the LLM response
    const content = response?.choices?.[0]?.message?.content ?? '';
    if (!content) {
      throw new Error('LLM response did not contain any content');
    }

    // Parse the JSON response
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    for (const reqField of schema.requiredFields) {
      const value = parsed[reqField];
      // Check if value is missing (null or undefined), but allow 0 and false as valid
      if (value == null) {
        throw new Error(`Missing required field: ${reqField}`);
      }
    }

    return parsed;
  } catch (error) {
    console.error(`[UniversalTextParser] Failed to parse ${entityType} text:`, error);
    throw new Error(`Failed to parse ${entityType} text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find or create entity by name (works for customers, vendors, etc.)
 */
export async function findOrCreateEntity(
  entityName: string,
  entityType: 'customer' | 'vendor' | 'product' | 'material',
  db: any
): Promise<number> {
  const getterMap: Record<typeof entityType, string> = {
    customer: 'getCustomerByName',
    vendor: 'getVendorByName',
    product: 'getProductByName',
    material: 'getRawMaterialByName',
  };

  const creatorMap: Record<typeof entityType, string> = {
    customer: 'createCustomer',
    vendor: 'createVendor',
    product: 'createProduct',
    material: 'createRawMaterial',
  };

  // Try to find existing entity
  const getter = getterMap[entityType];
  if (db[getter]) {
    const existing = await db[getter](entityName);
    if (existing) {
      return existing.id;
    }
  }

  // Create new entity
  const creator = creatorMap[entityType];
  if (!db[creator]) {
    throw new Error(`Creator function ${creator} not found in db`);
  }

  const defaultData: Record<typeof entityType, any> = {
    customer: { name: entityName, type: 'business', status: 'active' },
    vendor: { name: entityName, status: 'active' },
    product: { name: entityName, status: 'active' },
    material: { name: entityName, unit: 'units' },
  };

  const entity = await db[creator](defaultData[entityType]);
  return entity.id;
}

/**
 * Get entity type from task type
 */
export function getEntityTypeFromTaskType(taskType: string): keyof typeof ENTITY_SCHEMAS | null {
  const mapping: Record<string, keyof typeof ENTITY_SCHEMAS> = {
    'generate_po': 'purchase_order',
    'create_shipment': 'shipment',
    'reconcile_payment': 'payment',
    'create_work_order': 'work_order',
    'update_inventory': 'inventory_transfer',
    'create_customer': 'customer',
    'create_vendor': 'vendor',
    'create_product': 'product',
    'create_material': 'material',
  };

  return mapping[taskType] || null;
}

import { invokeLLM } from "./llm";

// Email category types
export type EmailCategory = 
  | "receipt" 
  | "purchase_order" 
  | "invoice" 
  | "shipping_confirmation" 
  | "freight_quote" 
  | "delivery_notification"
  | "order_confirmation"
  | "payment_confirmation"
  | "general";

export interface EmailCategorization {
  category: EmailCategory;
  confidence: number;
  subcategory?: string;
  keywords: string[];
  suggestedAction?: string;
  priority: "high" | "medium" | "low";
}

// Types for parsed document data
export interface ParsedLineItem {
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  sku?: string;
}

export interface ParsedDocumentData {
  documentType: "receipt" | "invoice" | "purchase_order" | "bill_of_lading" | "packing_list" | "customs_document" | "freight_quote" | "shipping_label" | "other";
  confidence: number;
  
  // Vendor info
  vendorName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorAddress?: string;
  
  // Document identifiers
  documentNumber?: string;
  documentDate?: string;
  dueDate?: string;
  
  // Financial data
  subtotal?: number;
  taxAmount?: number;
  shippingAmount?: number;
  totalAmount?: number;
  currency?: string;
  paymentMethod?: string;
  
  // Freight-specific
  trackingNumber?: string;
  carrierName?: string;
  carrierType?: "ocean" | "air" | "ground" | "rail" | "multimodal";
  shipmentDate?: string;
  deliveryDate?: string;
  origin?: string;
  destination?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  containerNumber?: string;
  vesselName?: string;
  voyageNumber?: string;
  shippingMode?: string;
  incoterms?: string;
  weight?: string;
  weightKg?: number;
  volume?: string;
  dimensions?: string;
  fuelSurcharge?: number;
  originCharges?: number;
  destinationCharges?: number;
  customsFees?: number;
  insuranceCost?: number;
  accessorialCharges?: number;
  hsCode?: string;
  
  // Line items
  lineItems?: ParsedLineItem[];
  
  // Raw extraction
  summary?: string;
  rawText?: string;
}

export interface EmailParseResult {
  success: boolean;
  documents: ParsedDocumentData[];
  categorization?: EmailCategorization;
  error?: string;
}

/**
 * Categorize email based on subject, body, and sender
 */
export async function categorizeEmail(
  subject: string,
  bodyText: string,
  fromEmail: string,
  fromName?: string
): Promise<EmailCategorization> {
  try {
    const prompt = `You are an expert email classifier for a business ERP system. Analyze the following email and determine its category.

EMAIL DETAILS:
From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}
Subject: ${subject}

BODY (first 3000 chars):
${bodyText?.substring(0, 3000) || "(empty)"}

CATEGORIES:
- receipt: Payment receipts, transaction confirmations, proof of purchase
- purchase_order: PO documents, order requests from buyers, procurement orders
- invoice: Bills requesting payment, invoices from vendors
- shipping_confirmation: Shipment notifications, tracking info, dispatch notices
- freight_quote: Freight rate quotes, shipping cost estimates, carrier bids
- delivery_notification: Delivery confirmations, proof of delivery, signed receipts
- order_confirmation: Order acknowledgments, sales order confirmations
- payment_confirmation: Payment received notices, wire transfer confirmations
- general: Other business emails that don't fit above categories

INSTRUCTIONS:
1. Analyze subject line keywords (e.g., "Invoice", "Receipt", "Tracking", "Quote")
2. Scan body for document indicators (amounts, tracking numbers, PO numbers)
3. Consider sender domain (e.g., noreply@ups.com suggests shipping)
4. Assign confidence (0-100) based on clarity of categorization
5. Extract 3-5 keywords that influenced your decision
6. Suggest an action based on category
7. Assign priority: high (needs immediate action), medium (review within 24h), low (informational)

Return JSON with this structure:
{
  "category": "receipt|purchase_order|invoice|shipping_confirmation|freight_quote|delivery_notification|order_confirmation|payment_confirmation|general",
  "confidence": 85,
  "subcategory": "optional specific type",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "suggestedAction": "What to do with this email",
  "priority": "high|medium|low"
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an email classification AI for business operations. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_categorization",
          strict: true,
          schema: {
            type: "object",
            properties: {
              category: { type: "string" },
              confidence: { type: "number" },
              subcategory: { type: "string" },
              keywords: { 
                type: "array",
                items: { type: "string" }
              },
              suggestedAction: { type: "string" },
              priority: { type: "string" }
            },
            required: ["category", "confidence", "keywords", "priority"],
            additionalProperties: false
          }
        }
      }
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return getDefaultCategorization();
    }

    const content = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
    const parsed = JSON.parse(content);
    
    return {
      category: validateCategory(parsed.category),
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
      subcategory: parsed.subcategory,
      keywords: parsed.keywords || [],
      suggestedAction: parsed.suggestedAction,
      priority: validatePriority(parsed.priority)
    };
  } catch (error) {
    console.error("[EmailParser] Error categorizing email:", error);
    return getDefaultCategorization();
  }
}

function validateCategory(category: string): EmailCategory {
  const validCategories: EmailCategory[] = [
    "receipt", "purchase_order", "invoice", "shipping_confirmation",
    "freight_quote", "delivery_notification", "order_confirmation",
    "payment_confirmation", "general"
  ];
  return validCategories.includes(category as EmailCategory) 
    ? (category as EmailCategory) 
    : "general";
}

function validatePriority(priority: string): "high" | "medium" | "low" {
  if (priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }
  return "medium";
}

function getDefaultCategorization(): EmailCategorization {
  return {
    category: "general",
    confidence: 50,
    keywords: [],
    priority: "medium"
  };
}

/**
 * Quick categorization using pattern matching (no AI call)
 * Use this for fast initial sorting before full AI analysis
 */
export function quickCategorize(subject: string, fromEmail: string): EmailCategorization {
  const subjectLower = subject.toLowerCase();
  const emailLower = fromEmail.toLowerCase();
  
  // Pattern-based categorization
  const patterns: Array<{
    category: EmailCategory;
    subjectPatterns: RegExp[];
    emailPatterns: RegExp[];
    priority: "high" | "medium" | "low";
    action: string;
  }> = [
    {
      category: "delivery_notification",
      subjectPatterns: [/deliver(ed|y)/i, /arrived/i, /signed for/i, /proof of delivery/i],
      emailPatterns: [/ups\.com/i, /fedex\.com/i, /dhl\.com/i],
      priority: "high",
      action: "Confirm receipt and update inventory"
    },
    {
      category: "shipping_confirmation",
      subjectPatterns: [/ship(ped|ment|ping)/i, /tracking/i, /dispatch/i, /in transit/i, /on its way/i],
      emailPatterns: [/ups\.com/i, /fedex\.com/i, /dhl\.com/i, /usps\.com/i, /maersk/i],
      priority: "medium",
      action: "Update shipment tracking"
    },
    {
      category: "invoice",
      subjectPatterns: [/invoice/i, /bill\s/i, /payment due/i, /amount due/i],
      emailPatterns: [/billing/i, /accounts/i, /payable/i],
      priority: "high",
      action: "Review and schedule payment"
    },
    {
      category: "receipt",
      subjectPatterns: [/receipt/i, /payment received/i, /thank you for your (payment|purchase)/i, /confirmation/i],
      emailPatterns: [/receipt/i, /noreply/i],
      priority: "low",
      action: "File for records"
    },
    {
      category: "purchase_order",
      subjectPatterns: [/purchase order/i, /\bpo\b/i, /order #/i, /order confirmation/i],
      emailPatterns: [/procurement/i, /purchasing/i],
      priority: "high",
      action: "Process purchase order"
    },
    {
      category: "freight_quote",
      subjectPatterns: [/quote/i, /rate/i, /freight/i, /shipping cost/i, /estimate/i, /rfq/i],
      emailPatterns: [/freight/i, /logistics/i, /carrier/i],
      priority: "medium",
      action: "Compare quotes and select carrier"
    },
    {
      category: "order_confirmation",
      subjectPatterns: [/order confirm/i, /order placed/i, /order received/i, /thank you for your order/i],
      emailPatterns: [],
      priority: "low",
      action: "Verify order details"
    },
    {
      category: "payment_confirmation",
      subjectPatterns: [/payment confirm/i, /payment processed/i, /wire transfer/i, /funds received/i],
      emailPatterns: [/bank/i, /paypal/i, /stripe/i],
      priority: "medium",
      action: "Reconcile payment"
    }
  ];
  
  let matchedKeywords: string[] = [];
  
  for (const pattern of patterns) {
    const subjectMatch = pattern.subjectPatterns.some(p => {
      const match = p.test(subjectLower);
      if (match) {
        const matchResult = subjectLower.match(p);
        if (matchResult) matchedKeywords.push(matchResult[0]);
      }
      return match;
    });
    
    const emailMatch = pattern.emailPatterns.some(p => p.test(emailLower));
    
    if (subjectMatch || emailMatch) {
      return {
        category: pattern.category,
        confidence: subjectMatch && emailMatch ? 85 : subjectMatch ? 75 : 60,
        keywords: matchedKeywords.slice(0, 5),
        suggestedAction: pattern.action,
        priority: pattern.priority
      };
    }
  }
  
  return {
    category: "general",
    confidence: 50,
    keywords: [],
    priority: "low"
  };
}

/**
 * Parse email content using AI to extract structured document data
 */
export async function parseEmailContent(
  subject: string,
  bodyText: string,
  fromEmail: string,
  fromName?: string
): Promise<EmailParseResult> {
  try {
    // First, categorize the email
    const categorization = await categorizeEmail(subject, bodyText, fromEmail, fromName);
    
    const prompt = `You are an expert document parser for a business ERP system. Analyze the following email and extract any business documents (receipts, invoices, purchase orders, freight documents, etc.).

EMAIL DETAILS:
From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}
Subject: ${subject}

BODY:
${bodyText?.substring(0, 8000) || "(empty)"}

INSTRUCTIONS:
1. Identify ALL documents present in this email (there may be multiple)
2. For each document, extract as much structured data as possible
3. Determine the document type based on content
4. Extract vendor information, amounts, dates, line items, and tracking numbers
5. For freight documents, extract carrier name and type (ocean/air/ground/rail/multimodal), tracking number, container number, vessel/voyage, origin/destination, ports of loading/discharge, shipping mode, incoterms, weight (with kg), volume, HS codes, and full charges breakdown (freight, fuel surcharge, origin/destination charges, customs fees, insurance, accessorial)
6. Assign a confidence score (0-100) based on how complete the extraction is

Return a JSON object with this exact structure:
{
  "documents": [
    {
      "documentType": "receipt|invoice|purchase_order|bill_of_lading|packing_list|customs_document|freight_quote|shipping_label|other",
      "confidence": 85,
      "vendorName": "Company Name",
      "vendorEmail": "email@vendor.com",
      "documentNumber": "INV-12345",
      "documentDate": "2025-01-10",
      "dueDate": "2025-02-10",
      "subtotal": 100.00,
      "taxAmount": 8.25,
      "shippingAmount": 15.00,
      "totalAmount": 123.25,
      "currency": "USD",
      "trackingNumber": "1Z999AA10123456784",
      "carrierName": "UPS",
      "lineItems": [
        {
          "description": "Product Name",
          "quantity": 2,
          "unit": "each",
          "unitPrice": 50.00,
          "totalPrice": 100.00,
          "sku": "SKU-123"
        }
      ],
      "summary": "Brief description of what this document is"
    }
  ]
}

If no business documents are found, return: {"documents": []}
Only include fields that have actual values - omit null/empty fields.`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a document parsing AI that extracts structured data from business emails. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_parse_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              documents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    documentType: { type: "string" },
                    confidence: { type: "number" },
                    vendorName: { type: "string" },
                    vendorEmail: { type: "string" },
                    vendorPhone: { type: "string" },
                    vendorAddress: { type: "string" },
                    documentNumber: { type: "string" },
                    documentDate: { type: "string" },
                    dueDate: { type: "string" },
                    subtotal: { type: "number" },
                    taxAmount: { type: "number" },
                    shippingAmount: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    paymentMethod: { type: "string" },
                    trackingNumber: { type: "string" },
                    carrierName: { type: "string" },
                    carrierType: { type: "string", enum: ["ocean", "air", "ground", "rail", "multimodal"] },
                    shipmentDate: { type: "string" },
                    deliveryDate: { type: "string" },
                    origin: { type: "string" },
                    destination: { type: "string" },
                    portOfLoading: { type: "string" },
                    portOfDischarge: { type: "string" },
                    containerNumber: { type: "string" },
                    vesselName: { type: "string" },
                    voyageNumber: { type: "string" },
                    shippingMode: { type: "string" },
                    incoterms: { type: "string" },
                    weight: { type: "string" },
                    weightKg: { type: "number" },
                    volume: { type: "string" },
                    dimensions: { type: "string" },
                    fuelSurcharge: { type: "number" },
                    originCharges: { type: "number" },
                    destinationCharges: { type: "number" },
                    customsFees: { type: "number" },
                    insuranceCost: { type: "number" },
                    accessorialCharges: { type: "number" },
                    hsCode: { type: "string" },
                    lineItems: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          description: { type: "string" },
                          quantity: { type: "number" },
                          unit: { type: "string" },
                          unitPrice: { type: "number" },
                          totalPrice: { type: "number" },
                          sku: { type: "string" }
                        },
                        required: ["description"],
                        additionalProperties: false
                      }
                    },
                    summary: { type: "string" }
                  },
                  required: ["documentType", "confidence"],
                  additionalProperties: false
                }
              }
            },
            required: ["documents"],
            additionalProperties: false
          }
        }
      }
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return { success: false, documents: [], categorization, error: "No response from AI" };
    }

    const content = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
    const parsed = JSON.parse(content);
    return {
      success: true,
      documents: parsed.documents || [],
      categorization
    };
  } catch (error) {
    console.error("[EmailParser] Error parsing email:", error);
    return {
      success: false,
      documents: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Parse attachment content (extracted text from PDF/image)
 */
export async function parseAttachmentContent(
  filename: string,
  extractedText: string,
  mimeType?: string
): Promise<EmailParseResult> {
  try {
    const prompt = `You are an expert document parser for a business ERP system. Analyze the following document content extracted from an attachment.

FILENAME: ${filename}
TYPE: ${mimeType || "unknown"}

EXTRACTED TEXT:
${extractedText?.substring(0, 10000) || "(empty)"}

INSTRUCTIONS:
1. Identify the document type (receipt, invoice, PO, freight document, etc.)
2. Extract all structured data including vendor info, amounts, dates, line items
3. For receipts/invoices: focus on vendor, amounts, tax, items purchased
4. For freight docs: focus on tracking, carrier, origin/destination, weight
5. Assign a confidence score (0-100) based on extraction completeness

Return a JSON object with this exact structure:
{
  "documents": [
    {
      "documentType": "receipt|invoice|purchase_order|bill_of_lading|packing_list|customs_document|freight_quote|shipping_label|other",
      "confidence": 85,
      "vendorName": "Company Name",
      "vendorEmail": "email@vendor.com",
      "documentNumber": "INV-12345",
      "documentDate": "2025-01-10",
      "totalAmount": 123.25,
      "lineItems": [...],
      "summary": "Brief description"
    }
  ]
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a document parsing AI. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attachment_parse_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              documents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    documentType: { type: "string" },
                    confidence: { type: "number" },
                    vendorName: { type: "string" },
                    vendorEmail: { type: "string" },
                    documentNumber: { type: "string" },
                    documentDate: { type: "string" },
                    dueDate: { type: "string" },
                    subtotal: { type: "number" },
                    taxAmount: { type: "number" },
                    shippingAmount: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    trackingNumber: { type: "string" },
                    carrierName: { type: "string" },
                    carrierType: { type: "string", enum: ["ocean", "air", "ground", "rail", "multimodal"] },
                    shipmentDate: { type: "string" },
                    deliveryDate: { type: "string" },
                    origin: { type: "string" },
                    destination: { type: "string" },
                    portOfLoading: { type: "string" },
                    portOfDischarge: { type: "string" },
                    containerNumber: { type: "string" },
                    vesselName: { type: "string" },
                    voyageNumber: { type: "string" },
                    shippingMode: { type: "string" },
                    incoterms: { type: "string" },
                    weight: { type: "string" },
                    weightKg: { type: "number" },
                    volume: { type: "string" },
                    dimensions: { type: "string" },
                    fuelSurcharge: { type: "number" },
                    originCharges: { type: "number" },
                    destinationCharges: { type: "number" },
                    customsFees: { type: "number" },
                    insuranceCost: { type: "number" },
                    accessorialCharges: { type: "number" },
                    hsCode: { type: "string" },
                    lineItems: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          description: { type: "string" },
                          quantity: { type: "number" },
                          unit: { type: "string" },
                          unitPrice: { type: "number" },
                          totalPrice: { type: "number" },
                          sku: { type: "string" }
                        },
                        required: ["description"],
                        additionalProperties: false
                      }
                    },
                    summary: { type: "string" }
                  },
                  required: ["documentType", "confidence"],
                  additionalProperties: false
                }
              }
            },
            required: ["documents"],
            additionalProperties: false
          }
        }
      }
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return { success: false, documents: [], error: "No response from AI" };
    }

    const content = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
    const parsed = JSON.parse(content);
    return {
      success: true,
      documents: parsed.documents || []
    };
  } catch (error) {
    console.error("[EmailParser] Error parsing attachment:", error);
    return {
      success: false,
      documents: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Match vendor name/email to existing vendors in the system
 */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract email domain for vendor matching
 */
export function extractEmailDomain(email: string): string {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : "";
}

/**
 * Get category display info for UI
 */
export function getCategoryDisplayInfo(category: EmailCategory): {
  label: string;
  color: string;
  icon: string;
} {
  const categoryInfo: Record<EmailCategory, { label: string; color: string; icon: string }> = {
    receipt: { label: "Receipt", color: "green", icon: "receipt" },
    purchase_order: { label: "Purchase Order", color: "blue", icon: "clipboard-list" },
    invoice: { label: "Invoice", color: "orange", icon: "file-invoice" },
    shipping_confirmation: { label: "Shipping", color: "purple", icon: "truck" },
    freight_quote: { label: "Freight Quote", color: "cyan", icon: "ship" },
    delivery_notification: { label: "Delivery", color: "emerald", icon: "package-check" },
    order_confirmation: { label: "Order Confirmation", color: "indigo", icon: "check-circle" },
    payment_confirmation: { label: "Payment", color: "teal", icon: "credit-card" },
    general: { label: "General", color: "gray", icon: "mail" }
  };
  
  return categoryInfo[category] || categoryInfo.general;
}

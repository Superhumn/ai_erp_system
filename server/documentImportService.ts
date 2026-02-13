import { invokeLLM, type TextContent } from "./_core/llm";
import * as db from "./db";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { fromBuffer } from "pdf2pic";
import { randomBytes } from "crypto";

// PDF.js will be imported dynamically in the function to avoid worker issues

// Configuration constants
const MIN_TEXT_LENGTH_FOR_SCANNED_DETECTION = 100; // Minimum text length to consider PDF as text-based

// Types for document import
export interface ImportedLineItem {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  sku?: string;
  rawMaterialId?: number;
}

export interface ImportedPurchaseOrder {
  poNumber: string;
  vendorName: string;
  vendorEmail?: string;
  orderDate: string;
  deliveryDate?: string;
  status: "draft" | "sent" | "confirmed" | "shipped" | "received" | "completed";
  lineItems: ImportedLineItem[];
  subtotal: number;
  taxAmount?: number;
  shippingAmount?: number;
  totalAmount: number;
  currency?: string;
  notes?: string;
  confidence: number;
}

export interface ImportedFreightInvoice {
  invoiceNumber: string;
  carrierName: string;
  carrierEmail?: string;
  invoiceDate: string;
  shipmentDate?: string;
  deliveryDate?: string;
  origin?: string;
  destination?: string;
  trackingNumber?: string;
  weight?: string;
  dimensions?: string;
  freightCharges: number;
  fuelSurcharge?: number;
  accessorialCharges?: number;
  totalAmount: number;
  currency?: string;
  relatedPoNumber?: string;
  notes?: string;
  confidence: number;
}

export interface ImportedVendorInvoice {
  invoiceNumber: string;
  vendorName: string;
  vendorEmail?: string;
  invoiceDate: string;
  dueDate?: string;
  lineItems: ImportedLineItem[];
  subtotal: number;
  taxAmount?: number;
  shippingAmount?: number;
  totalAmount: number;
  currency?: string;
  relatedPoNumber?: string;
  paymentTerms?: string;
  notes?: string;
  confidence: number;
}

export interface ImportedCustomsDocument {
  documentNumber: string;
  documentType: "bill_of_lading" | "customs_entry" | "commercial_invoice" | "packing_list" | "certificate_of_origin" | "import_permit" | "other";
  entryDate: string;
  shipperName: string;
  shipperCountry?: string;
  consigneeName: string;
  consigneeCountry?: string;
  countryOfOrigin: string;
  portOfEntry?: string;
  portOfExit?: string;
  vesselName?: string;
  voyageNumber?: string;
  containerNumber?: string;
  lineItems: {
    description: string;
    hsCode?: string;
    quantity: number;
    unit?: string;
    declaredValue: number;
    dutyRate?: number;
    dutyAmount?: number;
    countryOfOrigin?: string;
  }[];
  totalDeclaredValue: number;
  totalDuties?: number;
  totalTaxes?: number;
  totalCharges: number;
  currency?: string;
  brokerName?: string;
  brokerReference?: string;
  relatedPoNumber?: string;
  trackingNumber?: string;
  notes?: string;
  confidence: number;
}

export interface ImportedSalesOrder {
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  orderDate: string;
  shippingAddress?: string;
  billingAddress?: string;
  lineItems: ImportedLineItem[];
  subtotal: number;
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  currency?: string;
  notes?: string;
  confidence: number;
}

export interface ImportedInvoice {
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  issueDate: string;
  dueDate?: string;
  type: "invoice" | "credit_note" | "quote";
  lineItems: ImportedLineItem[];
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  currency?: string;
  paymentTerms?: string;
  purchaseOrderNumber?: string;
  notes?: string;
  terms?: string;
  confidence: number;
}

export interface ImportedBOMComponent {
  name: string;
  sku?: string;
  componentType: "raw_material" | "product" | "packaging" | "labor";
  quantity: number;
  unit?: string;
  unitCost?: number;
  wastagePercent?: number;
  notes?: string;
}

export interface ImportedBillOfMaterials {
  productName: string;
  productSku?: string;
  version?: string;
  batchSize?: number;
  batchUnit?: string;
  components: ImportedBOMComponent[];
  laborCost?: number;
  overheadCost?: number;
  notes?: string;
  confidence: number;
}

export interface ImportedWorkOrder {
  productName: string;
  productSku?: string;
  quantity: number;
  unit?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  notes?: string;
  confidence: number;
}

export interface ImportedInventoryAdjustment {
  adjustmentType: "count" | "adjustment" | "transfer";
  warehouseName?: string;
  items: {
    productName: string;
    productSku?: string;
    currentQuantity?: number;
    newQuantity?: number;
    adjustmentQuantity?: number;
    unit?: string;
    reason?: string;
  }[];
  performedDate?: string;
  notes?: string;
  confidence: number;
}

export interface ImportedCustomer {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  type: "individual" | "business";
  creditLimit?: number;
  paymentTerms?: number;
  notes?: string;
  confidence: number;
}

export interface ImportedProduct {
  name: string;
  sku: string;
  description?: string;
  category?: string;
  type: "physical" | "digital" | "service";
  unitPrice: number;
  costPrice?: number;
  currency?: string;
  taxable?: boolean;
  taxRate?: number;
  notes?: string;
  confidence: number;
}

export interface ImportedContract {
  contractNumber?: string;
  title: string;
  type: "customer" | "vendor" | "employment" | "nda" | "partnership" | "lease" | "service" | "other";
  partyName: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  autoRenewal?: boolean;
  value?: number;
  currency?: string;
  description?: string;
  terms?: string;
  keyDates?: {
    dateType: string;
    date: string;
    description?: string;
  }[];
  notes?: string;
  confidence: number;
}

export interface ImportedJournalEntry {
  description: string;
  date: string;
  lines: {
    accountName: string;
    accountNumber?: string;
    description?: string;
    debit: number;
    credit: number;
  }[];
  totalAmount: number;
  currency?: string;
  referenceNumber?: string;
  notes?: string;
  confidence: number;
}

export type DocumentType =
  | "purchase_order"
  | "freight_invoice"
  | "vendor_invoice"
  | "customs_document"
  | "sales_order"
  | "invoice"
  | "bill_of_materials"
  | "work_order"
  | "inventory_adjustment"
  | "customer"
  | "product"
  | "contract"
  | "journal_entry"
  | "unknown";

export interface DocumentParseResult {
  success: boolean;
  documentType: DocumentType;
  purchaseOrder?: ImportedPurchaseOrder;
  freightInvoice?: ImportedFreightInvoice;
  vendorInvoice?: ImportedVendorInvoice;
  customsDocument?: ImportedCustomsDocument;
  salesOrder?: ImportedSalesOrder;
  invoice?: ImportedInvoice;
  billOfMaterials?: ImportedBillOfMaterials;
  workOrder?: ImportedWorkOrder;
  inventoryAdjustment?: ImportedInventoryAdjustment;
  customer?: ImportedCustomer;
  product?: ImportedProduct;
  contract?: ImportedContract;
  journalEntry?: ImportedJournalEntry;
  rawText?: string;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  documentType: string;
  createdRecords: {
    type: string;
    id: number;
    name: string;
  }[];
  updatedRecords: {
    type: string;
    id: number;
    name: string;
    changes: string;
  }[];
  warnings: string[];
  error?: string;
}

/**
 * Parse uploaded document content (text extracted from PDF/Excel/CSV)
 */
export async function parseUploadedDocument(
  fileUrl: string,
  filename: string,
  documentHint?: DocumentType,
  mimeType?: string
): Promise<DocumentParseResult> {
  console.log("[DocumentImport] Starting parse for:", filename, "URL:", fileUrl, "mimeType:", mimeType);
  try {
    const prompt = `You are an expert document parser for a business ERP system. Analyze the attached document and extract structured data.

DOCUMENT FILENAME: ${filename}
DOCUMENT HINT: ${documentHint || "auto-detect"}

INSTRUCTIONS:
1. First, determine the document type from the following supported types:
   - purchase_order: A document ordering goods/services FROM a vendor (has PO number)
   - vendor_invoice: A bill/invoice FROM a vendor for goods/services (has invoice number, line items with prices, amount due)
   - freight_invoice: A shipping/logistics bill specifically for transportation/freight charges
   - customs_document: Import/export documents (Bill of Lading, Customs Entry, Packing List, Certificate of Origin, Import Permit)
   - sales_order: A customer order for products/services (customer placing an order with the company)
   - invoice: An outbound invoice/quote/credit note TO a customer (not from a vendor)
   - bill_of_materials: A recipe, formula, or BOM listing components/materials needed to manufacture a product
   - work_order: A manufacturing or production work order specifying what to produce
   - inventory_adjustment: A stock count sheet, inventory adjustment, or transfer document
   - customer: A document containing customer/client information (registration, application, contact sheet)
   - product: A product catalog, spec sheet, or price list
   - contract: A legal contract, agreement, NDA, lease, or partnership document
   - journal_entry: An accounting journal entry, general ledger entry, or financial transaction record
2. Extract all relevant structured data based on the detected type
3. Assign a confidence score (0-100) based on extraction completeness

Return a JSON object with "documentType" set to one of the types above, "confidence" as a number, and the corresponding data object.
Only include the relevant data object based on document type. Set all others to null.

RESPONSE FORMAT EXAMPLES BY TYPE:

For "purchase_order": include "purchaseOrder" with poNumber, vendorName, vendorEmail, orderDate, deliveryDate, status, lineItems [{description, quantity, unit, unitPrice, totalPrice, sku}], subtotal, taxAmount, shippingAmount, totalAmount, currency, notes

For "vendor_invoice": include "vendorInvoice" with invoiceNumber, vendorName, vendorEmail, invoiceDate, dueDate, lineItems [{description, quantity, unit, unitPrice, totalPrice, sku}], subtotal, taxAmount, shippingAmount, totalAmount, currency, relatedPoNumber, paymentTerms, notes

For "freight_invoice": include "freightInvoice" with invoiceNumber, carrierName, carrierEmail, invoiceDate, shipmentDate, deliveryDate, origin, destination, trackingNumber, weight, dimensions, freightCharges, fuelSurcharge, accessorialCharges, totalAmount, currency, relatedPoNumber, notes

For "customs_document": include "customsDocument" with documentNumber, documentType (bill_of_lading|customs_entry|commercial_invoice|packing_list|certificate_of_origin|import_permit|other), entryDate, shipperName, shipperCountry, consigneeName, consigneeCountry, countryOfOrigin, portOfEntry, portOfExit, vesselName, voyageNumber, containerNumber, lineItems [{description, hsCode, quantity, unit, declaredValue, dutyRate, dutyAmount, countryOfOrigin}], totalDeclaredValue, totalDuties, totalTaxes, totalCharges, currency, brokerName, brokerReference, relatedPoNumber, trackingNumber, notes

For "sales_order": include "salesOrder" with orderNumber, customerName, customerEmail, orderDate, shippingAddress, billingAddress, lineItems [{description, quantity, unit, unitPrice, totalPrice, sku}], subtotal, taxAmount, shippingAmount, discountAmount, totalAmount, currency, notes

For "invoice": include "invoice" with invoiceNumber, customerName, customerEmail, issueDate, dueDate, type (invoice|credit_note|quote), lineItems [{description, quantity, unit, unitPrice, totalPrice, sku}], subtotal, taxAmount, discountAmount, totalAmount, currency, paymentTerms, purchaseOrderNumber, notes, terms

For "bill_of_materials": include "billOfMaterials" with productName, productSku, version, batchSize, batchUnit, components [{name, sku, componentType (raw_material|product|packaging|labor), quantity, unit, unitCost, wastagePercent, notes}], laborCost, overheadCost, notes

For "work_order": include "workOrder" with productName, productSku, quantity, unit, priority (low|normal|high|urgent), scheduledStartDate, scheduledEndDate, notes

For "inventory_adjustment": include "inventoryAdjustment" with adjustmentType (count|adjustment|transfer), warehouseName, items [{productName, productSku, currentQuantity, newQuantity, adjustmentQuantity, unit, reason}], performedDate, notes

For "customer": include "customer" with name, email, phone, address, city, state, country, postalCode, type (individual|business), creditLimit, paymentTerms, notes

For "product": include "product" with name, sku, description, category, type (physical|digital|service), unitPrice, costPrice, currency, taxable, taxRate, notes

For "contract": include "contract" with contractNumber, title, type (customer|vendor|employment|nda|partnership|lease|service|other), partyName, startDate, endDate, renewalDate, autoRenewal, value, currency, description, terms, keyDates [{dateType, date, description}], notes

For "journal_entry": include "journalEntry" with description, date, lines [{accountName, accountNumber, description, debit, credit}], totalAmount, currency, referenceNumber, notes

All dates should be in YYYY-MM-DD format.
Only include the relevant object based on document type.
If document type is unknown, return documentType as "unknown" and set all data objects to null.`;

    // Determine file type
    const isImage = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i);
    const isPdf = filename.toLowerCase().endsWith('.pdf');
    const isCsv = filename.toLowerCase().endsWith('.csv');
    
    // Build the message content
    let messageContent: any[];
    
    if (isImage) {
      // For images, download and convert to base64 data URL
      try {
        console.log("[DocumentImport] Downloading image from:", fileUrl);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const ext = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i)?.[1] || 'png';
        const mimeTypeMap: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp'
        };
        const imageMimeType = mimeTypeMap[ext] || 'image/png';
        const dataUrl = `data:${imageMimeType};base64,${base64}`;
        console.log("[DocumentImport] Converted image to base64 data URL, length:", dataUrl.length);
        messageContent = [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
        ];
      } catch (fetchError) {
        console.error("[DocumentImport] Failed to fetch/convert image:", fetchError);
        return { success: false, documentType: "unknown", error: "Failed to process image file" };
      }
    } else if (isPdf) {
      // For PDFs, first try text extraction, then fall back to OCR for scanned PDFs
      console.log("[DocumentImport] Extracting text from PDF using pdfjs-dist");
      try {
        // Download the PDF
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        console.log("[DocumentImport] Downloaded PDF, size:", uint8Array.byteLength);
        
        // Use pdfjs-dist to extract text (pure JavaScript, no native dependencies)
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;
        console.log("[DocumentImport] PDF loaded, pages:", pdf.numPages);
        
        // Extract text from all pages
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        console.log("[DocumentImport] PDF text extracted, length:", fullText.length);
        
        // Check if we got sufficient text (less than threshold suggests scanned/image PDF)
        if (fullText.trim().length < MIN_TEXT_LENGTH_FOR_SCANNED_DETECTION) {
          console.log("[DocumentImport] Insufficient text extracted, PDF appears to be scanned. Falling back to OCR...");
          
          // Log warning for multi-page PDFs
          if (pdf.numPages > 1) {
            console.warn(`[DocumentImport] PDF has ${pdf.numPages} pages, but only processing first page for OCR. Additional pages will be ignored.`);
          }
          
          // Create buffer for pdf2pic (only needed for scanned PDFs)
          const buffer = Buffer.from(arrayBuffer);
          
          // Convert PDF to images using pdf2pic for OCR
          // Use crypto.randomBytes for unique directory name to avoid collisions
          const uniqueId = randomBytes(8).toString('hex');
          const tempDir = join(tmpdir(), `pdf_ocr_${uniqueId}`);
          if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
          }
          
          try {
            const options = {
              density: 200, // DPI for image conversion
              saveFilename: `pdf_page_${uniqueId}`, // Unique filename to avoid collisions
              savePath: tempDir,
              format: "png" as const,
              width: 2000,
              height: 2800
            };
            
            console.log("[DocumentImport] Converting PDF to images for OCR...");
            const convert = fromBuffer(buffer, options);
            
            // Configure to use ImageMagick (not GraphicsMagick)
            convert.setGMClass(true); // true = use ImageMagick
            
            // Convert first page to base64 for vision OCR (limiting to first page for efficiency)
            const pageResult = await convert(1, { responseType: "base64" });
            
            if (!pageResult || !pageResult.base64) {
              throw new Error("PDF to image conversion failed");
            }
            
            console.log("[DocumentImport] PDF converted to image, using vision OCR");
            const dataUrl = `data:image/png;base64,${pageResult.base64}`;
            
            // Use vision-based OCR (similar to image processing)
            messageContent = [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
            ];
            
            // Clean up temp directory using safe fs.rmSync
            try {
              rmSync(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
              console.warn("[DocumentImport] Failed to cleanup temp directory:", cleanupError);
            }
          } catch (ocrError) {
            console.error("[DocumentImport] OCR conversion failed:", ocrError);
            // Clean up temp directory on error using safe fs.rmSync
            try {
              rmSync(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            throw new Error(`Failed to process scanned PDF: ${ocrError instanceof Error ? ocrError.message : 'Unknown error'}`);
          }
        } else {
          // Use the extracted text for LLM analysis
          const pdfText = fullText.substring(0, 50000); // Limit to 50k chars
          messageContent = [
            { type: "text", text: `${prompt}\n\nEXTRACTED PDF TEXT:\n${pdfText}` }
          ];
          console.log("[DocumentImport] PDF text extracted successfully");
        }
      } catch (pdfError) {
        console.error("[DocumentImport] Failed to extract PDF text:", pdfError);
        return { success: false, documentType: "unknown", error: `Failed to process PDF: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}` };
      }
    } else {
      // For CSV/Excel/text files, download and extract text content
      try {
        console.log("[DocumentImport] Fetching document content from URL:", fileUrl);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.status}`);
        }
        const textContent = await response.text();
        console.log("[DocumentImport] Extracted text content length:", textContent.length);
        messageContent = [
          { type: "text", text: `${prompt}\n\nDOCUMENT CONTENT:\n${textContent.substring(0, 50000)}` }
        ];
      } catch (fetchError) {
        console.error("[DocumentImport] Failed to fetch document:", fetchError);
        return { success: false, documentType: "unknown", error: "Failed to read document content" };
      }
    }
    
    console.log("[DocumentImport] Sending to LLM with content type:", isImage ? "image_url (base64)" : isPdf ? "text or image_url (OCR if needed)" : "text");
    console.log("[DocumentImport] Message content structure:", JSON.stringify(messageContent.map((m: any) => ({ type: m.type, hasUrl: !!m.image_url?.url || !!m.file_url?.url }))));
    
    // For images and scanned PDFs using OCR, we need to use a simpler approach without strict JSON schema
    // because some models don't support image_url with response_format
    // Text-based PDFs can use the full JSON schema
    const hasImageContent = messageContent.some((m: any) => m.type === 'image_url');
    const useSimpleFormat = hasImageContent;
    console.log("[DocumentImport] Using simple format (no response_format):", useSimpleFormat);
    
    const allDocumentTypes = ["purchase_order", "vendor_invoice", "freight_invoice", "customs_document", "sales_order", "invoice", "bill_of_materials", "work_order", "inventory_adjustment", "customer", "product", "contract", "journal_entry", "unknown"];

    let response;
    response = await invokeLLM({
      messages: [
        { role: "system", content: useSimpleFormat
          ? `You are a document parsing AI. Analyze the image and extract structured data. IMPORTANT: You MUST respond with ONLY valid JSON, no other text. The JSON must have "documentType" (one of: ${allDocumentTypes.join(", ")}), "confidence" (0.0-1.0), and the corresponding data object (purchaseOrder, vendorInvoice, freightInvoice, customsDocument, salesOrder, invoice, billOfMaterials, workOrder, inventoryAdjustment, customer, product, contract, or journalEntry). Set unused data objects to null.`
          : "You are a document parsing AI that extracts structured data from business documents. Always respond with valid JSON." },
        {
          role: "user",
          content: messageContent
        }
      ],
      // Only use response_format for non-image content
      // Some models don't support image_url with strict JSON schema
      ...(useSimpleFormat ? {} : {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "document_parse_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                documentType: { type: "string", enum: allDocumentTypes },
                confidence: { type: "number" },
                purchaseOrder: {
                  type: ["object", "null"],
                  properties: {
                    poNumber: { type: "string" },
                    vendorName: { type: "string" },
                    vendorEmail: { type: "string" },
                    orderDate: { type: "string" },
                    deliveryDate: { type: "string" },
                    status: { type: "string" },
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
                        required: ["description", "quantity", "unitPrice", "totalPrice"],
                        additionalProperties: false
                      }
                    },
                    subtotal: { type: "number" },
                    taxAmount: { type: "number" },
                    shippingAmount: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["poNumber", "vendorName", "orderDate", "lineItems", "totalAmount"],
                  additionalProperties: false
                },
                vendorInvoice: {
                  type: ["object", "null"],
                  properties: {
                    invoiceNumber: { type: "string" },
                    vendorName: { type: "string" },
                    vendorEmail: { type: "string" },
                    invoiceDate: { type: "string" },
                    dueDate: { type: "string" },
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
                        required: ["description", "quantity", "unitPrice", "totalPrice"],
                        additionalProperties: false
                      }
                    },
                    subtotal: { type: "number" },
                    taxAmount: { type: "number" },
                    shippingAmount: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    relatedPoNumber: { type: "string" },
                    paymentTerms: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["invoiceNumber", "vendorName", "invoiceDate", "lineItems", "totalAmount"],
                  additionalProperties: false
                },
                freightInvoice: {
                  type: ["object", "null"],
                  properties: {
                    invoiceNumber: { type: "string" },
                    carrierName: { type: "string" },
                    carrierEmail: { type: "string" },
                    invoiceDate: { type: "string" },
                    shipmentDate: { type: "string" },
                    deliveryDate: { type: "string" },
                    origin: { type: "string" },
                    destination: { type: "string" },
                    trackingNumber: { type: "string" },
                    weight: { type: "string" },
                    dimensions: { type: "string" },
                    freightCharges: { type: "number" },
                    fuelSurcharge: { type: "number" },
                    accessorialCharges: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    relatedPoNumber: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["invoiceNumber", "carrierName", "invoiceDate", "totalAmount"],
                  additionalProperties: false
                },
                customsDocument: {
                  type: ["object", "null"],
                  properties: {
                    documentNumber: { type: "string" },
                    documentType: { type: "string", enum: ["bill_of_lading", "customs_entry", "commercial_invoice", "packing_list", "certificate_of_origin", "import_permit", "other"] },
                    entryDate: { type: "string" },
                    shipperName: { type: "string" },
                    shipperCountry: { type: "string" },
                    consigneeName: { type: "string" },
                    consigneeCountry: { type: "string" },
                    countryOfOrigin: { type: "string" },
                    portOfEntry: { type: "string" },
                    portOfExit: { type: "string" },
                    vesselName: { type: "string" },
                    voyageNumber: { type: "string" },
                    containerNumber: { type: "string" },
                    lineItems: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          description: { type: "string" },
                          hsCode: { type: "string" },
                          quantity: { type: "number" },
                          unit: { type: "string" },
                          declaredValue: { type: "number" },
                          dutyRate: { type: "number" },
                          dutyAmount: { type: "number" },
                          countryOfOrigin: { type: "string" }
                        },
                        required: ["description", "quantity", "declaredValue"],
                        additionalProperties: false
                      }
                    },
                    totalDeclaredValue: { type: "number" },
                    totalDuties: { type: "number" },
                    totalTaxes: { type: "number" },
                    totalCharges: { type: "number" },
                    currency: { type: "string" },
                    brokerName: { type: "string" },
                    brokerReference: { type: "string" },
                    relatedPoNumber: { type: "string" },
                    trackingNumber: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["documentNumber", "documentType", "entryDate", "shipperName", "consigneeName", "countryOfOrigin", "totalCharges"],
                  additionalProperties: false
                },
                salesOrder: {
                  type: ["object", "null"],
                  properties: {
                    orderNumber: { type: "string" },
                    customerName: { type: "string" },
                    customerEmail: { type: "string" },
                    orderDate: { type: "string" },
                    shippingAddress: { type: "string" },
                    billingAddress: { type: "string" },
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
                        required: ["description", "quantity", "unitPrice", "totalPrice"],
                        additionalProperties: false
                      }
                    },
                    subtotal: { type: "number" },
                    taxAmount: { type: "number" },
                    shippingAmount: { type: "number" },
                    discountAmount: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["orderNumber", "customerName", "orderDate", "lineItems", "totalAmount"],
                  additionalProperties: false
                },
                invoice: {
                  type: ["object", "null"],
                  properties: {
                    invoiceNumber: { type: "string" },
                    customerName: { type: "string" },
                    customerEmail: { type: "string" },
                    issueDate: { type: "string" },
                    dueDate: { type: "string" },
                    type: { type: "string", enum: ["invoice", "credit_note", "quote"] },
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
                        required: ["description", "quantity", "unitPrice", "totalPrice"],
                        additionalProperties: false
                      }
                    },
                    subtotal: { type: "number" },
                    taxAmount: { type: "number" },
                    discountAmount: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    paymentTerms: { type: "string" },
                    purchaseOrderNumber: { type: "string" },
                    notes: { type: "string" },
                    terms: { type: "string" }
                  },
                  required: ["invoiceNumber", "customerName", "issueDate", "type", "lineItems", "totalAmount"],
                  additionalProperties: false
                },
                billOfMaterials: {
                  type: ["object", "null"],
                  properties: {
                    productName: { type: "string" },
                    productSku: { type: "string" },
                    version: { type: "string" },
                    batchSize: { type: "number" },
                    batchUnit: { type: "string" },
                    components: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          sku: { type: "string" },
                          componentType: { type: "string", enum: ["raw_material", "product", "packaging", "labor"] },
                          quantity: { type: "number" },
                          unit: { type: "string" },
                          unitCost: { type: "number" },
                          wastagePercent: { type: "number" },
                          notes: { type: "string" }
                        },
                        required: ["name", "componentType", "quantity"],
                        additionalProperties: false
                      }
                    },
                    laborCost: { type: "number" },
                    overheadCost: { type: "number" },
                    notes: { type: "string" }
                  },
                  required: ["productName", "components"],
                  additionalProperties: false
                },
                workOrder: {
                  type: ["object", "null"],
                  properties: {
                    productName: { type: "string" },
                    productSku: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string" },
                    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                    scheduledStartDate: { type: "string" },
                    scheduledEndDate: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["productName", "quantity"],
                  additionalProperties: false
                },
                inventoryAdjustment: {
                  type: ["object", "null"],
                  properties: {
                    adjustmentType: { type: "string", enum: ["count", "adjustment", "transfer"] },
                    warehouseName: { type: "string" },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          productName: { type: "string" },
                          productSku: { type: "string" },
                          currentQuantity: { type: "number" },
                          newQuantity: { type: "number" },
                          adjustmentQuantity: { type: "number" },
                          unit: { type: "string" },
                          reason: { type: "string" }
                        },
                        required: ["productName"],
                        additionalProperties: false
                      }
                    },
                    performedDate: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["adjustmentType", "items"],
                  additionalProperties: false
                },
                customer: {
                  type: ["object", "null"],
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
                    creditLimit: { type: "number" },
                    paymentTerms: { type: "number" },
                    notes: { type: "string" }
                  },
                  required: ["name", "type"],
                  additionalProperties: false
                },
                product: {
                  type: ["object", "null"],
                  properties: {
                    name: { type: "string" },
                    sku: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string" },
                    type: { type: "string", enum: ["physical", "digital", "service"] },
                    unitPrice: { type: "number" },
                    costPrice: { type: "number" },
                    currency: { type: "string" },
                    taxable: { type: "boolean" },
                    taxRate: { type: "number" },
                    notes: { type: "string" }
                  },
                  required: ["name", "sku", "type", "unitPrice"],
                  additionalProperties: false
                },
                contract: {
                  type: ["object", "null"],
                  properties: {
                    contractNumber: { type: "string" },
                    title: { type: "string" },
                    type: { type: "string", enum: ["customer", "vendor", "employment", "nda", "partnership", "lease", "service", "other"] },
                    partyName: { type: "string" },
                    startDate: { type: "string" },
                    endDate: { type: "string" },
                    renewalDate: { type: "string" },
                    autoRenewal: { type: "boolean" },
                    value: { type: "number" },
                    currency: { type: "string" },
                    description: { type: "string" },
                    terms: { type: "string" },
                    keyDates: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          dateType: { type: "string" },
                          date: { type: "string" },
                          description: { type: "string" }
                        },
                        required: ["dateType", "date"],
                        additionalProperties: false
                      }
                    },
                    notes: { type: "string" }
                  },
                  required: ["title", "type", "partyName"],
                  additionalProperties: false
                },
                journalEntry: {
                  type: ["object", "null"],
                  properties: {
                    description: { type: "string" },
                    date: { type: "string" },
                    lines: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          accountName: { type: "string" },
                          accountNumber: { type: "string" },
                          description: { type: "string" },
                          debit: { type: "number" },
                          credit: { type: "number" }
                        },
                        required: ["accountName", "debit", "credit"],
                        additionalProperties: false
                      }
                    },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    referenceNumber: { type: "string" },
                    notes: { type: "string" }
                  },
                  required: ["description", "date", "lines", "totalAmount"],
                  additionalProperties: false
                }
              },
              required: ["documentType", "confidence"],
              additionalProperties: false
            }
          }
        }
      })
    });

    console.log("[DocumentImport] LLM response received:", JSON.stringify(response, null, 2).substring(0, 500));
    
    if (!response || !response.choices || response.choices.length === 0) {
      console.error("[DocumentImport] Invalid LLM response structure:", response);
      return { success: false, documentType: "unknown", error: "Invalid response from AI - no choices returned" };
    }
    
    const content_str = response.choices[0]?.message?.content;
    if (!content_str) {
      console.error("[DocumentImport] No content in LLM response:", response.choices[0]);
      return { success: false, documentType: "unknown", error: "No content in AI response" };
    }
    
    // Handle both string and array content
    let contentText: string;
    if (typeof content_str === 'string') {
      contentText = content_str;
    } else if (Array.isArray(content_str)) {
      // Extract text from content array
      const textPart = content_str.find((p): p is TextContent => p.type === 'text');
      contentText = textPart?.text || JSON.stringify(content_str);
    } else {
      contentText = JSON.stringify(content_str);
    }
    
    console.log("[DocumentImport] Raw content:", contentText.substring(0, 300));
    
    // Strip markdown code blocks if present
    let jsonText = contentText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7); // Remove ```json
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3); // Remove ```
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3); // Remove trailing ```
    }
    jsonText = jsonText.trim();
    
    console.log("[DocumentImport] Cleaned JSON:", jsonText.substring(0, 500));
    const parsed = JSON.parse(jsonText);
    console.log("[DocumentImport] Parsed result:", JSON.stringify(parsed, null, 2).substring(0, 1000));
    
    return {
      success: true,
      documentType: parsed.documentType,
      purchaseOrder: parsed.purchaseOrder,
      vendorInvoice: parsed.vendorInvoice,
      freightInvoice: parsed.freightInvoice,
      customsDocument: parsed.customsDocument,
      salesOrder: parsed.salesOrder,
      invoice: parsed.invoice,
      billOfMaterials: parsed.billOfMaterials,
      workOrder: parsed.workOrder,
      inventoryAdjustment: parsed.inventoryAdjustment,
      customer: parsed.customer,
      product: parsed.product,
      contract: parsed.contract,
      journalEntry: parsed.journalEntry,
      rawText: `Document parsed from: ${fileUrl}`
    };
  } catch (error) {
    console.error("Document parse error:", error);
    return {
      success: false,
      documentType: "unknown",
      error: error instanceof Error ? error.message : "Unknown parsing error"
    };
  }
}

/**
 * Match line items to existing raw materials
 */
export async function matchLineItemsToMaterials(
  lineItems: ImportedLineItem[]
): Promise<ImportedLineItem[]> {
  const rawMaterials = await db.getRawMaterials();
  
  return lineItems.map(item => {
    // Try to match by description or SKU
    const match = rawMaterials.find(rm => {
      const descMatch = rm.name.toLowerCase().includes(item.description.toLowerCase()) ||
                       item.description.toLowerCase().includes(rm.name.toLowerCase());
      const skuMatch = item.sku && rm.sku && rm.sku.toLowerCase() === item.sku.toLowerCase();
      return descMatch || skuMatch;
    });
    
    return {
      ...item,
      rawMaterialId: match?.id
    };
  });
}

/**
 * Import a parsed purchase order into the system
 */
export async function importPurchaseOrder(
  po: ImportedPurchaseOrder,
  userId: number,
  markAsReceived: boolean = true
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create vendor
    let vendor = await db.getVendorByName(po.vendorName);
    if (!vendor) {
      const vendorResult = await db.createVendor({
        name: po.vendorName,
        email: po.vendorEmail || "",
        type: "supplier",
        status: "active"
      });
      vendor = await db.getVendorById(vendorResult.id) || null;
      createdRecords.push({ type: "vendor", id: vendorResult.id, name: po.vendorName });
    }

    // 2. Match line items to raw materials
    const matchedItems = await matchLineItemsToMaterials(po.lineItems);
    
    // 3. Create raw materials for unmatched items
    for (const item of matchedItems) {
      if (!item.rawMaterialId) {
        const materialResult = await db.createRawMaterial({
          name: item.description,
          sku: item.sku || `RM-${Date.now()}`,
          unit: item.unit || "EA",
          unitCost: item.unitPrice.toString(),
          preferredVendorId: vendor!.id
        });
        item.rawMaterialId = materialResult.id;
        createdRecords.push({ type: "raw_material", id: materialResult.id, name: item.description });
      }
    }

    // 4. Create the purchase order
    const poResult = await db.createPurchaseOrder({
      poNumber: po.poNumber,
      vendorId: vendor!.id,
      status: markAsReceived ? "received" : "confirmed",
      orderDate: new Date(po.orderDate),
      expectedDate: po.deliveryDate ? new Date(po.deliveryDate) : undefined,
      subtotal: po.subtotal.toString(),
      totalAmount: po.totalAmount.toString(),
      notes: po.notes,
      createdBy: userId
    });
    createdRecords.push({ type: "purchase_order", id: poResult.id, name: po.poNumber });

    // 5. Create PO line items
    for (const item of matchedItems) {
      await db.createPurchaseOrderItem({
        purchaseOrderId: poResult.id,
        productId: null, // Raw material items don't have product IDs
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalAmount: item.totalPrice.toString()
      });
    }

    // 6. If marking as received, update inventory
    if (markAsReceived) {
      for (const item of matchedItems) {
        if (item.rawMaterialId) {
          // Get current stock and add received quantity
          const material = await db.getRawMaterialById(item.rawMaterialId);
          if (material) {
            const currentReceived = parseFloat(material.quantityReceived || '0');
            const newReceived = currentReceived + item.quantity;
            await db.updateRawMaterial(item.rawMaterialId, {
              quantityReceived: newReceived.toString(),
              lastReceivedDate: new Date(),
              lastReceivedQty: item.quantity.toString(),
              receivingStatus: 'received'
            } as any);
            updatedRecords.push({
              type: "raw_material",
              id: item.rawMaterialId,
              name: material.name,
              changes: `Received: +${item.quantity} (total received: ${newReceived})`
            });
          }
        }
      }
    }

    return {
      success: true,
      documentType: "purchase_order",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "purchase_order",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed freight invoice into the system
 */
export async function importFreightInvoice(
  invoice: ImportedFreightInvoice,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create carrier as vendor
    let carrier = await db.getVendorByName(invoice.carrierName);
    if (!carrier) {
      const carrierResult = await db.createVendor({
        name: invoice.carrierName,
        email: invoice.carrierEmail || "",
        type: "service", // Use 'service' for carriers since 'carrier' is not a valid type
        status: "active"
      });
      carrier = await db.getVendorById(carrierResult.id) || null;
      createdRecords.push({ type: "vendor", id: carrierResult.id, name: invoice.carrierName });
    }

    // 2. Try to find related PO if specified
    let relatedPoId: number | undefined;
    if (invoice.relatedPoNumber) {
      const po = await db.findPurchaseOrderByNumber(invoice.relatedPoNumber);
      if (po) {
        relatedPoId = po.id;
      } else {
        warnings.push(`Related PO ${invoice.relatedPoNumber} not found`);
      }
    }

    // 3. Create freight history record
    const freightId = await db.createFreightHistory({
      invoiceNumber: invoice.invoiceNumber,
      carrierId: carrier!.id,
      invoiceDate: new Date(invoice.invoiceDate).getTime(),
      shipmentDate: invoice.shipmentDate ? new Date(invoice.shipmentDate).getTime() : undefined,
      deliveryDate: invoice.deliveryDate ? new Date(invoice.deliveryDate).getTime() : undefined,
      origin: invoice.origin,
      destination: invoice.destination,
      trackingNumber: invoice.trackingNumber,
      weight: invoice.weight,
      dimensions: invoice.dimensions,
      freightCharges: invoice.freightCharges.toString(),
      fuelSurcharge: invoice.fuelSurcharge?.toString(),
      accessorialCharges: invoice.accessorialCharges?.toString(),
      totalAmount: invoice.totalAmount.toString(),
      currency: invoice.currency || "USD",
      relatedPoId,
      notes: invoice.notes,
      createdBy: userId
    });
    createdRecords.push({ type: "freight_history", id: freightId, name: invoice.invoiceNumber });

    // 4. If related to a PO, update the PO with freight cost
    if (relatedPoId) {
      await db.updatePurchaseOrder(relatedPoId, { freightCost: invoice.totalAmount.toString() } as any);
      updatedRecords.push({
        type: "purchase_order",
        id: relatedPoId,
        name: invoice.relatedPoNumber!,
        changes: `Freight cost added: $${invoice.totalAmount}`
      });
    }

    return {
      success: true,
      documentType: "freight_invoice",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "freight_invoice",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed vendor invoice into the system
 */
export async function importVendorInvoice(
  invoice: ImportedVendorInvoice,
  userId: number,
  markAsReceived: boolean = false
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create vendor
    let vendor = await db.getVendorByName(invoice.vendorName);
    if (!vendor) {
      const vendorResult = await db.createVendor({
        name: invoice.vendorName,
        email: invoice.vendorEmail || "",
        type: "supplier",
        status: "active"
      });
      vendor = await db.getVendorById(vendorResult.id) || null;
      createdRecords.push({ type: "vendor", id: vendorResult.id, name: invoice.vendorName });
    }

    // 2. Match line items to raw materials
    const matchedItems = await matchLineItemsToMaterials(invoice.lineItems);

    // 3. Try to find related PO if specified
    let relatedPoId: number | undefined;
    if (invoice.relatedPoNumber) {
      const po = await db.findPurchaseOrderByNumber(invoice.relatedPoNumber);
      if (po) {
        relatedPoId = po.id;
      } else {
        warnings.push(`Related PO ${invoice.relatedPoNumber} not found`);
      }
    }

    // 4. Create raw materials for unmatched items
    for (const item of matchedItems) {
      if (!item.rawMaterialId) {
        const materialResult = await db.createRawMaterial({
          name: item.description,
          sku: item.sku || `RM-${Date.now()}`,
          unit: item.unit || "EA",
          unitCost: item.unitPrice.toString(),
          preferredVendorId: vendor!.id
        });
        item.rawMaterialId = materialResult.id;
        createdRecords.push({ type: "raw_material", id: materialResult.id, name: item.description });
      }
    }

    // 5. Create a purchase order from the invoice (as a received order)
    const poResult = await db.createPurchaseOrder({
      poNumber: invoice.relatedPoNumber || `INV-${invoice.invoiceNumber}`,
      vendorId: vendor!.id,
      status: markAsReceived ? "received" : "confirmed",
      orderDate: new Date(invoice.invoiceDate),
      expectedDate: invoice.dueDate ? new Date(invoice.dueDate) : undefined,
      subtotal: invoice.subtotal.toString(),
      totalAmount: invoice.totalAmount.toString(),
      notes: `Imported from vendor invoice ${invoice.invoiceNumber}. ${invoice.paymentTerms ? `Payment terms: ${invoice.paymentTerms}. ` : ''}${invoice.notes || ''}`,
      createdBy: userId
    });
    createdRecords.push({ type: "purchase_order", id: poResult.id, name: invoice.invoiceNumber });

    // 6. Create PO line items
    for (const item of matchedItems) {
      await db.createPurchaseOrderItem({
        purchaseOrderId: poResult.id,
        productId: null,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalAmount: item.totalPrice.toString()
      });
    }

    // 7. If marking as received, update inventory
    if (markAsReceived) {
      for (const item of matchedItems) {
        if (item.rawMaterialId) {
          const material = await db.getRawMaterialById(item.rawMaterialId);
          if (material) {
            const currentReceived = parseFloat(material.quantityReceived || '0');
            const newReceived = currentReceived + item.quantity;
            await db.updateRawMaterial(item.rawMaterialId, {
              quantityReceived: newReceived.toString(),
              lastReceivedDate: new Date(),
              lastReceivedQty: item.quantity.toString(),
              receivingStatus: 'received'
            } as any);
            updatedRecords.push({
              type: "raw_material",
              id: item.rawMaterialId,
              name: material.name,
              changes: `Received: +${item.quantity} (total received: ${newReceived})`
            });
          }
        }
      }
    }

    return {
      success: true,
      documentType: "vendor_invoice",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "vendor_invoice",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed customs document into the system
 */
export async function importCustomsDocument(
  doc: ImportedCustomsDocument,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create the shipper as a vendor
    let shipper = await db.getVendorByName(doc.shipperName);
    if (!shipper) {
      const shipperResult = await db.createVendor({
        name: doc.shipperName,
        email: "",
        type: "supplier",
        status: "active",
        country: doc.shipperCountry
      });
      shipper = await db.getVendorById(shipperResult.id) || null;
      createdRecords.push({ type: "vendor", id: shipperResult.id, name: doc.shipperName });
    }

    // 2. Find or create customs broker as a vendor (if specified)
    let broker = null;
    if (doc.brokerName) {
      broker = await db.getVendorByName(doc.brokerName);
      if (!broker) {
        const brokerResult = await db.createVendor({
          name: doc.brokerName,
          email: "",
          type: "service",
          status: "active"
        });
        broker = await db.getVendorById(brokerResult.id) || null;
        createdRecords.push({ type: "vendor", id: brokerResult.id, name: doc.brokerName });
      }
    }

    // 3. Try to find related PO if specified
    let relatedPoId: number | undefined;
    if (doc.relatedPoNumber) {
      const po = await db.findPurchaseOrderByNumber(doc.relatedPoNumber);
      if (po) {
        relatedPoId = po.id;
      } else {
        warnings.push(`Related PO ${doc.relatedPoNumber} not found`);
      }
    }

    // 4. Create customs entry record in freight history (using it to track customs docs)
    const freightId = await db.createFreightHistory({
      invoiceNumber: doc.documentNumber,
      carrierId: shipper!.id, // Using shipper as carrier for customs docs
      invoiceDate: new Date(doc.entryDate).getTime(),
      origin: doc.portOfExit || doc.shipperCountry,
      destination: doc.portOfEntry || doc.consigneeCountry,
      trackingNumber: doc.containerNumber || doc.trackingNumber,
      freightCharges: (doc.totalDeclaredValue ?? 0).toString(),
      fuelSurcharge: (doc.totalDuties ?? 0).toString(),
      accessorialCharges: (doc.totalTaxes ?? 0).toString(),
      totalAmount: (doc.totalCharges ?? 0).toString(),
      currency: doc.currency || "USD",
      relatedPoId,
      notes: `${doc.documentType.replace(/_/g, ' ').toUpperCase()} | Shipper: ${doc.shipperName} (${doc.shipperCountry || 'N/A'}) | Consignee: ${doc.consigneeName} | Country of Origin: ${doc.countryOfOrigin}${doc.vesselName ? ` | Vessel: ${doc.vesselName}` : ''}${doc.voyageNumber ? ` | Voyage: ${doc.voyageNumber}` : ''}${doc.brokerName ? ` | Broker: ${doc.brokerName}` : ''}${doc.brokerReference ? ` (Ref: ${doc.brokerReference})` : ''}${doc.notes ? ` | Notes: ${doc.notes}` : ''}`,
      createdBy: userId
    });
    createdRecords.push({ type: "customs_document", id: freightId, name: doc.documentNumber });

    // 5. Create or update raw materials for line items with HS codes
    for (const item of doc.lineItems) {
      if (item.hsCode) {
        // Try to find existing material by HS code or description
        const materials = await db.getAllRawMaterials();
        const existingMaterial = materials.find(m =>
          m.sku === item.hsCode ||
          m.name.toLowerCase().includes(item.description.toLowerCase().substring(0, 20))
        );

        if (existingMaterial) {
          // Update with HS code if not already set
          if (!existingMaterial.sku?.startsWith('HS-')) {
            await db.updateRawMaterial(existingMaterial.id, {
              sku: `HS-${item.hsCode}`,
              notes: `HS Code: ${item.hsCode}. Country of Origin: ${item.countryOfOrigin || doc.countryOfOrigin}`
            } as any);
            updatedRecords.push({
              type: "raw_material",
              id: existingMaterial.id,
              name: existingMaterial.name,
              changes: `Added HS Code: ${item.hsCode}`
            });
          }
        } else {
          // Create new material with HS code
          const materialResult = await db.createRawMaterial({
            name: item.description,
            sku: `HS-${item.hsCode}`,
            unit: item.unit || "EA",
            unitCost: (item.declaredValue / item.quantity).toString(),
            preferredVendorId: shipper!.id
          });
          createdRecords.push({ type: "raw_material", id: materialResult.id, name: item.description });
        }
      }
    }

    // 6. If related to a PO, add customs info to the PO
    if (relatedPoId) {
      await db.updatePurchaseOrder(relatedPoId, {
        notes: `Customs Doc: ${doc.documentNumber} | Duties: $${doc.totalDuties ?? 0} | Taxes: $${doc.totalTaxes ?? 0}`
      } as any);
      updatedRecords.push({
        type: "purchase_order",
        id: relatedPoId,
        name: doc.relatedPoNumber!,
        changes: `Customs document linked: ${doc.documentNumber}`
      });
    }

    return {
      success: true,
      documentType: "customs_document",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "customs_document",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed sales order into the system
 */
export async function importSalesOrder(
  order: ImportedSalesOrder,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create customer
    let customer = await db.getCustomerByName(order.customerName);
    if (!customer) {
      const customerResult = await db.createCustomer({
        name: order.customerName,
        email: order.customerEmail || "",
        type: "business",
        status: "active"
      });
      customer = await db.getCustomerById(customerResult.id) || null;
      createdRecords.push({ type: "customer", id: customerResult.id, name: order.customerName });
    }

    // 2. Create the sales order
    const orderResult = await db.createSalesOrder({
      customerId: customer!.id,
      source: "manual",
      status: "confirmed",
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      subtotal: order.subtotal.toString(),
      taxAmount: (order.taxAmount ?? 0).toString(),
      shippingAmount: (order.shippingAmount ?? 0).toString(),
      discountAmount: (order.discountAmount ?? 0).toString(),
      totalAmount: order.totalAmount.toString(),
      currency: order.currency || "USD",
      shippingAddress: order.shippingAddress ? JSON.parse(JSON.stringify({ raw: order.shippingAddress })) : undefined,
      billingAddress: order.billingAddress ? JSON.parse(JSON.stringify({ raw: order.billingAddress })) : undefined,
      notes: order.notes,
      orderDate: new Date(order.orderDate),
    } as any);
    createdRecords.push({ type: "sales_order", id: orderResult.id, name: orderResult.orderNumber });

    // 3. Create order line items
    for (const item of order.lineItems) {
      // Try to find matching product
      let productId: number | null = null;
      if (item.sku) {
        const products = await db.getProducts();
        const match = products.find(p => p.sku?.toLowerCase() === item.sku?.toLowerCase());
        if (match) productId = match.id;
      }
      await db.createOrderItem({
        orderId: orderResult.id,
        productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalAmount: item.totalPrice.toString()
      } as any);
    }

    return {
      success: true,
      documentType: "sales_order",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "sales_order",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed invoice (outbound to customer) into the system
 */
export async function importInvoice(
  inv: ImportedInvoice,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create customer
    let customer = await db.getCustomerByName(inv.customerName);
    if (!customer) {
      const customerResult = await db.createCustomer({
        name: inv.customerName,
        email: inv.customerEmail || "",
        type: "business",
        status: "active"
      });
      customer = await db.getCustomerById(customerResult.id) || null;
      createdRecords.push({ type: "customer", id: customerResult.id, name: inv.customerName });
    }

    // 2. Create the invoice
    const invoiceResult = await db.createInvoice({
      invoiceNumber: inv.invoiceNumber,
      customerId: customer!.id,
      type: inv.type || "invoice",
      status: "draft",
      issueDate: new Date(inv.issueDate),
      dueDate: inv.dueDate ? new Date(inv.dueDate) : undefined,
      subtotal: inv.subtotal.toString(),
      taxAmount: (inv.taxAmount ?? 0).toString(),
      discountAmount: (inv.discountAmount ?? 0).toString(),
      totalAmount: inv.totalAmount.toString(),
      currency: inv.currency || "USD",
      notes: inv.notes,
      terms: inv.terms,
      purchaseOrderNumber: inv.purchaseOrderNumber,
      createdBy: userId
    } as any);
    createdRecords.push({ type: "invoice", id: invoiceResult.id, name: inv.invoiceNumber });

    // 3. Create invoice line items
    for (const item of inv.lineItems) {
      let productId: number | null = null;
      if (item.sku) {
        const products = await db.getProducts();
        const match = products.find(p => p.sku?.toLowerCase() === item.sku?.toLowerCase());
        if (match) productId = match.id;
      }
      await db.createInvoiceItem({
        invoiceId: invoiceResult.id,
        productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalAmount: item.totalPrice.toString()
      } as any);
    }

    return {
      success: true,
      documentType: "invoice",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "invoice",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed bill of materials into the system
 */
export async function importBillOfMaterials(
  bom: ImportedBillOfMaterials,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create the product
    let product = null;
    const products = await db.getProducts();
    if (bom.productSku) {
      product = products.find(p => p.sku?.toLowerCase() === bom.productSku?.toLowerCase());
    }
    if (!product) {
      product = products.find(p => p.name.toLowerCase() === bom.productName.toLowerCase());
    }
    if (!product) {
      const productResult = await db.createProduct({
        name: bom.productName,
        sku: bom.productSku || `PROD-${Date.now()}`,
        type: "physical",
        unitPrice: "0",
        status: "active"
      });
      product = { id: productResult.id, name: bom.productName };
      createdRecords.push({ type: "product", id: productResult.id, name: bom.productName });
    }

    // 2. Create the BOM
    const bomResult = await db.createBom({
      productId: product.id,
      name: `BOM - ${bom.productName}`,
      version: bom.version || "1.0",
      status: "draft",
      batchSize: (bom.batchSize ?? 1).toString(),
      batchUnit: bom.batchUnit || "EA",
      laborCost: (bom.laborCost ?? 0).toString(),
      overheadCost: (bom.overheadCost ?? 0).toString(),
      notes: bom.notes,
      createdBy: userId
    } as any);
    createdRecords.push({ type: "bill_of_materials", id: bomResult.id, name: `BOM - ${bom.productName}` });

    // 3. Create BOM components
    for (let i = 0; i < bom.components.length; i++) {
      const comp = bom.components[i];
      let rawMaterialId: number | undefined;
      let productId: number | undefined;

      if (comp.componentType === "raw_material") {
        // Try to match existing raw material
        const materials = await db.getRawMaterials();
        const match = materials.find(m =>
          (comp.sku && m.sku?.toLowerCase() === comp.sku.toLowerCase()) ||
          m.name.toLowerCase() === comp.name.toLowerCase()
        );
        if (match) {
          rawMaterialId = match.id;
        } else {
          const matResult = await db.createRawMaterial({
            name: comp.name,
            sku: comp.sku || `RM-${Date.now()}-${i}`,
            unit: comp.unit || "EA",
            unitCost: (comp.unitCost ?? 0).toString()
          });
          rawMaterialId = matResult.id;
          createdRecords.push({ type: "raw_material", id: matResult.id, name: comp.name });
        }
      } else if (comp.componentType === "product") {
        const match = products.find(p =>
          (comp.sku && p.sku?.toLowerCase() === comp.sku.toLowerCase()) ||
          p.name.toLowerCase() === comp.name.toLowerCase()
        );
        if (match) productId = match.id;
      }

      await db.createBomComponent({
        bomId: bomResult.id,
        componentType: comp.componentType,
        rawMaterialId: rawMaterialId ?? null,
        productId: productId ?? null,
        name: comp.name,
        sku: comp.sku || undefined,
        quantity: comp.quantity.toString(),
        unit: comp.unit || "EA",
        unitCost: (comp.unitCost ?? 0).toString(),
        wastagePercent: (comp.wastagePercent ?? 0).toString(),
        notes: comp.notes,
        sortOrder: i
      } as any);
    }

    return {
      success: true,
      documentType: "bill_of_materials",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "bill_of_materials",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed work order into the system
 */
export async function importWorkOrder(
  wo: ImportedWorkOrder,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find the product
    const products = await db.getProducts();
    let product = null;
    if (wo.productSku) {
      product = products.find(p => p.sku?.toLowerCase() === wo.productSku?.toLowerCase());
    }
    if (!product) {
      product = products.find(p => p.name.toLowerCase() === wo.productName.toLowerCase());
    }
    if (!product) {
      const productResult = await db.createProduct({
        name: wo.productName,
        sku: wo.productSku || `PROD-${Date.now()}`,
        type: "physical",
        unitPrice: "0",
        status: "active"
      });
      product = { id: productResult.id };
      createdRecords.push({ type: "product", id: productResult.id, name: wo.productName });
    }

    // 2. Find a BOM for this product (required for work orders)
    const boms = await db.getBillOfMaterials({ productId: product.id });
    let bomId: number;
    if (boms && boms.length > 0) {
      bomId = boms[0].id;
    } else {
      // Create a placeholder BOM
      const bomResult = await db.createBom({
        productId: product.id,
        name: `BOM - ${wo.productName}`,
        version: "1.0",
        status: "draft",
        createdBy: userId
      } as any);
      bomId = bomResult.id;
      createdRecords.push({ type: "bill_of_materials", id: bomResult.id, name: `BOM - ${wo.productName}` });
      warnings.push("No existing BOM found; a placeholder BOM was created");
    }

    // 3. Create the work order
    const woResult = await db.createWorkOrder({
      bomId,
      productId: product.id,
      quantity: wo.quantity.toString(),
      unit: wo.unit || "EA",
      status: "draft",
      priority: wo.priority || "normal",
      scheduledStartDate: wo.scheduledStartDate ? new Date(wo.scheduledStartDate) : undefined,
      scheduledEndDate: wo.scheduledEndDate ? new Date(wo.scheduledEndDate) : undefined,
      notes: wo.notes,
      createdBy: userId
    } as any);
    createdRecords.push({ type: "work_order", id: woResult.id, name: woResult.workOrderNumber });

    return {
      success: true,
      documentType: "work_order",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "work_order",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed inventory adjustment into the system
 */
export async function importInventoryAdjustment(
  adj: ImportedInventoryAdjustment,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    const products = await db.getProducts();

    for (const item of adj.items) {
      // Find the product
      let product = null;
      if (item.productSku) {
        product = products.find(p => p.sku?.toLowerCase() === item.productSku?.toLowerCase());
      }
      if (!product) {
        product = products.find(p => p.name.toLowerCase() === item.productName.toLowerCase());
      }
      if (!product) {
        warnings.push(`Product not found: ${item.productName}${item.productSku ? ` (${item.productSku})` : ''}`);
        continue;
      }

      // Determine adjustment quantity
      let adjustmentQty = item.adjustmentQuantity ?? 0;
      if (!adjustmentQty && item.newQuantity != null && item.currentQuantity != null) {
        adjustmentQty = item.newQuantity - item.currentQuantity;
      }

      const transactionType = adj.adjustmentType === "count" ? "count_adjust" : "adjust";

      // Create inventory transaction
      const txnResult = await db.createInventoryTransaction({
        transactionType,
        productId: product.id,
        quantity: Math.abs(adjustmentQty).toString(),
        unit: item.unit || "EA",
        reason: item.reason || `Imported ${adj.adjustmentType} adjustment`,
        performedBy: userId,
        performedAt: adj.performedDate ? new Date(adj.performedDate) : new Date()
      } as any);
      createdRecords.push({
        type: "inventory_transaction",
        id: txnResult.id,
        name: `${txnResult.transactionNumber} - ${item.productName}`
      });
    }

    return {
      success: true,
      documentType: "inventory_adjustment",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "inventory_adjustment",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed customer record into the system
 */
export async function importCustomerRecord(
  cust: ImportedCustomer,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // Check if customer already exists
    const existing = await db.getCustomerByName(cust.name);
    if (existing) {
      warnings.push(`Customer "${cust.name}" already exists (ID: ${existing.id})`);
      return {
        success: true,
        documentType: "customer",
        createdRecords,
        updatedRecords,
        warnings
      };
    }

    const result = await db.createCustomer({
      name: cust.name,
      email: cust.email || "",
      phone: cust.phone,
      address: cust.address,
      city: cust.city,
      state: cust.state,
      country: cust.country,
      postalCode: cust.postalCode,
      type: cust.type || "business",
      status: "active",
      creditLimit: cust.creditLimit?.toString(),
      paymentTerms: cust.paymentTerms,
      notes: cust.notes
    } as any);
    createdRecords.push({ type: "customer", id: result.id, name: cust.name });

    return {
      success: true,
      documentType: "customer",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "customer",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed product record into the system
 */
export async function importProductRecord(
  prod: ImportedProduct,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // Check if product already exists by SKU
    const products = await db.getProducts();
    const existing = products.find(p => p.sku?.toLowerCase() === prod.sku.toLowerCase());
    if (existing) {
      warnings.push(`Product with SKU "${prod.sku}" already exists (ID: ${existing.id})`);
      return {
        success: true,
        documentType: "product",
        createdRecords,
        updatedRecords,
        warnings
      };
    }

    const result = await db.createProduct({
      name: prod.name,
      sku: prod.sku,
      description: prod.description,
      category: prod.category,
      type: prod.type || "physical",
      unitPrice: prod.unitPrice.toString(),
      costPrice: prod.costPrice?.toString(),
      currency: prod.currency || "USD",
      taxable: prod.taxable ?? true,
      taxRate: prod.taxRate?.toString(),
      status: "active"
    } as any);
    createdRecords.push({ type: "product", id: result.id, name: prod.name });

    return {
      success: true,
      documentType: "product",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "product",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed contract into the system
 */
export async function importContract(
  contract: ImportedContract,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    const contractResult = await db.createContract({
      contractNumber: contract.contractNumber || `CON-${Date.now()}`,
      title: contract.title,
      type: contract.type,
      status: "draft",
      partyName: contract.partyName,
      startDate: contract.startDate ? new Date(contract.startDate) : undefined,
      endDate: contract.endDate ? new Date(contract.endDate) : undefined,
      renewalDate: contract.renewalDate ? new Date(contract.renewalDate) : undefined,
      autoRenewal: contract.autoRenewal ?? false,
      value: contract.value?.toString(),
      currency: contract.currency || "USD",
      description: contract.description,
      terms: contract.terms,
      createdBy: userId
    } as any);
    createdRecords.push({ type: "contract", id: contractResult.id, name: contract.title });

    // Create key dates if provided
    if (contract.keyDates && contract.keyDates.length > 0) {
      for (const kd of contract.keyDates) {
        await db.createContractKeyDate({
          contractId: contractResult.id,
          dateType: kd.dateType,
          date: new Date(kd.date),
          description: kd.description
        } as any);
      }
    }

    return {
      success: true,
      documentType: "contract",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "contract",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Import a parsed journal entry into the system
 */
export async function importJournalEntry(
  entry: ImportedJournalEntry,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // Validate that debits equal credits
    const totalDebits = entry.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredits = entry.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      warnings.push(`Debits ($${totalDebits.toFixed(2)}) do not equal credits ($${totalCredits.toFixed(2)})`);
    }

    const txnResult = await db.createTransaction({
      transactionNumber: entry.referenceNumber || `JE-${Date.now()}`,
      type: "journal",
      date: new Date(entry.date),
      description: entry.description,
      totalAmount: entry.totalAmount.toString(),
      currency: entry.currency || "USD",
      status: "draft",
      createdBy: userId
    } as any);
    createdRecords.push({ type: "journal_entry", id: txnResult.id, name: entry.description });

    return {
      success: true,
      documentType: "journal_entry",
      createdRecords,
      updatedRecords,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      documentType: "journal_entry",
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed"
    };
  }
}

/**
 * Process multiple documents in bulk
 */
export async function bulkImportDocuments(
  documents: { content: string; filename: string; hint?: DocumentType }[],
  userId: number,
  markPOsAsReceived: boolean = true
): Promise<{
  totalProcessed: number;
  successful: number;
  failed: number;
  results: ImportResult[];
}> {
  const results: ImportResult[] = [];
  let successful = 0;
  let failed = 0;

  for (const doc of documents) {
    const parseResult = await parseUploadedDocument(doc.content, doc.filename, doc.hint);

    if (!parseResult.success) {
      results.push({
        success: false,
        documentType: "unknown",
        createdRecords: [],
        updatedRecords: [],
        warnings: [],
        error: parseResult.error || "Failed to parse document"
      });
      failed++;
      continue;
    }

    let importResult: ImportResult;

    if (parseResult.documentType === "purchase_order" && parseResult.purchaseOrder) {
      importResult = await importPurchaseOrder(parseResult.purchaseOrder, userId, markPOsAsReceived);
    } else if (parseResult.documentType === "vendor_invoice" && parseResult.vendorInvoice) {
      importResult = await importVendorInvoice(parseResult.vendorInvoice, userId, markPOsAsReceived);
    } else if (parseResult.documentType === "freight_invoice" && parseResult.freightInvoice) {
      importResult = await importFreightInvoice(parseResult.freightInvoice, userId);
    } else if (parseResult.documentType === "customs_document" && parseResult.customsDocument) {
      importResult = await importCustomsDocument(parseResult.customsDocument, userId);
    } else if (parseResult.documentType === "sales_order" && parseResult.salesOrder) {
      importResult = await importSalesOrder(parseResult.salesOrder, userId);
    } else if (parseResult.documentType === "invoice" && parseResult.invoice) {
      importResult = await importInvoice(parseResult.invoice, userId);
    } else if (parseResult.documentType === "bill_of_materials" && parseResult.billOfMaterials) {
      importResult = await importBillOfMaterials(parseResult.billOfMaterials, userId);
    } else if (parseResult.documentType === "work_order" && parseResult.workOrder) {
      importResult = await importWorkOrder(parseResult.workOrder, userId);
    } else if (parseResult.documentType === "inventory_adjustment" && parseResult.inventoryAdjustment) {
      importResult = await importInventoryAdjustment(parseResult.inventoryAdjustment, userId);
    } else if (parseResult.documentType === "customer" && parseResult.customer) {
      importResult = await importCustomerRecord(parseResult.customer, userId);
    } else if (parseResult.documentType === "product" && parseResult.product) {
      importResult = await importProductRecord(parseResult.product, userId);
    } else if (parseResult.documentType === "contract" && parseResult.contract) {
      importResult = await importContract(parseResult.contract, userId);
    } else if (parseResult.documentType === "journal_entry" && parseResult.journalEntry) {
      importResult = await importJournalEntry(parseResult.journalEntry, userId);
    } else {
      importResult = {
        success: false,
        documentType: parseResult.documentType,
        createdRecords: [],
        updatedRecords: [],
        warnings: [],
        error: "Unknown document type"
      };
    }

    results.push(importResult);
    if (importResult.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return {
    totalProcessed: documents.length,
    successful,
    failed,
    results
  };
}

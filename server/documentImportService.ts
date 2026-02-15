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
  carrierType?: "ocean" | "air" | "ground" | "rail" | "multimodal";
  invoiceDate: string;
  shipmentDate?: string;
  deliveryDate?: string;
  origin?: string;
  destination?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  trackingNumber?: string;
  containerNumber?: string;
  vesselName?: string;
  voyageNumber?: string;
  shippingMode?: string;
  incoterms?: string;
  weight?: string;
  weightKg?: number;
  volume?: string;
  dimensions?: string;
  freightCharges: number;
  fuelSurcharge?: number;
  originCharges?: number;
  destinationCharges?: number;
  customsFees?: number;
  insuranceCost?: number;
  accessorialCharges?: number;
  totalAmount: number;
  currency?: string;
  relatedPoNumber?: string;
  hsCode?: string;
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

export interface DocumentParseResult {
  success: boolean;
  documentType: "purchase_order" | "freight_invoice" | "vendor_invoice" | "customs_document" | "unknown";
  purchaseOrder?: ImportedPurchaseOrder;
  freightInvoice?: ImportedFreightInvoice;
  vendorInvoice?: ImportedVendorInvoice;
  customsDocument?: ImportedCustomsDocument;
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
  documentHint?: "purchase_order" | "freight_invoice",
  mimeType?: string
): Promise<DocumentParseResult> {
  console.log("[DocumentImport] Starting parse for:", filename, "URL:", fileUrl, "mimeType:", mimeType);
  try {
    const prompt = `You are an expert document parser for a business ERP system. Analyze the attached document and extract structured data.

DOCUMENT FILENAME: ${filename}
DOCUMENT HINT: ${documentHint || "auto-detect"}

INSTRUCTIONS:
1. First, determine the document type:
   - Purchase Order: A document ordering goods/services FROM a vendor (has PO number, may or may not have been received)
   - Vendor Invoice: A bill/invoice from a vendor for goods/services (has invoice number, line items with prices, amount due)
   - Freight Invoice: A shipping/logistics bill specifically for transportation/freight charges
   - Customs Document: Import/export documents like Bill of Lading, Customs Entry, Commercial Invoice for customs, Packing List, Certificate of Origin, Import Permit
2. Extract all relevant structured data
3. For Purchase Orders: extract PO number, vendor info, line items with quantities/prices, dates, totals
4. For Vendor Invoices: extract invoice number, vendor info, line items with quantities/prices, due date, totals
5. For Freight Invoices: extract invoice number, carrier info (name, email, type like ocean/air/ground/rail), shipment details (origin, destination, ports of loading/discharge, tracking number, container number, vessel/voyage, shipping mode, incoterms), cargo details (weight in kg, volume, dimensions, HS code), and full charges breakdown (freight, fuel surcharge, origin/destination charges, customs fees, insurance, accessorial charges)
6. For Customs Documents: extract document number, shipper/consignee info, country of origin, port info, HS codes, duties/taxes
7. Match line item descriptions to common raw materials if possible
8. Assign a confidence score (0-100) based on extraction completeness

Return a JSON object with this structure:
{
  "documentType": "purchase_order" | "vendor_invoice" | "freight_invoice" | "customs_document" | "unknown",
  "confidence": 85,
  "purchaseOrder": {
    "poNumber": "PO-12345",
    "vendorName": "Supplier Inc",
    "vendorEmail": "supplier@example.com",
    "orderDate": "2025-01-10",
    "deliveryDate": "2025-01-20",
    "status": "received",
    "lineItems": [
      {
        "description": "Coconut Oil",
        "quantity": 1000,
        "unit": "kg",
        "unitPrice": 2.50,
        "totalPrice": 2500.00,
        "sku": "CO-001"
      }
    ],
    "subtotal": 2500.00,
    "taxAmount": 200.00,
    "shippingAmount": 150.00,
    "totalAmount": 2850.00,
    "currency": "USD",
    "notes": "Any special notes"
  },
  "vendorInvoice": {
    "invoiceNumber": "INV-12345",
    "vendorName": "Supplier Inc",
    "vendorEmail": "billing@supplier.com",
    "invoiceDate": "2025-01-15",
    "dueDate": "2025-02-15",
    "lineItems": [
      {
        "description": "Coconut Oil",
        "quantity": 1000,
        "unit": "kg",
        "unitPrice": 2.50,
        "totalPrice": 2500.00,
        "sku": "CO-001"
      }
    ],
    "subtotal": 2500.00,
    "taxAmount": 200.00,
    "shippingAmount": 150.00,
    "totalAmount": 2850.00,
    "currency": "USD",
    "relatedPoNumber": "PO-12345",
    "paymentTerms": "Net 30",
    "notes": "Any special notes"
  },
  "freightInvoice": {
    "invoiceNumber": "FI-98765",
    "carrierName": "FastFreight Logistics",
    "carrierEmail": "billing@fastfreight.com",
    "carrierType": "ocean",
    "invoiceDate": "2025-01-15",
    "shipmentDate": "2025-01-10",
    "deliveryDate": "2025-01-14",
    "origin": "Los Angeles, CA",
    "destination": "Chicago, IL",
    "portOfLoading": "Port of Los Angeles",
    "portOfDischarge": "Port of Chicago",
    "trackingNumber": "FF123456789",
    "containerNumber": "MSKU1234567",
    "vesselName": "Pacific Voyager",
    "voyageNumber": "V-2025-001",
    "shippingMode": "ocean_fcl",
    "incoterms": "FOB",
    "weight": "5000 lbs",
    "weightKg": 2268,
    "volume": "50 cbm",
    "dimensions": "48x40x48 in",
    "freightCharges": 1200.00,
    "fuelSurcharge": 180.00,
    "originCharges": 50.00,
    "destinationCharges": 75.00,
    "customsFees": 0,
    "insuranceCost": 0,
    "accessorialCharges": 75.00,
    "totalAmount": 1455.00,
    "currency": "USD",
    "relatedPoNumber": "PO-12345",
    "hsCode": "1513.11.00",
    "notes": "Liftgate delivery"
  },
  "customsDocument": {
    "documentNumber": "BOL-123456",
    "documentType": "bill_of_lading",
    "entryDate": "2025-01-15",
    "shipperName": "Foreign Supplier Co",
    "shipperCountry": "Thailand",
    "consigneeName": "Our Company Inc",
    "consigneeCountry": "USA",
    "countryOfOrigin": "Thailand",
    "portOfEntry": "Los Angeles, CA",
    "portOfExit": "Bangkok",
    "vesselName": "Pacific Voyager",
    "voyageNumber": "V-2025-001",
    "containerNumber": "MSKU1234567",
    "lineItems": [
      {
        "description": "Coconut Oil, Refined",
        "hsCode": "1513.11.00",
        "quantity": 20000,
        "unit": "kg",
        "declaredValue": 50000.00,
        "dutyRate": 0.05,
        "dutyAmount": 2500.00,
        "countryOfOrigin": "Thailand"
      }
    ],
    "totalDeclaredValue": 50000.00,
    "totalDuties": 2500.00,
    "totalTaxes": 500.00,
    "totalCharges": 3000.00,
    "currency": "USD",
    "brokerName": "ABC Customs Broker",
    "brokerReference": "BR-2025-001",
    "relatedPoNumber": "PO-12345",
    "trackingNumber": "TRK123456",
    "notes": "Temperature controlled cargo"
  }
}

Only include the relevant object based on document type.
If document type is unknown, return all as null.`;

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
    
    let response;
    response = await invokeLLM({
      messages: [
        { role: "system", content: useSimpleFormat
          ? "You are a document parsing AI. Analyze the image and extract structured data. IMPORTANT: You MUST respond with ONLY valid JSON, no other text. The JSON must have this structure: {\"documentType\": \"purchase_order\" or \"vendor_invoice\" or \"freight_invoice\" or \"customs_document\" or \"unknown\", \"confidence\": 0.0-1.0, \"purchaseOrder\": {...} or null, \"vendorInvoice\": {...} or null, \"freightInvoice\": {...} or null, \"customsDocument\": {...} or null}"
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
                documentType: { type: "string", enum: ["purchase_order", "vendor_invoice", "freight_invoice", "customs_document", "unknown"] },
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
                    carrierType: { type: "string", enum: ["ocean", "air", "ground", "rail", "multimodal"] },
                    invoiceDate: { type: "string" },
                    shipmentDate: { type: "string" },
                    deliveryDate: { type: "string" },
                    origin: { type: "string" },
                    destination: { type: "string" },
                    portOfLoading: { type: "string" },
                    portOfDischarge: { type: "string" },
                    trackingNumber: { type: "string" },
                    containerNumber: { type: "string" },
                    vesselName: { type: "string" },
                    voyageNumber: { type: "string" },
                    shippingMode: { type: "string" },
                    incoterms: { type: "string" },
                    weight: { type: "string" },
                    weightKg: { type: "number" },
                    volume: { type: "string" },
                    dimensions: { type: "string" },
                    freightCharges: { type: "number" },
                    fuelSurcharge: { type: "number" },
                    originCharges: { type: "number" },
                    destinationCharges: { type: "number" },
                    customsFees: { type: "number" },
                    insuranceCost: { type: "number" },
                    accessorialCharges: { type: "number" },
                    totalAmount: { type: "number" },
                    currency: { type: "string" },
                    relatedPoNumber: { type: "string" },
                    hsCode: { type: "string" },
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
 * Import a parsed freight invoice into the system.
 * Creates proper freight data model records: freight carrier, shipment,
 * freight booking, and invoice with freight fields populated.
 */
export async function importFreightInvoice(
  invoice: ImportedFreightInvoice,
  userId: number
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create a proper freight carrier record
    let freightCarrier = await db.getFreightCarrierByName(invoice.carrierName);
    if (!freightCarrier) {
      const carrierType = invoice.carrierType || inferCarrierType(invoice);
      const carrierResult = await db.createFreightCarrier({
        name: invoice.carrierName,
        type: carrierType,
        email: invoice.carrierEmail || null,
        isActive: true,
      });
      freightCarrier = await db.getFreightCarrierById(carrierResult.id);
      createdRecords.push({ type: "freight_carrier", id: carrierResult.id, name: invoice.carrierName });
    }

    // 2. Also find or create carrier as a vendor for financial tracking
    let carrierVendor = await db.getVendorByName(invoice.carrierName);
    if (!carrierVendor) {
      const vendorResult = await db.createVendor({
        name: invoice.carrierName,
        email: invoice.carrierEmail || "",
        type: "service",
        status: "active"
      });
      carrierVendor = await db.getVendorById(vendorResult.id) || null;
      createdRecords.push({ type: "vendor", id: vendorResult.id, name: invoice.carrierName });
    }

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

    // 4. Create a shipment record with structured freight data
    const shipmentStatus = invoice.deliveryDate ? "delivered" : (invoice.shipmentDate ? "in_transit" : "pending");
    const shipmentResult = await db.createShipment({
      shipmentNumber: `FRT-${invoice.invoiceNumber}`,
      type: "inbound",
      purchaseOrderId: relatedPoId || null,
      carrier: invoice.carrierName,
      trackingNumber: invoice.trackingNumber || null,
      status: shipmentStatus,
      shipDate: invoice.shipmentDate ? new Date(invoice.shipmentDate) : null,
      deliveryDate: invoice.deliveryDate ? new Date(invoice.deliveryDate) : null,
      fromAddress: invoice.origin || null,
      toAddress: invoice.destination || null,
      weight: invoice.weightKg ? invoice.weightKg.toString() : null,
      cost: invoice.totalAmount.toString(),
      notes: [
        invoice.containerNumber ? `Container: ${invoice.containerNumber}` : null,
        invoice.vesselName ? `Vessel: ${invoice.vesselName}` : null,
        invoice.voyageNumber ? `Voyage: ${invoice.voyageNumber}` : null,
        invoice.notes,
      ].filter(Boolean).join(". ") || null,
    });
    createdRecords.push({ type: "shipment", id: shipmentResult.id, name: `FRT-${invoice.invoiceNumber}` });

    // 5. Create a freight booking record with structured fields
    const bookingResult = await db.createFreightBooking({
      quoteId: 0, // No quote for imported invoices
      rfqId: 0,   // No RFQ for imported invoices
      carrierId: freightCarrier!.id,
      status: shipmentStatus === "delivered" ? "delivered" : (shipmentStatus === "in_transit" ? "in_transit" : "confirmed"),
      trackingNumber: invoice.trackingNumber || null,
      containerNumber: invoice.containerNumber || null,
      vesselName: invoice.vesselName || null,
      voyageNumber: invoice.voyageNumber || null,
      bookingDate: new Date(invoice.invoiceDate),
      pickupDate: invoice.shipmentDate ? new Date(invoice.shipmentDate) : null,
      deliveryDate: invoice.deliveryDate ? new Date(invoice.deliveryDate) : null,
      agreedCost: invoice.totalAmount.toString(),
      actualCost: invoice.totalAmount.toString(),
      currency: invoice.currency || "USD",
      notes: [
        `Imported from freight invoice ${invoice.invoiceNumber}`,
        invoice.origin ? `Origin: ${invoice.origin}` : null,
        invoice.destination ? `Destination: ${invoice.destination}` : null,
        invoice.shippingMode ? `Mode: ${invoice.shippingMode}` : null,
        invoice.incoterms ? `Incoterms: ${invoice.incoterms}` : null,
        invoice.notes,
      ].filter(Boolean).join(". "),
    } as any);
    createdRecords.push({ type: "freight_booking", id: bookingResult.id, name: bookingResult.bookingNumber });

    // 6. Create an invoice record with freight fields populated
    const invoiceResult = await db.createInvoice({
      invoiceNumber: invoice.invoiceNumber,
      type: "invoice",
      status: "sent",
      issueDate: new Date(invoice.invoiceDate),
      subtotal: invoice.freightCharges.toString(),
      taxAmount: "0",
      totalAmount: invoice.totalAmount.toString(),
      currency: invoice.currency || "USD",
      incoterms: invoice.incoterms || null,
      portOfLoading: invoice.portOfLoading || null,
      portOfDischarge: invoice.portOfDischarge || null,
      freightAmount: invoice.freightCharges.toString(),
      insuranceAmount: (invoice.insuranceCost || 0).toString(),
      customsDuties: (invoice.customsFees || 0).toString(),
      purchaseOrderNumber: invoice.relatedPoNumber || null,
      shippingInstructions: invoice.notes || null,
      notes: `Freight invoice from ${invoice.carrierName}. ${invoice.shippingMode ? `Shipping mode: ${invoice.shippingMode}.` : ""} ${invoice.weight ? `Weight: ${invoice.weight}.` : ""}`.trim(),
      createdBy: userId,
    } as any);
    createdRecords.push({ type: "invoice", id: invoiceResult.id, name: invoice.invoiceNumber });

    // 7. Create invoice line items for the charges breakdown
    const chargeItems: { description: string; amount: number }[] = [
      { description: "Freight charges", amount: invoice.freightCharges },
    ];
    if (invoice.fuelSurcharge) chargeItems.push({ description: "Fuel surcharge", amount: invoice.fuelSurcharge });
    if (invoice.originCharges) chargeItems.push({ description: "Origin charges", amount: invoice.originCharges });
    if (invoice.destinationCharges) chargeItems.push({ description: "Destination charges", amount: invoice.destinationCharges });
    if (invoice.customsFees) chargeItems.push({ description: "Customs fees", amount: invoice.customsFees });
    if (invoice.insuranceCost) chargeItems.push({ description: "Insurance", amount: invoice.insuranceCost });
    if (invoice.accessorialCharges) chargeItems.push({ description: "Accessorial charges", amount: invoice.accessorialCharges });

    for (const item of chargeItems) {
      await db.createInvoiceItem({
        invoiceId: invoiceResult.id,
        description: item.description,
        quantity: "1",
        unitPrice: item.amount.toString(),
        amount: item.amount.toString(),
        hsCode: invoice.hsCode || null,
      } as any);
    }

    // 8. If related to a PO, update the PO with freight cost
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
 * Infer carrier type from invoice data when not explicitly provided
 */
function inferCarrierType(invoice: ImportedFreightInvoice): "ocean" | "air" | "ground" | "rail" | "multimodal" {
  const text = [
    invoice.shippingMode,
    invoice.notes,
    invoice.carrierName,
    invoice.vesselName,
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.match(/ocean|sea|fcl|lcl|container|vessel|port|maritime|ship/)) return "ocean";
  if (text.match(/air|flight|airway|express|airline/)) return "air";
  if (text.match(/rail|train|intermodal/)) return "rail";
  if (text.match(/truck|ground|road|ltl|ftl|drayage/)) return "ground";
  if (invoice.containerNumber || invoice.vesselName) return "ocean";
  return "ground"; // Default to ground as most common
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
 * Process multiple documents in bulk
 */
export async function bulkImportDocuments(
  documents: { content: string; filename: string; hint?: "purchase_order" | "vendor_invoice" | "freight_invoice" | "customs_document" }[],
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

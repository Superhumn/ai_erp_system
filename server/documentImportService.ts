import { invokeLLM, type TextContent } from "./_core/llm";
import * as db from "./db";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { fromBuffer } from "pdf2pic";
import { randomBytes } from "crypto";
import * as XLSX from "xlsx";
import { assertFetchableAttachmentUrl, fetchAttachment } from "./attachmentUrl";
import { parseLlmJson } from "./llmJson";

// PDF.js will be imported dynamically in the function to avoid worker issues

// Configuration constants
const MIN_TEXT_LENGTH_FOR_SCANNED_DETECTION = 100; // Minimum text length to consider PDF as text-based
const MAX_SCANNED_PDF_PAGES = 10; // Maximum pages to OCR for scanned PDFs (balances cost vs completeness)

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
 * Turn a file URL into LLM message content, transparently handling images
 * (base64 data URL), text PDFs (pdfjs text extraction) and scanned PDFs
 * (pdf2pic + vision OCR), and plain text/CSV/Excel exports.
 *
 * Shared by every document-parsing entry point — `parseUploadedDocument` and
 * the vendor-quote attachment parser — so all of them get the same OCR
 * fallback and the same size caps.
 */
// A flat shape rather than a discriminated union: this project compiles with
// `strictNullChecks: false`, under which TypeScript will not narrow a union on a
// boolean literal discriminant.
export interface DocumentMessageContent {
  ok: boolean;
  content: any[];
  hasImageContent: boolean;
  isPdf: boolean;
  error?: string;
}

const EMPTY_MESSAGE_CONTENT = { content: [] as any[], hasImageContent: false, isPdf: false };

let pdfRasterizerChecked: string | null | undefined;

/**
 * Scanned-PDF OCR renders pages with GraphicsMagick + Ghostscript. Check once
 * that `gm` is on PATH so a missing package surfaces as a clear message
 * instead of a cryptic spawn error deep inside pdf2pic.
 */
export function assertPdfRasterizerAvailable(): void {
  if (pdfRasterizerChecked === undefined) {
    try {
      pdfRasterizerChecked = execSync("gm version", { stdio: ["ignore", "pipe", "ignore"] })
        .toString("utf8")
        .split("\n")[0]
        .trim();
    } catch {
      pdfRasterizerChecked = null;
    }
  }
  if (pdfRasterizerChecked === null) {
    throw new Error(
      "Scanned-PDF OCR needs GraphicsMagick and Ghostscript on the server (apk add graphicsmagick ghostscript / apt install graphicsmagick ghostscript). " +
        "The PDF has no extractable text, so it cannot be parsed without them.",
    );
  }
}

/** Test hook: forget the cached rasterizer probe. */
export function resetPdfRasterizerCheck(): void {
  pdfRasterizerChecked = undefined;
}

/**
 * Render every sheet of an Excel workbook as CSV text so the LLM can read it.
 * Excel files are zipped XML: handing the raw bytes to the text branch below
 * produced binary garbage and a guaranteed "unknown" parse.
 */
export function spreadsheetBufferToText(buffer: Buffer | Uint8Array): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames
    .map((name) => `SHEET: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`)
    .join("\n\n");
}

export async function buildDocumentMessageContent(
  fileUrl: string,
  filename: string,
  prompt: string,
  mimeType?: string,
): Promise<DocumentMessageContent> {
  try {
    // Every branch below fetches this URL server-side, so it is validated once
    // here rather than in each caller: a client-supplied URL must be a data:
    // URL or point at our own object storage. See server/attachmentUrl.ts.
    try {
      assertFetchableAttachmentUrl(fileUrl);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Attachment URL rejected.";
      console.warn("[DocumentImport] Rejected attachment URL:", message);
      return { ok: false, ...EMPTY_MESSAGE_CONTENT, error: message };
    }

    // Determine file type. The extension is the primary signal; the caller's
    // MIME type is a fallback for files uploaded without a usable extension.
    const mime = (mimeType || "").toLowerCase();
    const isImage = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i) || mime.startsWith("image/");
    const isPdf = filename.toLowerCase().endsWith('.pdf') || mime === "application/pdf";
    const isSpreadsheet = !isImage && !isPdf && (
      /\.(xlsx|xlsm|xls)$/i.test(filename) || /spreadsheetml|ms-excel/.test(mime)
    );

    // Build the message content
    let messageContent: any[];

    if (isSpreadsheet) {
      try {
        console.log("[DocumentImport] Reading spreadsheet from URL:", fileUrl);
        const { buffer } = await fetchAttachment(fileUrl, { kind: 'spreadsheet' });
        const text = spreadsheetBufferToText(buffer);
        console.log("[DocumentImport] Spreadsheet text length:", text.length);
        messageContent = [
          { type: "text", text: `${prompt}\n\nDOCUMENT CONTENT:\n${text.substring(0, 50000)}` }
        ];
      } catch (sheetError) {
        console.error("[DocumentImport] Failed to read spreadsheet:", sheetError);
        return { ok: false, ...EMPTY_MESSAGE_CONTENT, error: "Failed to read spreadsheet content" };
      }
    } else if (isImage) {
      // For images, download and convert to base64 data URL
      try {
        console.log("[DocumentImport] Downloading image from:", fileUrl);
        const { buffer } = await fetchAttachment(fileUrl, { kind: 'image' });
        const base64 = buffer.toString('base64');
        const ext = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i)?.[1] || 'png';
        const mimeTypeMap: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp'
        };
        const imageMimeType = mimeTypeMap[ext] || (mime.startsWith("image/") ? mime : 'image/png');
        const dataUrl = `data:${imageMimeType};base64,${base64}`;
        console.log("[DocumentImport] Converted image to base64 data URL, length:", dataUrl.length);
        messageContent = [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
        ];
      } catch (fetchError) {
        console.error("[DocumentImport] Failed to fetch/convert image:", fetchError);
        return { ok: false, ...EMPTY_MESSAGE_CONTENT, error: "Failed to process image file" };
      }
    } else if (isPdf) {
      // For PDFs, first try text extraction, then fall back to OCR for scanned PDFs
      console.log("[DocumentImport] Extracting text from PDF using pdfjs-dist");
      try {
        // Download the PDF
        const { buffer: pdfBuffer } = await fetchAttachment(fileUrl, { kind: 'PDF' });
        const uint8Array = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
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

          const pagesToProcess = Math.min(pdf.numPages, MAX_SCANNED_PDF_PAGES);
          if (pdf.numPages > MAX_SCANNED_PDF_PAGES) {
            console.warn(`[DocumentImport] PDF has ${pdf.numPages} pages, capping OCR at first ${MAX_SCANNED_PDF_PAGES} pages.`);
          }
          console.log(`[DocumentImport] Processing ${pagesToProcess} page(s) for OCR`);

          // Create buffer for pdf2pic (only needed for scanned PDFs)
          const buffer = pdfBuffer;

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
            assertPdfRasterizerAvailable();
            // pdf2pic drives GraphicsMagick (`gm`), which renders PDF pages via
            // Ghostscript. Both are installed in the production image; see
            // Dockerfile. GraphicsMagick is used rather than ImageMagick because
            // distro ImageMagick builds ship a policy.xml that refuses PDFs.
            const convert = fromBuffer(buffer, options);

            // Convert all pages to base64 for vision OCR
            const imageContents: any[] = [];
            for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
              const pageResult = await convert(pageNum, { responseType: "base64" });
              if (!pageResult || !pageResult.base64) {
                console.warn(`[DocumentImport] Failed to convert page ${pageNum}, skipping`);
                continue;
              }
              const dataUrl = `data:image/png;base64,${pageResult.base64}`;
              imageContents.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
            }

            if (imageContents.length === 0) {
              throw new Error("PDF to image conversion failed for all pages");
            }

            console.log(`[DocumentImport] Converted ${imageContents.length} page(s) to images, using vision OCR`);

            // Use vision-based OCR with all pages
            messageContent = [
              { type: "text", text: prompt },
              ...imageContents
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
        return { ok: false, ...EMPTY_MESSAGE_CONTENT, error: `Failed to process PDF: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}` };
      }
    } else {
      // For CSV/Excel/text files, download and extract text content
      try {
        console.log("[DocumentImport] Fetching document content from URL:", fileUrl);
        const { buffer } = await fetchAttachment(fileUrl, { kind: 'document' });
        const textContent = buffer.toString('utf8');
        console.log("[DocumentImport] Extracted text content length:", textContent.length);
        messageContent = [
          { type: "text", text: `${prompt}\n\nDOCUMENT CONTENT:\n${textContent.substring(0, 50000)}` }
        ];
      } catch (fetchError) {
        console.error("[DocumentImport] Failed to fetch document:", fetchError);
        return { ok: false, ...EMPTY_MESSAGE_CONTENT, error: "Failed to read document content" };
      }
    }
    
    return {
      ok: true,
      content: messageContent,
      hasImageContent: messageContent.some((m: any) => m.type === "image_url"),
      isPdf: !!isPdf,
    };
  } catch (error) {
    console.error("[DocumentImport] Failed to build message content:", error);
    return { ok: false, ...EMPTY_MESSAGE_CONTENT, error: error instanceof Error ? error.message : "Failed to read document" };
  }
}

const DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  "purchase_order", "freight_invoice", "vendor_invoice", "customs_document", "unknown",
]);

// Keys the parser must hand back as numbers. The json_schema response_format is
// only a hint, so the model can (and does) emit "1,200.00" or null for these.
const NUMERIC_KEYS: ReadonlySet<string> = new Set([
  "quantity", "unitPrice", "totalPrice", "subtotal", "taxAmount", "shippingAmount",
  "totalAmount", "freightCharges", "fuelSurcharge", "accessorialCharges", "declaredValue",
  "dutyRate", "dutyAmount", "totalDeclaredValue", "totalDuties", "totalTaxes", "totalCharges",
  "confidence",
]);

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.+-]/g, "");
    if (!/\d/.test(cleaned)) return undefined; // "N/A", "", "-" carry no number
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Recursively drop nulls (so `?.`/`??`/zod optional all behave) and coerce numeric keys. */
function cleanParsedValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => cleanParsedValue(v)).filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = cleanParsedValue(v, k);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  if (key && NUMERIC_KEYS.has(key)) return toFiniteNumber(value);
  return value;
}

/**
 * Shape whatever JSON the model returned into a `DocumentParseResult` the
 * importers can trust: known document type, no nulls, numeric fields that are
 * real finite numbers (never NaN / "1,200"), line items always an array, and
 * the top-level confidence copied onto the document (the response schema puts
 * it at the top level; the importers read it off the document).
 *
 * Pure so it can be unit-tested without an LLM.
 */
export function normalizeParsedDocument(parsed: unknown): DocumentParseResult {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { success: false, documentType: "unknown", error: "AI response was not a JSON object" };
  }
  const raw = cleanParsedValue(parsed) as Record<string, any>;
  const documentType = (DOCUMENT_TYPES.has(raw.documentType) ? raw.documentType : "unknown") as DocumentParseResult["documentType"];
  const topConfidence = typeof raw.confidence === "number" ? raw.confidence : undefined;
  const num = (v: unknown, fallback = 0): number => (typeof v === "number" ? v : fallback);
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : v == null ? undefined : String(v));

  const goodsLines = (doc: Record<string, any>): ImportedLineItem[] =>
    (Array.isArray(doc.lineItems) ? doc.lineItems : [])
      .filter((li: unknown) => li && typeof li === "object")
      .map((li: Record<string, any>) => {
        const quantity = num(li.quantity);
        const unitPrice = num(li.unitPrice);
        return {
          ...li,
          description: str(li.description) ?? "",
          quantity,
          unitPrice,
          totalPrice: num(li.totalPrice, Math.round(quantity * unitPrice * 100) / 100),
        } as ImportedLineItem;
      });

  const withConfidence = <T extends { confidence?: number }>(doc: T): T => ({
    ...doc,
    confidence: typeof doc.confidence === "number" ? doc.confidence : topConfidence,
  });

  const result: DocumentParseResult = { success: true, documentType };

  if (raw.purchaseOrder && typeof raw.purchaseOrder === "object") {
    const po = raw.purchaseOrder;
    const totalAmount = num(po.totalAmount);
    result.purchaseOrder = withConfidence({
      ...po,
      lineItems: goodsLines(po),
      totalAmount,
      subtotal: num(po.subtotal, totalAmount),
    }) as ImportedPurchaseOrder;
  }
  if (raw.vendorInvoice && typeof raw.vendorInvoice === "object") {
    const inv = raw.vendorInvoice;
    const totalAmount = num(inv.totalAmount);
    result.vendorInvoice = withConfidence({
      ...inv,
      lineItems: goodsLines(inv),
      totalAmount,
      subtotal: num(inv.subtotal, totalAmount),
    }) as ImportedVendorInvoice;
  }
  if (raw.freightInvoice && typeof raw.freightInvoice === "object") {
    const fr = raw.freightInvoice;
    const totalAmount = num(fr.totalAmount);
    result.freightInvoice = withConfidence({
      ...fr,
      totalAmount,
      freightCharges: num(fr.freightCharges, totalAmount),
    }) as ImportedFreightInvoice;
  }
  if (raw.customsDocument && typeof raw.customsDocument === "object") {
    const cd = raw.customsDocument;
    const totalDeclaredValue = num(cd.totalDeclaredValue);
    const lineItems = (Array.isArray(cd.lineItems) ? cd.lineItems : [])
      .filter((li: unknown) => li && typeof li === "object")
      .map((li: Record<string, any>) => ({
        ...li,
        description: str(li.description) ?? "",
        quantity: num(li.quantity),
        declaredValue: num(li.declaredValue),
      }));
    result.customsDocument = withConfidence({
      ...cd,
      lineItems,
      totalDeclaredValue,
      totalCharges: num(cd.totalCharges, totalDeclaredValue),
    }) as ImportedCustomsDocument;
  }
  return result;
}

/** Parse a document date string; undefined when it is missing or unreadable. */
export function parseDocumentDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** ISO-4217 codes are exactly three letters; the columns are varchar(3). */
export function normalizeCurrency(value: unknown, fallback = "USD"): string {
  if (typeof value !== "string") return fallback;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
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
5. For Freight Invoices: extract invoice number, carrier info, shipment details, charges breakdown
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
    "invoiceDate": "2025-01-15",
    "shipmentDate": "2025-01-10",
    "deliveryDate": "2025-01-14",
    "origin": "Los Angeles, CA",
    "destination": "Chicago, IL",
    "trackingNumber": "FF123456789",
    "weight": "5000 lbs",
    "dimensions": "48x40x48 in",
    "freightCharges": 1200.00,
    "fuelSurcharge": 180.00,
    "accessorialCharges": 75.00,
    "totalAmount": 1455.00,
    "currency": "USD",
    "relatedPoNumber": "PO-12345",
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

    const built = await buildDocumentMessageContent(fileUrl, filename, prompt, mimeType);
    if (!built.ok) {
      return { success: false, documentType: "unknown", error: built.error };
    }
    const messageContent = built.content;
    const isImage = !built.isPdf && built.hasImageContent;
    const isPdf = built.isPdf;

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
    
    // Tolerant JSON recovery (fences, leading prose) — response_format is only
    // a hint, so never bare JSON.parse. See server/llmJson.ts.
    const parsed = parseLlmJson(contentText);
    if (parsed === null) {
      console.error("[DocumentImport] AI response was not JSON:", contentText.substring(0, 300));
      return { success: false, documentType: "unknown", error: "AI response was not valid JSON" };
    }
    console.log("[DocumentImport] Parsed result:", JSON.stringify(parsed, null, 2).substring(0, 1000));

    const normalized = normalizeParsedDocument(parsed);
    if (!normalized.success) return normalized;
    return reclassifyFreightDocument({
      ...normalized,
      // Never echo a data: URL (megabytes of base64) back to the client.
      rawText: `Document parsed from: ${/^data:/i.test(fileUrl) ? filename : fileUrl}`,
    });
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
/**
 * Line items on imported documents that must NOT be promoted into the raw-materials
 * catalog: freight/logistics charges, taxes & fees, and SaaS/usage/subscription
 * billing. Vendor invoices and POs routinely include these alongside (or instead of)
 * physical goods, and auto-creating a "material" for each was polluting the materials
 * list with entries like "OCEAN FREIGHT...", "Build Minutes", and "Max plan".
 *
 * Conservative by design: only skips line items that clearly match a non-material
 * signal, so genuine goods are still catalogued.
 */
const NON_MATERIAL_DESCRIPTION_PATTERNS: RegExp[] = [
  // Freight / logistics services
  /\bfreight\b/i, /\bshipping\b/i, /\bcourier\b/i, /\bdrayage\b/i, /\bdemurrage\b/i,
  /\bdetention\b/i, /\bhandling\b/i, /\blogistics\b/i, /\bport\b/i, /\bvessel\b/i,
  /\bcustoms\b/i, /\bbroker(age)?\b/i, /\bclearance\b/i,
  // Taxes / fees / surcharges
  /\bdut(y|ies)\b/i, /\btariff\b/i, /\b(vat|gst)\b/i, /\bsales tax\b/i,
  /\bsurcharge\b/i, /\bfuel\b/i, /\bservice fee\b/i, /\bprocessing fee\b/i,
  // SaaS / usage / subscription billing
  /\bsubscription\b/i, /\bseat[s]?\b/i, /\blicen[sc]e\b/i, /\busage\b/i,
  /\bcredit[s]?\s+purchase\b/i, /\bper\s+(gb|mb|kb|tb|min|minute|hour|hr)\b/i,
  /\b(api\s+calls?|compute|hosting|bandwidth|build\s+minutes?)\b/i,
  /\b(hobby|pro|max|team|enterprise|starter|business)\s+plan\b/i,
  // Billing-period suffix, e.g. "Apr 1 - Apr 30, 2026" — a SaaS metering signal,
  // not something a physical material name carries.
  /\b[A-Za-z]{3,9}\s+\d{1,2}\s*[-–]\s*[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}\b/,
];

const NON_MATERIAL_UNITS = new Set([
  "min", "mins", "minute", "minutes", "hr", "hour", "hours",
  "gb", "mb", "kb", "tb", "seat", "seats", "license", "licenses",
  "month", "months", "mo", "subscription",
]);

/**
 * Returns true when an imported line item is a service/charge/billing line rather
 * than a physical material, so callers can skip creating a raw-material record for it.
 * The underlying invoice/PO line is still recorded — only the materials-catalog
 * pollution is prevented.
 */
export function isNonMaterialLineItem(item: { description?: string | null; unit?: string | null }): boolean {
  const description = (item.description ?? "").trim();
  // No usable description → don't fabricate a material from it.
  if (!description) return true;
  if (NON_MATERIAL_DESCRIPTION_PATTERNS.some((re) => re.test(description))) return true;
  const unit = (item.unit ?? "").trim().toLowerCase();
  if (unit && NON_MATERIAL_UNITS.has(unit)) return true;
  return false;
}

/**
 * Strong freight/logistics signals (on a line-item description or a vendor name).
 * Used to recognise freight bills that the AI parser mislabels as vendor invoices
 * or purchase orders.
 */
const FREIGHT_SIGNAL_PATTERNS: RegExp[] = [
  /\bfreight\b/i, /\bocean\s*freight\b/i, /\bair\s*freight\b/i, /\bsea\s*freight\b/i,
  /\bshipping\b/i, /\bdrayage\b/i, /\bdemurrage\b/i, /\bdetention\b/i,
  /\bhaulage\b/i, /\bcartage\b/i, /\bforward(?:er|ing)\b/i, /\blogistics\b/i,
  /\bbill\s*of\s*lading\b/i, /\bcontainer\b/i, /\bport\b/i, /\bterminal handling\b/i,
  /\bthc\b/i, /\bbaf\b/i, /\bcustoms\b/i, /\bbroker(?:age)?\b/i,
  /\b(fcl|lcl|cfs)\b/i, /\bvessel\b/i, /\bvoyage\b/i,
];
const hasFreightSignal = (text: string | null | undefined) =>
  FREIGHT_SIGNAL_PATTERNS.some((re) => re.test(text ?? ""));

/**
 * Decide whether a parsed vendor-invoice / purchase-order is really a freight bill.
 * True when the vendor is clearly a carrier/forwarder, or freight charges make up at
 * least half the line items. Conservative so ordinary goods invoices (which may carry
 * a single "shipping" line) are not reclassified.
 */
export function looksLikeFreightInvoice(
  vendorName: string | null | undefined,
  lineItems: Array<{ description?: string | null }>,
): boolean {
  if (hasFreightSignal(vendorName)) return true;
  if (!lineItems.length) return false;
  const freightLines = lineItems.filter((li) => hasFreightSignal(li.description)).length;
  return freightLines / lineItems.length >= 0.5;
}

function toFreightInvoice(src: ImportedVendorInvoice | ImportedPurchaseOrder): ImportedFreightInvoice {
  const isInvoice = "invoiceNumber" in src;
  const charges = src.lineItems.map((li) => li.description).filter(Boolean).join("; ");
  return {
    invoiceNumber: isInvoice ? (src as ImportedVendorInvoice).invoiceNumber : (src as ImportedPurchaseOrder).poNumber,
    carrierName: src.vendorName,
    carrierEmail: src.vendorEmail,
    invoiceDate: isInvoice ? (src as ImportedVendorInvoice).invoiceDate : (src as ImportedPurchaseOrder).orderDate,
    deliveryDate: "deliveryDate" in src ? (src as ImportedPurchaseOrder).deliveryDate : undefined,
    freightCharges: src.subtotal ?? src.totalAmount,
    totalAmount: src.totalAmount,
    currency: src.currency,
    relatedPoNumber: isInvoice ? (src as ImportedVendorInvoice).relatedPoNumber : (src as ImportedPurchaseOrder).poNumber,
    notes: [src.notes, charges && `Charges: ${charges}`].filter(Boolean).join(" | ") || undefined,
    confidence: src.confidence,
  };
}

/**
 * Deterministic safety net for parse results: freight/logistics bills are routinely
 * misclassified as vendor invoices or POs, which sends them through the materials-
 * creating import path instead of the freight path. Reclassify clear freight bills to
 * `freight_invoice` so the existing routing imports them via importFreightInvoice
 * (freight-history record, no materials).
 */
export function reclassifyFreightDocument(result: DocumentParseResult): DocumentParseResult {
  if (!result.success) return result;
  if (result.documentType === "vendor_invoice" && result.vendorInvoice
      && looksLikeFreightInvoice(result.vendorInvoice.vendorName, result.vendorInvoice.lineItems)) {
    return { ...result, documentType: "freight_invoice", freightInvoice: toFreightInvoice(result.vendorInvoice), vendorInvoice: undefined };
  }
  if (result.documentType === "purchase_order" && result.purchaseOrder
      && looksLikeFreightInvoice(result.purchaseOrder.vendorName, result.purchaseOrder.lineItems)) {
    return { ...result, documentType: "freight_invoice", freightInvoice: toFreightInvoice(result.purchaseOrder), purchaseOrder: undefined };
  }
  return result;
}

export async function matchLineItemsToMaterials(
  lineItems: ImportedLineItem[]
): Promise<ImportedLineItem[]> {
  const rawMaterials = await db.getRawMaterials();

  return lineItems.map(item => {
    // Try to match by description or SKU. A blank/too-short description must
    // not match: `"Anything".includes("")` is true, so an empty line used to be
    // matched to the first material in the catalog and receive its quantity.
    const desc = (item.description ?? "").trim().toLowerCase();
    const sku = (item.sku ?? "").trim().toLowerCase();
    const match = rawMaterials.find(rm => {
      const rmName = (rm.name ?? "").toLowerCase();
      const descMatch = desc.length >= 3 && rmName.length >= 3 &&
        (rmName.includes(desc) || desc.includes(rmName));
      const skuMatch = !!sku && !!rm.sku && rm.sku.toLowerCase() === sku;
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
/**
 * Options shared by the per-type importers. `companyId` is the importing
 * user's entity: every row written carries it so entity-scoped readers
 * (vendors/POs/materials lists) can see what was imported.
 */
export interface ImportOptions {
  companyId?: number;
  /** PO / vendor invoice: also add received quantities to the raw materials (default true). */
  updateInventory?: boolean;
  /** Freight / customs: attach the document to the related PO it names (default true). */
  linkToPO?: boolean;
}

export async function importPurchaseOrder(
  po: ImportedPurchaseOrder,
  userId: number,
  markAsReceived: boolean = true,
  createMissingVendor: boolean = false,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];
  const companyId = options.companyId ?? undefined;
  const updateInventory = options.updateInventory ?? true;

  try {
    // 0. Validate before any write: nothing below is transactional, so a bad
    // document must be rejected up front rather than after the vendor and the
    // materials have already been created.
    const fail = (error: string): ImportResult =>
      ({ success: false, documentType: "purchase_order", createdRecords, updatedRecords, warnings, error });
    const vendorName = (po.vendorName ?? "").trim();
    // An empty name would LIKE-match every vendor (getVendorByName uses '%name%').
    if (!vendorName) return fail("The document has no vendor name. Fill it in before importing.");
    if (!(po.poNumber ?? "").trim()) return fail("The document has no PO number. Fill it in before importing.");
    const orderDate = parseDocumentDate(po.orderDate);
    if (!orderDate) return fail(`Order date "${po.orderDate ?? ""}" is not a valid date. Fix it before importing.`);
    const expectedDate = parseDocumentDate(po.deliveryDate);
    if (po.deliveryDate && !expectedDate) {
      warnings.push(`Delivery date "${po.deliveryDate}" was not a valid date and was left blank.`);
    }

    // 1. Find vendor; only create if caller opted in
    let vendor = await db.getVendorByName(vendorName);
    if (!vendor) {
      if (!createMissingVendor) {
        return fail(`Vendor "${vendorName}" was not found. Enable "Add vendor if missing" to create it, or add the vendor first.`);
      }
      const vendorResult = await db.createVendor({
        companyId,
        name: vendorName,
        email: po.vendorEmail || "",
        type: "supplier",
        status: "active"
      });
      vendor = await db.getVendorById(vendorResult.id) || null;
      createdRecords.push({ type: "vendor", id: vendorResult.id, name: po.vendorName });
    }

    // 2. Bail out before anything is written if this document has already been
    // imported. This has to run ahead of the material matching below: that step
    // creates rawMaterials rows, so a guard placed after it would skip the
    // duplicate PO but still leave new materials behind on every re-import.
    const existingPo = await db.findPurchaseOrderByNumberExact(po.poNumber, vendor!.id);
    if (existingPo) {
      warnings.push(
        `PO ${po.poNumber} was already imported (#${existingPo.id}) — skipped to avoid a duplicate.`
      );
      return {
        success: true,
        documentType: "purchase_order",
        createdRecords,
        updatedRecords,
        warnings,
      };
    }

    // 3. Match line items to raw materials
    const matchedItems = await matchLineItemsToMaterials(po.lineItems);

    // 3b. Create raw materials for unmatched items (skip services/charges/SaaS lines)
    for (const item of matchedItems) {
      if (!item.rawMaterialId) {
        if (isNonMaterialLineItem(item)) {
          warnings.push(`Skipped non-material line item "${item.description}" — recorded on the order but not added to materials.`);
          continue;
        }
        const materialResult = await db.createRawMaterial({
          companyId,
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

    // 4. Create the purchase order.
    //
    // Atomic rather than a bare insert: the step-2 guard reads and this writes,
    // so two concurrent imports of the same document could both pass the guard
    // and both insert. createPurchaseOrderIfAbsent re-checks under a row lock.
    const poOutcome = await db.createPurchaseOrderIfAbsent({
      companyId,
      poNumber: po.poNumber,
      vendorId: vendor!.id,
      status: markAsReceived ? "received" : "confirmed",
      orderDate,
      expectedDate,
      subtotal: po.subtotal.toString(),
      totalAmount: po.totalAmount.toString(),
      currency: normalizeCurrency(po.currency),
      notes: po.notes || undefined,
      createdBy: userId
    });
    if (!poOutcome.created) {
      // Lost the race with a concurrent import of the same document. Stop
      // before the line items and the step-6 receiving update, which are what
      // would actually double-count stock.
      warnings.push(
        `PO ${po.poNumber} was created by a concurrent import (#${poOutcome.id}) — skipped to avoid a duplicate.`
      );
      return { success: true, documentType: "purchase_order", createdRecords, updatedRecords, warnings };
    }
    const poResult = { id: poOutcome.id };
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

    // 6. If marking as received, update inventory (unless the caller opted out
    // with updateInventory=false — the "Update inventory" checkbox on the page).
    if (markAsReceived && updateInventory) {
      // Batch load all raw materials instead of N+1
      const rmIds = matchedItems.map(i => i.rawMaterialId).filter((id): id is number => id != null);
      const materialsToUpdate = rmIds.length > 0 ? await db.getRawMaterialsByIds(rmIds) : [];
      const materialMap = new Map(materialsToUpdate.filter(Boolean).map(m => [m!.id, m!]));

      for (const item of matchedItems) {
        if (item.rawMaterialId) {
          const material = materialMap.get(item.rawMaterialId);
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
    } else if (markAsReceived) {
      warnings.push("Inventory was not updated (Update inventory is off).");
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
  userId: number,
  createMissingVendor: boolean = false,
  receiveInventory: boolean = false,
  warehouseId?: number,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];
  const companyId = options.companyId ?? undefined;
  const linkToPO = options.linkToPO ?? true;

  try {
    // 0. Validate before any write (see importPurchaseOrder).
    const fail = (error: string): ImportResult =>
      ({ success: false, documentType: "freight_invoice", createdRecords, updatedRecords, warnings, error });
    const carrierName = (invoice.carrierName ?? "").trim();
    if (!carrierName) return fail("The invoice has no carrier name. Fill it in before importing.");
    if (!(invoice.invoiceNumber ?? "").trim()) return fail("The invoice has no invoice number. Fill it in before importing.");
    const invoiceDate = parseDocumentDate(invoice.invoiceDate);
    if (!invoiceDate) return fail(`Invoice date "${invoice.invoiceDate ?? ""}" is not a valid date. Fix it before importing.`);
    const shipmentDate = parseDocumentDate(invoice.shipmentDate);
    const deliveryDate = parseDocumentDate(invoice.deliveryDate);
    if (invoice.shipmentDate && !shipmentDate) warnings.push(`Shipment date "${invoice.shipmentDate}" was not a valid date and was left blank.`);
    if (invoice.deliveryDate && !deliveryDate) warnings.push(`Delivery date "${invoice.deliveryDate}" was not a valid date and was left blank.`);

    // 1. Find carrier as vendor; only create if caller opted in
    let carrier = await db.getVendorByName(carrierName);
    if (!carrier) {
      if (!createMissingVendor) {
        return fail(`Carrier "${carrierName}" was not found as a vendor. Enable "Add vendor if missing" to create it, or add the carrier first.`);
      }
      const carrierResult = await db.createVendor({
        companyId,
        name: carrierName,
        email: invoice.carrierEmail || "",
        type: "service", // Use 'service' for carriers since 'carrier' is not a valid type
        status: "active"
      });
      carrier = await db.getVendorById(carrierResult.id) || null;
      createdRecords.push({ type: "vendor", id: carrierResult.id, name: carrierName });
    }

    // 2. Try to find related PO if specified (and the caller wants it linked)
    let relatedPoId: number | undefined;
    if (invoice.relatedPoNumber && linkToPO) {
      const po = await db.findPurchaseOrderByNumber(invoice.relatedPoNumber);
      if (po) {
        relatedPoId = po.id;
      } else {
        warnings.push(`Related PO ${invoice.relatedPoNumber} not found`);
      }
    }

    // 3. Create the freight record. Imported invoices live in freightBookings
    // (there is no separate freight-history table); the invoice details that
    // have no column of their own go in the notes JSON.
    const currency = normalizeCurrency(invoice.currency);
    const booking = await db.createFreightBooking({
      companyId,
      rfqId: 0, // No RFQ for imported invoices
      quoteId: 0, // No quote for imported invoices
      carrierId: carrier!.id,
      status: "delivered",
      bookingDate: invoiceDate,
      pickupDate: shipmentDate,
      deliveryDate,
      actualCost: invoice.totalAmount.toString(),
      currency,
      trackingNumber: invoice.trackingNumber || undefined,
      notes: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoiceDate.toISOString(),
        origin: invoice.origin,
        destination: invoice.destination,
        weight: invoice.weight,
        dimensions: invoice.dimensions,
        freightCharges: invoice.freightCharges.toString(),
        fuelSurcharge: invoice.fuelSurcharge?.toString(),
        accessorialCharges: invoice.accessorialCharges?.toString(),
        currency,
        relatedPoId,
        notes: invoice.notes,
        importedInvoice: true,
        createdBy: userId,
      }),
    });
    const freightId = booking.id;
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

      // 5. Optionally receive the carried goods into inventory. A freight invoice
      // typically arrives on/after delivery, so this lets freight drive inventory
      // for the linked PO. Only outstanding quantities are received.
      if (receiveInventory) {
        const result = await db.receivePurchaseOrderIntoInventory(relatedPoId, { warehouseId, receivedBy: userId });
        if (result.received) {
          updatedRecords.push({
            type: "purchase_order",
            id: relatedPoId,
            name: invoice.relatedPoNumber!,
            changes: `Received ${result.itemCount} line item(s) into inventory (warehouse #${result.warehouseId})`
          });
        } else {
          warnings.push(`Goods not received into inventory: ${result.reason}`);
        }
      }
    } else if (receiveInventory) {
      warnings.push("Could not receive goods into inventory: freight invoice is not linked to a purchase order.");
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
 * Record the vendor's bill (accounts payable) for an imported invoice, linked
 * to the PO that carries its line items. Idempotent on (invoiceNumber, vendor):
 * a re-import of a document, or a PO that was imported before bills existed,
 * gets exactly one bill. Never throws — a bill failure must not undo the PO /
 * inventory work that already happened, so it is reported as a warning.
 */
async function ensureBillForVendorInvoice(
  invoice: ImportedVendorInvoice,
  vendor: { id: number; companyId?: number | null },
  purchaseOrderId: number | undefined,
  userId: number,
  createdRecords: ImportResult["createdRecords"],
  warnings: string[],
  ctx: { billDate: Date; dueDate?: Date; companyId?: number },
): Promise<void> {
  try {
    const existing = await db.findBillByNumber(invoice.invoiceNumber, vendor.id);
    if (existing) return;
    const { id } = await db.createBill({
      // A vendor created by this very import may come back without its
      // companyId (or with none at all); fall back to the importer's entity.
      companyId: vendor.companyId ?? ctx.companyId ?? undefined,
      billNumber: invoice.invoiceNumber,
      vendorId: vendor.id,
      purchaseOrderId,
      sourceType: "document_import",
      billDate: ctx.billDate,
      dueDate: ctx.dueDate,
      subtotal: (invoice.subtotal ?? invoice.totalAmount).toString(),
      taxAmount: (invoice.taxAmount ?? 0).toString(),
      shippingAmount: (invoice.shippingAmount ?? 0).toString(),
      totalAmount: invoice.totalAmount.toString(),
      currency: invoice.currency || "USD",
      status: "draft",
      paymentTerms: invoice.paymentTerms,
      notes: invoice.notes,
      lineItems: invoice.lineItems?.map((item) => ({
        description: item.description,
        sku: item.sku,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      createdBy: userId,
    });
    createdRecords.push({ type: "bill", id, name: invoice.invoiceNumber });
  } catch (error) {
    warnings.push(`Bill ${invoice.invoiceNumber} could not be recorded: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

/**
 * Import a parsed vendor invoice into the system
 */
export async function importVendorInvoice(
  invoice: ImportedVendorInvoice,
  userId: number,
  markAsReceived: boolean = false,
  createMissingVendor: boolean = false,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];
  const companyId = options.companyId ?? undefined;
  const updateInventory = options.updateInventory ?? true;

  try {
    // 0. Validate before any write (see importPurchaseOrder).
    const fail = (error: string): ImportResult =>
      ({ success: false, documentType: "vendor_invoice", createdRecords, updatedRecords, warnings, error });
    const vendorName = (invoice.vendorName ?? "").trim();
    if (!vendorName) return fail("The invoice has no vendor name. Fill it in before importing.");
    if (!(invoice.invoiceNumber ?? "").trim()) return fail("The invoice has no invoice number. Fill it in before importing.");
    const invoiceDate = parseDocumentDate(invoice.invoiceDate);
    if (!invoiceDate) return fail(`Invoice date "${invoice.invoiceDate ?? ""}" is not a valid date. Fix it before importing.`);
    const dueDate = parseDocumentDate(invoice.dueDate);
    if (invoice.dueDate && !dueDate) return fail(`Due date "${invoice.dueDate}" is not a valid date. Fix it before importing.`);
    const billCtx = { billDate: invoiceDate, dueDate, companyId };

    // 1. Find vendor; only create if caller opted in
    let vendor = await db.getVendorByName(vendorName);
    if (!vendor) {
      if (!createMissingVendor) {
        return fail(`Vendor "${vendorName}" was not found. Enable "Add vendor if missing" to create it, or add the vendor first.`);
      }
      const vendorResult = await db.createVendor({
        companyId,
        name: vendorName,
        email: invoice.vendorEmail || "",
        type: "supplier",
        status: "active"
      });
      vendor = await db.getVendorById(vendorResult.id) || null;
      createdRecords.push({ type: "vendor", id: vendorResult.id, name: vendorName });
    }

    // 2. Bail out before anything is written if this invoice has already been
    // imported. poNumber has no unique constraint, so without this every re-run
    // of a document (or a re-processed mailbox) added another identical PO and
    // re-ran the step-7 inventory update on top of it.
    //
    // Must run ahead of the material matching below, which creates rawMaterials
    // rows: a guard placed after it would skip the duplicate PO but still leave
    // new materials behind on every re-import.
    const poNumberForInvoice = invoice.relatedPoNumber || `INV-${invoice.invoiceNumber}`;
    const existingPo = await db.findPurchaseOrderByNumberExact(poNumberForInvoice, vendor!.id);
    if (existingPo) {
      warnings.push(
        `Invoice ${invoice.invoiceNumber} was already imported as PO ${existingPo.poNumber} (#${existingPo.id}) — skipped to avoid a duplicate.`
      );
      // The PO may predate the bills table; make sure the payable exists either way.
      await ensureBillForVendorInvoice(invoice, vendor!, existingPo.id, userId, createdRecords, warnings, billCtx);
      return {
        success: true,
        documentType: "vendor_invoice",
        createdRecords,
        updatedRecords,
        warnings,
      };
    }

    // 3. Match line items to raw materials
    const matchedItems = await matchLineItemsToMaterials(invoice.lineItems);

    // 4. Try to find related PO if specified
    let relatedPoId: number | undefined;
    if (invoice.relatedPoNumber) {
      const po = await db.findPurchaseOrderByNumber(invoice.relatedPoNumber);
      if (po) {
        relatedPoId = po.id;
      } else {
        warnings.push(`Related PO ${invoice.relatedPoNumber} not found`);
      }
    }

    // 5. Create raw materials for unmatched items (skip services/charges/SaaS lines)
    for (const item of matchedItems) {
      if (!item.rawMaterialId) {
        if (isNonMaterialLineItem(item)) {
          warnings.push(`Skipped non-material line item "${item.description}" — recorded on the invoice but not added to materials.`);
          continue;
        }
        const materialResult = await db.createRawMaterial({
          companyId,
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

    // 6. Create a purchase order from the invoice (as a received order).
    const poOutcome = await db.createPurchaseOrderIfAbsent({
      companyId,
      poNumber: poNumberForInvoice,
      vendorId: vendor!.id,
      status: markAsReceived ? "received" : "confirmed",
      orderDate: invoiceDate,
      expectedDate: dueDate,
      subtotal: invoice.subtotal.toString(),
      totalAmount: invoice.totalAmount.toString(),
      notes: `Imported from vendor invoice ${invoice.invoiceNumber}. ${invoice.paymentTerms ? `Payment terms: ${invoice.paymentTerms}. ` : ''}${invoice.notes || ''}`,
      createdBy: userId
    });
    if (!poOutcome.created) {
      // Same race as the PO path: the step-2 guard and this insert are not one
      // statement, so a concurrent import of the same invoice can slip between
      // them. Bail before the line items and the step-8 receiving update.
      warnings.push(
        `Invoice ${invoice.invoiceNumber} was imported concurrently as PO #${poOutcome.id} — skipped to avoid a duplicate.`
      );
      await ensureBillForVendorInvoice(invoice, vendor!, poOutcome.id, userId, createdRecords, warnings, billCtx);
      return { success: true, documentType: "vendor_invoice", createdRecords, updatedRecords, warnings };
    }
    const poResult = { id: poOutcome.id };
    createdRecords.push({ type: "purchase_order", id: poResult.id, name: invoice.invoiceNumber });

    // 6b. The payable itself, linked to the PO that holds the line items.
    await ensureBillForVendorInvoice(invoice, vendor!, poResult.id, userId, createdRecords, warnings, billCtx);

    // 7. Create PO line items
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

    // 8. If marking as received, update inventory (unless the caller opted out
    // with updateInventory=false — the "Update inventory" checkbox on the page).
    if (markAsReceived && updateInventory) {
      // Batch load all raw materials instead of N+1
      const rmIds = matchedItems.map(i => i.rawMaterialId).filter((id): id is number => id != null);
      const materialsToUpdate = rmIds.length > 0 ? await db.getRawMaterialsByIds(rmIds) : [];
      const materialMap = new Map(materialsToUpdate.filter(Boolean).map(m => [m!.id, m!]));

      for (const item of matchedItems) {
        if (item.rawMaterialId) {
          const material = materialMap.get(item.rawMaterialId);
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
    } else if (markAsReceived) {
      warnings.push("Inventory was not updated (Update inventory is off).");
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
  userId: number,
  createMissingVendor: boolean = false,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const createdRecords: ImportResult["createdRecords"] = [];
  const updatedRecords: ImportResult["updatedRecords"] = [];
  const warnings: string[] = [];
  const companyId = options.companyId ?? undefined;
  const linkToPO = options.linkToPO ?? true;

  try {
    // 0. Validate before any write (see importPurchaseOrder).
    const fail = (error: string): ImportResult =>
      ({ success: false, documentType: "customs_document", createdRecords, updatedRecords, warnings, error });
    const shipperName = (doc.shipperName ?? "").trim();
    if (!shipperName) return fail("The document has no shipper name. Fill it in before importing.");
    if (!(doc.documentNumber ?? "").trim()) return fail("The document has no document number. Fill it in before importing.");
    const entryDate = parseDocumentDate(doc.entryDate);
    if (!entryDate) return fail(`Entry date "${doc.entryDate ?? ""}" is not a valid date. Fix it before importing.`);

    // 1. Find shipper as a vendor; only create if caller opted in
    let shipper = await db.getVendorByName(shipperName);
    if (!shipper) {
      if (!createMissingVendor) {
        return fail(`Shipper "${shipperName}" was not found as a vendor. Enable "Add vendor if missing" to create it, or add the shipper first.`);
      }
      const shipperResult = await db.createVendor({
        companyId,
        name: shipperName,
        email: "",
        type: "supplier",
        status: "active",
        country: doc.shipperCountry || undefined
      });
      shipper = await db.getVendorById(shipperResult.id) || null;
      createdRecords.push({ type: "vendor", id: shipperResult.id, name: shipperName });
    }

    // 2. Find customs broker as a vendor (if specified); only create if caller opted in
    let broker = null;
    if (doc.brokerName) {
      broker = await db.getVendorByName(doc.brokerName);
      if (!broker) {
        if (!createMissingVendor) {
          warnings.push(`Broker "${doc.brokerName}" was not found; skipped (enable "Add vendor if missing" to create).`);
        } else {
          const brokerResult = await db.createVendor({
            companyId,
            name: doc.brokerName,
            email: "",
            type: "service",
            status: "active"
          });
          createdRecords.push({ type: "vendor", id: brokerResult.id, name: doc.brokerName });
        }
      }
    }

    // 3. Try to find related PO if specified (and the caller wants it linked)
    let relatedPo: { id: number; notes?: string | null } | null = null;
    if (doc.relatedPoNumber && linkToPO) {
      relatedPo = await db.findPurchaseOrderByNumber(doc.relatedPoNumber);
      if (!relatedPo) {
        warnings.push(`Related PO ${doc.relatedPoNumber} not found`);
      }
    }
    const relatedPoId = relatedPo?.id;

    // 4. Create the customs entry as a freight record (the same freightBookings
    // row an imported freight invoice becomes; there is no customs-history table).
    const currency = normalizeCurrency(doc.currency);
    const booking = await db.createFreightBooking({
      companyId,
      rfqId: 0,
      quoteId: 0,
      carrierId: shipper!.id, // Using shipper as carrier for customs docs
      status: "arrived",
      bookingDate: entryDate,
      arrivalDate: entryDate,
      actualCost: (doc.totalCharges ?? 0).toString(),
      currency,
      trackingNumber: doc.containerNumber || doc.trackingNumber || undefined,
      containerNumber: doc.containerNumber || undefined,
      vesselName: doc.vesselName || undefined,
      voyageNumber: doc.voyageNumber || undefined,
      notes: JSON.stringify({
        invoiceNumber: doc.documentNumber,
        documentType: doc.documentType,
        invoiceDate: entryDate.toISOString(),
        origin: doc.portOfExit || doc.shipperCountry,
        destination: doc.portOfEntry || doc.consigneeCountry,
        freightCharges: (doc.totalDeclaredValue ?? 0).toString(),
        fuelSurcharge: (doc.totalDuties ?? 0).toString(),
        accessorialCharges: (doc.totalTaxes ?? 0).toString(),
        currency,
        relatedPoId,
        notes: `${String(doc.documentType || "other").replace(/_/g, ' ').toUpperCase()} | Shipper: ${shipperName} (${doc.shipperCountry || 'N/A'}) | Consignee: ${doc.consigneeName} | Country of Origin: ${doc.countryOfOrigin}${doc.vesselName ? ` | Vessel: ${doc.vesselName}` : ''}${doc.voyageNumber ? ` | Voyage: ${doc.voyageNumber}` : ''}${doc.brokerName ? ` | Broker: ${doc.brokerName}` : ''}${doc.brokerReference ? ` (Ref: ${doc.brokerReference})` : ''}${doc.notes ? ` | Notes: ${doc.notes}` : ''}`,
        importedCustomsDocument: true,
        createdBy: userId,
      }),
    });
    const freightId = booking.id;
    createdRecords.push({ type: "customs_document", id: freightId, name: doc.documentNumber });

    // 5. Create or update raw materials for line items with HS codes
    let materials = await db.getRawMaterials();
    for (const item of doc.lineItems) {
      if (item.hsCode) {
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
        } else if (isNonMaterialLineItem(item)) {
          warnings.push(`Skipped non-material line item "${item.description}" — recorded on the customs document but not added to materials.`);
        } else {
          // Create new material with HS code. A zero/missing quantity would
          // make the unit cost Infinity/NaN, which the decimal column rejects.
          const unitCost = item.quantity > 0 && Number.isFinite(item.declaredValue / item.quantity)
            ? (item.declaredValue / item.quantity).toFixed(4)
            : undefined;
          const materialResult = await db.createRawMaterial({
            companyId,
            name: item.description,
            sku: `HS-${item.hsCode}`,
            unit: item.unit || "EA",
            unitCost,
            preferredVendorId: shipper!.id
          });
          createdRecords.push({ type: "raw_material", id: materialResult.id, name: item.description });
          materials = await db.getRawMaterials();
        }
      }
    }

    // 6. If related to a PO, add customs info to the PO (appended — the PO's
    // own notes must survive the import).
    if (relatedPoId) {
      const customsNote = `Customs Doc: ${doc.documentNumber} | Duties: ${currency} ${doc.totalDuties ?? 0} | Taxes: ${currency} ${doc.totalTaxes ?? 0}`;
      await db.updatePurchaseOrder(relatedPoId, {
        notes: relatedPo?.notes ? `${relatedPo.notes}\n${customsNote}` : customsNote
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
  markPOsAsReceived: boolean = true,
  createMissingVendor: boolean = false
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
    const parseResult = await parseUploadedDocument(doc.content, doc.filename, doc.hint as "purchase_order" | "freight_invoice" | undefined);

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
      importResult = await importPurchaseOrder(parseResult.purchaseOrder, userId, markPOsAsReceived, createMissingVendor);
    } else if (parseResult.documentType === "vendor_invoice" && parseResult.vendorInvoice) {
      importResult = await importVendorInvoice(parseResult.vendorInvoice, userId, markPOsAsReceived, createMissingVendor);
    } else if (parseResult.documentType === "freight_invoice" && parseResult.freightInvoice) {
      importResult = await importFreightInvoice(parseResult.freightInvoice, userId, createMissingVendor);
    } else if (parseResult.documentType === "customs_document" && parseResult.customsDocument) {
      importResult = await importCustomsDocument(parseResult.customsDocument, userId, createMissingVendor);
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

/** Normalized summary of a parsed document, used to persist a parsedDocument row. */
interface NormalizedDocSummary {
  documentNumber?: string | null;
  vendorName?: string | null;
  vendorEmail?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  subtotal?: number | null;
  taxAmount?: number | null;
  shippingAmount?: number | null;
  totalAmount?: number | null;
  currency?: string | null;
  trackingNumber?: string | null;
  carrierName?: string | null;
  confidence?: number | null;
  lineItems?: any[] | null;
}

/**
 * Route a parsed document to the correct ERP importer (purchase order / vendor
 * invoice / freight invoice / customs doc) and return the import result plus a
 * normalized summary for persisting a parsedDocument row.
 *
 * Shared by the email-attachment and WhatsApp intake paths so a supplier
 * invoice or shipping doc is filed identically no matter how it arrived.
 */
async function routeParsedDocumentToErp(
  parseResult: DocumentParseResult,
  userId: number,
  opts: { markPOsAsReceived: boolean; createMissingVendor: boolean },
): Promise<{
  importResult: ImportResult;
  parsedType: "receipt" | "invoice" | "purchase_order" | "customs_document" | "other";
  summary: NormalizedDocSummary;
}> {
  const { markPOsAsReceived, createMissingVendor } = opts;
  let importResult: ImportResult;
  let parsedType: "receipt" | "invoice" | "purchase_order" | "customs_document" | "other" = "other";
  let summary: NormalizedDocSummary = {};

  if (parseResult.documentType === "purchase_order" && parseResult.purchaseOrder) {
    const po = parseResult.purchaseOrder;
    importResult = await importPurchaseOrder(po, userId, markPOsAsReceived, createMissingVendor);
    parsedType = "purchase_order";
    summary = {
      documentNumber: po.poNumber, vendorName: po.vendorName, vendorEmail: po.vendorEmail,
      documentDate: po.orderDate, subtotal: po.subtotal, taxAmount: po.taxAmount,
      shippingAmount: po.shippingAmount, totalAmount: po.totalAmount, currency: po.currency,
      confidence: po.confidence, lineItems: po.lineItems,
    };
  } else if (parseResult.documentType === "vendor_invoice" && parseResult.vendorInvoice) {
    const inv = parseResult.vendorInvoice;
    importResult = await importVendorInvoice(inv, userId, markPOsAsReceived, createMissingVendor);
    parsedType = "invoice";
    summary = {
      documentNumber: inv.invoiceNumber, vendorName: inv.vendorName, vendorEmail: inv.vendorEmail,
      documentDate: inv.invoiceDate, dueDate: inv.dueDate, subtotal: inv.subtotal,
      taxAmount: inv.taxAmount, shippingAmount: inv.shippingAmount, totalAmount: inv.totalAmount,
      currency: inv.currency, confidence: inv.confidence, lineItems: inv.lineItems,
    };
  } else if (parseResult.documentType === "freight_invoice" && parseResult.freightInvoice) {
    const fr = parseResult.freightInvoice;
    importResult = await importFreightInvoice(fr, userId, createMissingVendor);
    parsedType = "invoice";
    summary = {
      documentNumber: fr.invoiceNumber, vendorName: fr.carrierName, vendorEmail: fr.carrierEmail,
      documentDate: fr.invoiceDate, totalAmount: fr.totalAmount, currency: fr.currency,
      trackingNumber: fr.trackingNumber, carrierName: fr.carrierName, confidence: fr.confidence,
    };
  } else if (parseResult.documentType === "customs_document" && parseResult.customsDocument) {
    const cd = parseResult.customsDocument;
    importResult = await importCustomsDocument(cd, userId, createMissingVendor);
    parsedType = "customs_document";
    summary = {
      documentNumber: cd.documentNumber, vendorName: cd.shipperName,
      documentDate: cd.entryDate, totalAmount: cd.totalCharges, currency: cd.currency,
      trackingNumber: cd.trackingNumber, confidence: cd.confidence,
      lineItems: cd.lineItems,
    };
  } else {
    importResult = {
      success: false, documentType: parseResult.documentType, createdRecords: [],
      updatedRecords: [], warnings: [], error: "Unrecognized document type",
    };
  }

  return { importResult, parsedType, summary };
}

/**
 * Parse a single email attachment and import its data into the relevant ERP
 * location (purchase order / vendor invoice / freight invoice / customs doc).
 *
 * Unlike `bulkImportDocuments`, this also persists a `parsedDocument` row linked
 * to the originating email + attachment so the Email Inbox UI can surface what
 * was extracted, and it flips the attachment's `isProcessed` flag. It parses the
 * document exactly once (no double LLM call).
 */
export async function importEmailAttachmentToErp(opts: {
  emailId: number;
  attachmentId: number;
  content: string; // data URL: data:<mime>;base64,<...>
  filename: string;
  mimeType?: string;
  userId: number;
  hint?: "purchase_order" | "vendor_invoice" | "freight_invoice" | "customs_document";
  markPOsAsReceived?: boolean;
  createMissingVendor?: boolean;
}): Promise<{
  success: boolean;
  documentType: string;
  parsedDocumentId?: number;
  importResult?: ImportResult;
  error?: string;
}> {
  const markPOsAsReceived = opts.markPOsAsReceived ?? true;
  const createMissingVendor = opts.createMissingVendor ?? true;

  // Preserve any stored raw content so the attachment can be re-parsed later.
  const existing = await db.getEmailAttachmentById(opts.attachmentId);
  const existingMeta = ((existing?.metadata as any) || {});
  const preserved = existingMeta.contentDataUrl ? { contentDataUrl: existingMeta.contentDataUrl } : {};

  const parseHint = opts.hint === "purchase_order" || opts.hint === "freight_invoice"
    ? opts.hint
    : undefined;
  const parseResult = await parseUploadedDocument(opts.content, opts.filename, parseHint, opts.mimeType);

  if (!parseResult.success) {
    await db.updateEmailAttachment(opts.attachmentId, {
      isProcessed: true,
      metadata: { ...preserved, parseError: parseResult.error || "Failed to parse document" },
    });
    return { success: false, documentType: "unknown", error: parseResult.error || "Failed to parse document" };
  }

  // Route to the correct ERP importer and collect a normalized summary for the
  // parsedDocument record (shared with the WhatsApp intake path).
  const { importResult, parsedType, summary } = await routeParsedDocumentToErp(
    parseResult,
    opts.userId,
    { markPOsAsReceived, createMissingVendor },
  );

  // Persist a parsedDocument record linked to the email + attachment.
  let parsedDocumentId: number | undefined;
  try {
    const { id } = await db.createParsedDocument({
      emailId: opts.emailId,
      attachmentId: opts.attachmentId,
      documentType: parsedType as any,
      confidence: summary.confidence != null ? summary.confidence.toString() : null,
      vendorName: summary.vendorName ?? null,
      vendorEmail: summary.vendorEmail ?? null,
      vendorId: importResult.createdRecords.find(r => r.type === "vendor")?.id
        ?? importResult.updatedRecords.find(r => r.type === "vendor")?.id ?? null,
      documentNumber: summary.documentNumber ?? null,
      documentDate: summary.documentDate ? new Date(summary.documentDate) : null,
      dueDate: summary.dueDate ? new Date(summary.dueDate) : null,
      subtotal: summary.subtotal != null ? summary.subtotal.toString() : null,
      taxAmount: summary.taxAmount != null ? summary.taxAmount.toString() : null,
      shippingAmount: summary.shippingAmount != null ? summary.shippingAmount.toString() : null,
      totalAmount: summary.totalAmount != null ? summary.totalAmount.toString() : null,
      currency: normalizeCurrency(summary.currency),
      trackingNumber: summary.trackingNumber ?? null,
      carrierName: summary.carrierName ?? null,
      lineItems: summary.lineItems ?? null,
      isApproved: importResult.success,
      rawExtractedData: parseResult as any,
      notes: importResult.success
        ? `Imported: ${importResult.createdRecords.map(r => `${r.type} ${r.name}`).join(", ") || "none"}`
        : importResult.error || null,
    } as any);
    parsedDocumentId = id;

    if (summary.lineItems && summary.lineItems.length > 0) {
      for (let i = 0; i < summary.lineItems.length; i++) {
        const item: any = summary.lineItems[i];
        await db.createParsedDocumentLineItem({
          documentId: id,
          lineNumber: i + 1,
          description: item.description || null,
          sku: item.sku || null,
          quantity: item.quantity != null ? item.quantity.toString() : null,
          unit: item.unit || null,
          unitPrice: item.unitPrice != null ? item.unitPrice.toString() : null,
          totalPrice: (item.totalPrice ?? item.declaredValue) != null ? (item.totalPrice ?? item.declaredValue).toString() : null,
        } as any);
      }
    }
  } catch (e: any) {
    console.error("[ImportAttachment] Failed to persist parsedDocument:", e?.message);
  }

  // Mark the attachment processed with a short extracted summary.
  await db.updateEmailAttachment(opts.attachmentId, {
    isProcessed: true,
    extractedText: parseResult.rawText?.substring(0, 5000),
    metadata: {
      ...preserved,
      documentType: parseResult.documentType,
      imported: importResult.success,
      createdRecords: importResult.createdRecords,
      updatedRecords: importResult.updatedRecords,
      warnings: importResult.warnings,
      error: importResult.error,
    },
  });

  return {
    success: importResult.success,
    documentType: parseResult.documentType,
    parsedDocumentId,
    importResult,
  };
}

// Document-like MIME types the parser can extract structured data from.
// Images are limited to jpeg/png (photographed/scanned docs); animated and
// sticker formats (webp/gif) are deliberately excluded — WhatsApp stickers are
// image/webp and would otherwise burn an LLM call.
const PARSEABLE_DOCUMENT_MIME = /pdf|png|jpe?g|msword|word|spreadsheet|excel|sheet|csv/i;

/**
 * True when a WhatsApp/media attachment of the given MIME type is worth sending
 * through the document parser. Skips audio, video, vcards, stickers, etc. so we
 * don't burn an LLM call on something that can never be an invoice/shipping doc.
 */
export function isParseableDocumentMime(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return PARSEABLE_DOCUMENT_MIME.test(mimeType);
}

/**
 * Parse a document received over WhatsApp and import it into the relevant ERP
 * location — the WhatsApp analogue of `importEmailAttachmentToErp`.
 *
 * Runs the same LLM parser and the same per-type ERP importers used for email
 * attachments, so a supplier invoice or bill of lading sent over WhatsApp is
 * classified and filed identically to one sent by email (draft bill on Finance,
 * freight history on Logistics, etc.). It also persists a parsedDocument row so
 * the extraction is reviewable, links it to an existing shipment when the doc
 * carries a matching tracking number, and never throws — a parse failure must
 * not disrupt inbound-message capture.
 */
export async function importWhatsappDocumentToErp(opts: {
  whatsappMessageId: number;
  content: string; // data URL: data:<mime>;base64,<...>
  filename: string;
  mimeType?: string;
  fromNumber?: string;
  userId?: number;
  markPOsAsReceived?: boolean;
  createMissingVendor?: boolean;
}): Promise<{
  success: boolean;
  documentType: string;
  parsedDocumentId?: number;
  importResult?: ImportResult;
  error?: string;
}> {
  const userId = opts.userId ?? 1;
  const markPOsAsReceived = opts.markPOsAsReceived ?? true;
  const createMissingVendor = opts.createMissingVendor ?? true;

  // Enforce the cost-control guard locally so the "no LLM call on non-document
  // media" guarantee holds for every call site, not just the Twilio webhook.
  if (!isParseableDocumentMime(opts.mimeType)) {
    return { success: false, documentType: "unknown", error: `Unsupported media type for document parsing: ${opts.mimeType ?? "unknown"}` };
  }

  // Parse + route are wrapped so this function honors its "never throws"
  // contract for webhook/background callers; the later persistence steps are
  // already individually best-effort.
  let parseResult: DocumentParseResult;
  let importResult: ImportResult;
  let parsedType: "receipt" | "invoice" | "purchase_order" | "customs_document" | "other";
  let summary: NormalizedDocSummary;
  try {
    parseResult = await parseUploadedDocument(opts.content, opts.filename, undefined, opts.mimeType);
    if (!parseResult.success) {
      return { success: false, documentType: "unknown", error: parseResult.error || "Failed to parse document" };
    }
    ({ importResult, parsedType, summary } = await routeParsedDocumentToErp(
      parseResult,
      userId,
      { markPOsAsReceived, createMissingVendor },
    ));
  } catch (err: any) {
    console.error("[ImportWhatsappDoc] parse/route failed:", err?.message);
    return { success: false, documentType: "unknown", error: err?.message || "Failed to import document" };
  }

  // Link to an existing shipment when the document carries a known tracking
  // number, so it surfaces on Logistics next to that shipment.
  let shipmentId: number | null = null;
  if (summary.trackingNumber) {
    try {
      const shipment = await db.findShipmentByTracking(summary.trackingNumber);
      if (shipment) shipmentId = shipment.id;
    } catch { /* best-effort linkage */ }
  }

  // Persist a parsedDocument row. Unlike the email path there is no
  // email/attachment FK — the source of record is the whatsapp_messages row
  // (and the `documents` entry created on media capture), noted below.
  let parsedDocumentId: number | undefined;
  try {
    const importedSummary = importResult.success
      ? `Imported: ${importResult.createdRecords.map(r => `${r.type} ${r.name}`).join(", ") || "none"}`
      : importResult.error || "";
    const { id } = await db.createParsedDocument({
      emailId: null,
      attachmentId: null,
      documentType: parsedType as any,
      confidence: summary.confidence != null ? summary.confidence.toString() : null,
      vendorName: summary.vendorName ?? null,
      vendorEmail: summary.vendorEmail ?? null,
      vendorId: importResult.createdRecords.find(r => r.type === "vendor")?.id
        ?? importResult.updatedRecords.find(r => r.type === "vendor")?.id ?? null,
      documentNumber: summary.documentNumber ?? null,
      documentDate: summary.documentDate ? new Date(summary.documentDate) : null,
      dueDate: summary.dueDate ? new Date(summary.dueDate) : null,
      subtotal: summary.subtotal != null ? summary.subtotal.toString() : null,
      taxAmount: summary.taxAmount != null ? summary.taxAmount.toString() : null,
      shippingAmount: summary.shippingAmount != null ? summary.shippingAmount.toString() : null,
      totalAmount: summary.totalAmount != null ? summary.totalAmount.toString() : null,
      currency: normalizeCurrency(summary.currency),
      trackingNumber: summary.trackingNumber ?? null,
      carrierName: summary.carrierName ?? null,
      shipmentId,
      purchaseOrderId: importResult.createdRecords.find(r => r.type === "purchase_order")?.id
        ?? importResult.updatedRecords.find(r => r.type === "purchase_order")?.id ?? null,
      lineItems: summary.lineItems ?? null,
      isApproved: importResult.success,
      rawExtractedData: { source: "whatsapp", whatsappMessageId: opts.whatsappMessageId, ...(parseResult as any) },
      notes: `Received via WhatsApp${opts.fromNumber ? ` from ${opts.fromNumber}` : ""}.${importedSummary ? ` ${importedSummary}` : ""}`,
    } as any);
    parsedDocumentId = id;

    if (summary.lineItems && summary.lineItems.length > 0) {
      for (let i = 0; i < summary.lineItems.length; i++) {
        const item: any = summary.lineItems[i];
        await db.createParsedDocumentLineItem({
          documentId: id,
          lineNumber: i + 1,
          description: item.description || null,
          sku: item.sku || null,
          quantity: item.quantity != null ? item.quantity.toString() : null,
          unit: item.unit || null,
          unitPrice: item.unitPrice != null ? item.unitPrice.toString() : null,
          totalPrice: (item.totalPrice ?? item.declaredValue) != null ? (item.totalPrice ?? item.declaredValue).toString() : null,
        } as any);
      }
    }
  } catch (e: any) {
    console.error("[ImportWhatsappDoc] Failed to persist parsedDocument:", e?.message);
  }

  return {
    success: importResult.success,
    documentType: parseResult.documentType,
    parsedDocumentId,
    importResult,
  };
}

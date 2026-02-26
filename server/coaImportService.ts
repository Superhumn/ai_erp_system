/**
 * COA (Certificate of Analysis) Import Service
 * Extracts structured test results from supplier COA documents via LLM
 */

import { invokeLLM, type TextContent } from "./_core/llm";
import * as db from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

// ============================================
// TYPES
// ============================================

export interface ParsedCoaTestResult {
  testName: string;
  category: "chemical" | "microbiological" | "physical" | "sensory" | "heavy_metal" | "allergen" | "other";
  method?: string;
  specification?: string;
  specMin?: string;
  specMax?: string;
  result: string;
  unit?: string;
  status: "pass" | "fail" | "marginal";
}

export interface ParsedCoa {
  coaNumber: string;
  supplierName: string;
  supplierEmail?: string;
  productName: string;
  productSku?: string;
  lotCode?: string;
  batchNumber?: string;
  manufactureDate?: string;
  expiryDate?: string;
  analysisDate?: string;
  testResults: ParsedCoaTestResult[];
  overallStatus: "pass" | "fail" | "conditional_pass";
  allergenDeclarations?: string[];
  storageConditions?: string;
  notes?: string;
  confidence: number;
}

export interface CoaParseResult {
  success: boolean;
  documentType: "coa";
  coa?: ParsedCoa;
  rawText?: string;
  error?: string;
}

export interface CoaImportResult {
  success: boolean;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}

// ============================================
// COA PARSING
// ============================================

const COA_EXTRACTION_PROMPT = `You are an expert Certificate of Analysis (COA) parser for a food/ingredient manufacturing ERP system.

Analyze the provided document and extract structured data from a supplier's Certificate of Analysis.

INSTRUCTIONS:
1. Identify the COA number, supplier, product info, lot/batch number
2. Extract ALL test results with their specifications and actual results
3. Determine pass/fail status for each test
4. Identify allergen declarations if present
5. Look for storage conditions, manufacture/expiry dates

For each test result, classify into one of these categories:
- chemical: pH, moisture, acidity, peroxide value, FFA, etc.
- microbiological: TPC, yeast, mold, E.coli, Salmonella, Listeria, coliforms, etc.
- physical: color, odor, appearance, particle size, melting point, etc.
- sensory: taste, aroma, flavor profile
- heavy_metal: lead, arsenic, cadmium, mercury
- allergen: allergen-specific tests
- other: anything else

Return a JSON object with this structure:
{
  "coaNumber": "COA-12345",
  "supplierName": "Supplier Inc",
  "supplierEmail": "quality@supplier.com",
  "productName": "Coconut Oil RBD",
  "productSku": "CO-RBD-001",
  "lotCode": "LOT-2025-001",
  "batchNumber": "B2025-001",
  "manufactureDate": "2025-01-15",
  "expiryDate": "2027-01-15",
  "analysisDate": "2025-01-16",
  "overallStatus": "pass",
  "testResults": [
    {
      "testName": "Moisture Content",
      "category": "chemical",
      "method": "AOCS Ca 2c-25",
      "specification": "Max 0.1%",
      "specMin": null,
      "specMax": "0.1",
      "result": "0.05",
      "unit": "%",
      "status": "pass"
    },
    {
      "testName": "Free Fatty Acid",
      "category": "chemical",
      "method": "AOCS Ca 5a-40",
      "specification": "Max 0.1%",
      "specMin": null,
      "specMax": "0.1",
      "result": "0.03",
      "unit": "%",
      "status": "pass"
    },
    {
      "testName": "Total Plate Count",
      "category": "microbiological",
      "method": "ISO 4833",
      "specification": "Max 1000 CFU/g",
      "specMin": null,
      "specMax": "1000",
      "result": "<10",
      "unit": "CFU/g",
      "status": "pass"
    }
  ],
  "allergenDeclarations": ["Tree Nuts (Coconut)"],
  "storageConditions": "Store in cool, dry place below 25°C",
  "notes": "Additional notes",
  "confidence": 85
}`;

/**
 * Parse a COA document from a file URL using LLM
 */
export async function parseCoaDocument(
  fileUrl: string,
  filename: string,
  mimeType?: string
): Promise<CoaParseResult> {
  console.log("[COAImport] Parsing COA:", filename, "URL:", fileUrl);

  try {
    const isImage = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i);
    const isPdf = filename.toLowerCase().endsWith(".pdf");

    let messageContent: any[];

    if (isImage) {
      // Download and convert to base64
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const ext = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i)?.[1] || "png";
      const mimeMap: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
      };
      const dataUrl = `data:${mimeMap[ext] || "image/png"};base64,${base64}`;
      messageContent = [
        { type: "text", text: COA_EXTRACTION_PROMPT + `\n\nDOCUMENT: ${filename}` },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ];
    } else if (isPdf) {
      // Extract text from PDF using pdfjs-dist
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }

      if (fullText.trim().length < 100) {
        // Scanned PDF - fall back to OCR via image conversion
        const { fromBuffer } = await import("pdf2pic");
        const { randomBytes } = await import("crypto");
        const { mkdirSync, existsSync, rmSync } = await import("fs");
        const { join } = await import("path");
        const { tmpdir } = await import("os");

        const uniqueId = randomBytes(8).toString("hex");
        const tempDir = join(tmpdir(), `coa_ocr_${uniqueId}`);
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

        try {
          const convert = fromBuffer(Buffer.from(arrayBuffer), {
            density: 200,
            saveFilename: `coa_page_${uniqueId}`,
            savePath: tempDir,
            format: "png" as const,
            width: 2000,
            height: 2800,
          });
          convert.setGMClass(true);
          const pageResult = await convert(1, { responseType: "base64" });
          if (!pageResult?.base64) throw new Error("PDF to image conversion failed");

          const dataUrl = `data:image/png;base64,${pageResult.base64}`;
          messageContent = [
            { type: "text", text: COA_EXTRACTION_PROMPT + `\n\nDOCUMENT: ${filename}` },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ];
        } finally {
          try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
      } else {
        // Text-based PDF
        const pdfText = fullText.substring(0, 50000);
        messageContent = [
          { type: "text", text: `${COA_EXTRACTION_PROMPT}\n\nDOCUMENT: ${filename}\n\nEXTRACTED TEXT:\n${pdfText}` },
        ];
      }
    } else {
      // Text/CSV - read content directly
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const textContent = await response.text();
      messageContent = [
        { type: "text", text: `${COA_EXTRACTION_PROMPT}\n\nDOCUMENT: ${filename}\n\nCONTENT:\n${textContent.substring(0, 50000)}` },
      ];
    }

    const hasImageContent = messageContent.some((m: any) => m.type === "image_url");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: hasImageContent
            ? "You are a COA parsing AI. Analyze the document and extract structured test result data. IMPORTANT: Respond with ONLY valid JSON, no other text."
            : "You are a COA parsing AI that extracts structured test result data from Certificate of Analysis documents. Always respond with valid JSON.",
        },
        { role: "user", content: messageContent },
      ],
      ...(hasImageContent ? {} : {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "coa_parse_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                coaNumber: { type: "string" },
                supplierName: { type: "string" },
                supplierEmail: { type: "string" },
                productName: { type: "string" },
                productSku: { type: "string" },
                lotCode: { type: "string" },
                batchNumber: { type: "string" },
                manufactureDate: { type: "string" },
                expiryDate: { type: "string" },
                analysisDate: { type: "string" },
                overallStatus: { type: "string", enum: ["pass", "fail", "conditional_pass"] },
                testResults: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      testName: { type: "string" },
                      category: { type: "string", enum: ["chemical", "microbiological", "physical", "sensory", "heavy_metal", "allergen", "other"] },
                      method: { type: "string" },
                      specification: { type: "string" },
                      specMin: { type: "string" },
                      specMax: { type: "string" },
                      result: { type: "string" },
                      unit: { type: "string" },
                      status: { type: "string", enum: ["pass", "fail", "marginal"] },
                    },
                    required: ["testName", "category", "result", "status"],
                    additionalProperties: false,
                  },
                },
                allergenDeclarations: { type: "array", items: { type: "string" } },
                storageConditions: { type: "string" },
                notes: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["coaNumber", "supplierName", "productName", "testResults", "overallStatus", "confidence"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from LLM");

    let contentText: string;
    if (typeof content === "string") {
      contentText = content;
    } else if (Array.isArray(content)) {
      const textPart = content.find((p): p is TextContent => p.type === "text");
      contentText = textPart?.text || JSON.stringify(content);
    } else {
      contentText = JSON.stringify(content);
    }

    // Strip markdown code blocks
    let jsonText = contentText.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    return {
      success: true,
      documentType: "coa",
      coa: {
        coaNumber: parsed.coaNumber || `COA-${nanoid(8)}`,
        supplierName: parsed.supplierName,
        supplierEmail: parsed.supplierEmail,
        productName: parsed.productName,
        productSku: parsed.productSku,
        lotCode: parsed.lotCode,
        batchNumber: parsed.batchNumber,
        manufactureDate: parsed.manufactureDate,
        expiryDate: parsed.expiryDate,
        analysisDate: parsed.analysisDate,
        testResults: (parsed.testResults || []).map((t: any) => ({
          testName: t.testName,
          category: t.category || "other",
          method: t.method,
          specification: t.specification,
          specMin: t.specMin,
          specMax: t.specMax,
          result: t.result,
          unit: t.unit,
          status: t.status || "pass",
        })),
        overallStatus: parsed.overallStatus || "pass",
        allergenDeclarations: parsed.allergenDeclarations,
        storageConditions: parsed.storageConditions,
        notes: parsed.notes,
        confidence: (parsed.confidence || 0) / 100,
      },
      rawText: contentText,
    };
  } catch (error) {
    console.error("[COAImport] Parse error:", error);
    return {
      success: false,
      documentType: "coa",
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

// ============================================
// COA IMPORT
// ============================================

/**
 * Import a parsed COA into the ERP system (creates QC inspection, test results, COA record)
 */
export async function importCoa(
  coa: ParsedCoa,
  userId: number,
  options: {
    linkToProduct?: boolean;
    linkToVendor?: boolean;
    createMissingProduct?: boolean;
  } = {}
): Promise<CoaImportResult> {
  const { linkToProduct = true, linkToVendor = true, createMissingProduct = true } = options;
  const createdRecords: CoaImportResult["createdRecords"] = [];
  const updatedRecords: CoaImportResult["updatedRecords"] = [];
  const warnings: string[] = [];

  try {
    // 1. Find or create vendor
    let vendorId: number | undefined;
    if (linkToVendor) {
      const vendor = await db.getVendorByName(coa.supplierName);
      if (vendor) {
        vendorId = vendor.id;
      } else {
        const vendorResult = await db.createVendor({
          name: coa.supplierName,
          email: coa.supplierEmail || "",
          type: "supplier",
          status: "active",
        });
        vendorId = vendorResult.id;
        createdRecords.push({ type: "vendor", id: vendorResult.id, name: coa.supplierName });
      }
    }

    // 2. Find or create product
    let productId: number | undefined;
    if (linkToProduct) {
      // Try by SKU first, then by name
      if (coa.productSku) {
        const product = await db.getProductBySku(coa.productSku);
        if (product) productId = product.id;
      }
      if (!productId) {
        const products = await db.getProducts();
        const match = products.find(
          (p) => p.name.toLowerCase() === coa.productName.toLowerCase()
        );
        if (match) productId = match.id;
      }
      if (!productId && createMissingProduct) {
        const productResult = await db.createProduct({
          sku: coa.productSku || `PROD-${nanoid(6)}`,
          name: coa.productName,
          unitPrice: "0",
          type: "physical",
          status: "active",
        });
        productId = productResult.id;
        createdRecords.push({ type: "product", id: productResult.id, name: coa.productName });
      }
      if (!productId) {
        warnings.push(`Product "${coa.productName}" not found and auto-create disabled`);
      }
    }

    if (!productId) {
      // Create a placeholder product since QC inspection requires productId
      const productResult = await db.createProduct({
        sku: coa.productSku || `PROD-${nanoid(6)}`,
        name: coa.productName,
        unitPrice: "0",
        type: "physical",
        status: "active",
      });
      productId = productResult.id;
      createdRecords.push({ type: "product", id: productResult.id, name: coa.productName });
    }

    // 3. Create QC Inspection
    const inspectionStatus = coa.overallStatus === "pass"
      ? "pass"
      : coa.overallStatus === "fail"
        ? "fail"
        : "conditional_pass";

    const inspectionResult = await db.createQcInspection({
      inspectionNumber: `INS-${coa.coaNumber}`,
      productId,
      inspectionType: "incoming",
      status: inspectionStatus,
      vendorId,
      inspectedBy: userId,
      inspectedAt: coa.analysisDate ? new Date(coa.analysisDate) : new Date(),
      notes: [
        `Imported from supplier COA: ${coa.coaNumber}`,
        coa.lotCode ? `Lot: ${coa.lotCode}` : null,
        coa.batchNumber ? `Batch: ${coa.batchNumber}` : null,
        coa.storageConditions ? `Storage: ${coa.storageConditions}` : null,
        coa.allergenDeclarations?.length ? `Allergens: ${coa.allergenDeclarations.join(", ")}` : null,
        coa.notes,
      ].filter(Boolean).join("\n"),
    });
    createdRecords.push({ type: "qc_inspection", id: inspectionResult.id, name: `INS-${coa.coaNumber}` });

    // 4. Create QC Test Results
    if (coa.testResults.length > 0) {
      const testResultsData = coa.testResults.map((t) => ({
        inspectionId: inspectionResult.id,
        testName: t.testName,
        method: t.method || undefined,
        specMin: t.specMin || undefined,
        specMax: t.specMax || undefined,
        specTarget: t.specification || undefined,
        actualResult: t.result,
        unit: t.unit || undefined,
        status: t.status as "pass" | "fail" | "marginal" | "not_tested",
        notes: t.specification ? `Spec: ${t.specification}` : undefined,
        testedBy: userId,
        testedAt: coa.analysisDate ? new Date(coa.analysisDate) : new Date(),
      }));

      await db.createQcTestResultsBatch(testResultsData);
      createdRecords.push({
        type: "qc_test_results",
        id: inspectionResult.id,
        name: `${coa.testResults.length} test results`,
      });
    }

    // 5. Create COA record
    const coaResult = await db.createCertificateOfAnalysis({
      coaNumber: coa.coaNumber,
      inspectionId: inspectionResult.id,
      productId,
      status: "issued",
      lotCode: coa.lotCode || coa.batchNumber,
      manufactureDate: coa.manufactureDate ? new Date(coa.manufactureDate) : undefined,
      expiryDate: coa.expiryDate ? new Date(coa.expiryDate) : undefined,
      issuedBy: userId,
      issuedAt: new Date(),
      notes: `Imported from supplier ${coa.supplierName}. ${coa.testResults.length} tests - ${coa.overallStatus}`,
    });
    createdRecords.push({ type: "certificate_of_analysis", id: coaResult.id, name: coa.coaNumber });

    // 6. Log the import
    await db.createDocumentImportLog({
      documentType: "coa",
      filename: `COA-${coa.coaNumber}-${coa.supplierName}`,
      status: "completed",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: JSON.stringify(warnings),
      importedBy: userId,
      importedAt: Date.now(),
    });

    return { success: true, createdRecords, updatedRecords, warnings };
  } catch (error) {
    return {
      success: false,
      createdRecords,
      updatedRecords,
      warnings,
      error: error instanceof Error ? error.message : "Import failed",
    };
  }
}

// ============================================
// EMAIL COA SCANNING
// ============================================

/**
 * Scan inbox for emails that likely contain COA attachments
 */
export async function scanInboxForCoas(
  config: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  },
  options: {
    since?: Date;
    limit?: number;
    subjectFilters?: string[];
  } = {}
): Promise<{
  found: Array<{
    emailUid: number;
    subject: string;
    from: string;
    date: Date;
    attachments: Array<{ filename: string; contentType: string; size: number }>;
    likelyCoaAttachments: string[];
  }>;
  errors: string[];
}> {
  const { scanInbox } = await import("./_core/emailInboxScanner");
  const { since, limit = 50, subjectFilters = ["COA", "Certificate of Analysis", "C of A", "certificate", "analysis", "test results", "quality"] } = options;

  const result = await scanInbox(config, {
    limit,
    since,
    unseenOnly: false,
    markAsSeen: false,
  });

  if (!result.success) {
    return { found: [], errors: result.errors };
  }

  const coaEmails = result.processedEmails
    .filter((email) => {
      // Check if subject or body mentions COA-related keywords
      const text = `${email.subject} ${email.bodyText}`.toLowerCase();
      const hasCoaKeyword = subjectFilters.some((kw) => text.includes(kw.toLowerCase()));

      // Check if it has PDF/image attachments
      const hasRelevantAttachment = email.attachments.some(
        (a) =>
          a.contentType === "application/pdf" ||
          a.contentType.startsWith("image/") ||
          a.filename.toLowerCase().includes("coa") ||
          a.filename.toLowerCase().includes("certificate") ||
          a.filename.toLowerCase().includes("analysis")
      );

      return hasCoaKeyword && hasRelevantAttachment;
    })
    .map((email) => ({
      emailUid: email.uid,
      subject: email.subject,
      from: email.from.address,
      date: email.date,
      attachments: email.attachments,
      likelyCoaAttachments: email.attachments
        .filter(
          (a) =>
            a.contentType === "application/pdf" ||
            a.contentType.startsWith("image/") ||
            a.filename.toLowerCase().includes("coa") ||
            a.filename.toLowerCase().includes("certificate")
        )
        .map((a) => a.filename),
    }));

  return { found: coaEmails, errors: result.errors };
}

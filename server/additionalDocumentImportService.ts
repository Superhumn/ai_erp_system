/**
 * Additional Document Import Service
 * Parsers for document types not covered by documentImportService or coaImportService:
 * - Product Spec Sheets
 * - Certifications (organic, kosher, halal, etc.)
 * - SDS/MSDS (Safety Data Sheets)
 * - Freight Quotes (PDF)
 * - Shipping Documents (AWB, receipts, shipping labels)
 * - Customs Certificates (phytosanitary, fumigation, insurance, import/export license, weight certificate)
 */

import { invokeLLM, type TextContent } from "./_core/llm";
import * as db from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

// ============================================
// SHARED: Document content extraction
// ============================================

async function extractDocumentContent(
  fileUrl: string,
  filename: string
): Promise<{ messageContent: any[]; hasImage: boolean }> {
  const isImage = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i);
  const isPdf = filename.toLowerCase().endsWith(".pdf");

  if (isImage) {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const ext = filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/i)?.[1] || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    };
    const dataUrl = `data:${mimeMap[ext] || "image/png"};base64,${base64}`;
    return {
      messageContent: [{ type: "image_url", image_url: { url: dataUrl, detail: "high" } }],
      hasImage: true,
    };
  }

  if (isPdf) {
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
      fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
    }

    if (fullText.trim().length < 100) {
      // Scanned PDF → OCR via image conversion
      const { fromBuffer } = await import("pdf2pic");
      const { randomBytes } = await import("crypto");
      const { mkdirSync, existsSync, rmSync } = await import("fs");
      const { join } = await import("path");
      const { tmpdir } = await import("os");

      const uniqueId = randomBytes(8).toString("hex");
      const tempDir = join(tmpdir(), `doc_ocr_${uniqueId}`);
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
      try {
        const convert = fromBuffer(Buffer.from(arrayBuffer), {
          density: 200, saveFilename: `doc_page_${uniqueId}`, savePath: tempDir,
          format: "png" as const, width: 2000, height: 2800,
        });
        convert.setGMClass(true);
        const pageResult = await convert(1, { responseType: "base64" });
        if (!pageResult?.base64) throw new Error("PDF to image conversion failed");
        const dataUrl = `data:image/png;base64,${pageResult.base64}`;
        return {
          messageContent: [{ type: "image_url", image_url: { url: dataUrl, detail: "high" } }],
          hasImage: true,
        };
      } finally {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
    }

    return {
      messageContent: [{ type: "text", text: fullText.substring(0, 50000) }],
      hasImage: false,
    };
  }

  // Text/CSV
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const text = await response.text();
  return {
    messageContent: [{ type: "text", text: text.substring(0, 50000) }],
    hasImage: false,
  };
}

async function callLLMForParsing(
  systemPrompt: string,
  extractionPrompt: string,
  messageContent: any[],
  hasImage: boolean,
  jsonSchema?: any
): Promise<any> {
  const content = [
    { type: "text" as const, text: extractionPrompt },
    ...messageContent,
  ];

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
    ...(hasImage || !jsonSchema ? {} : {
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
    }),
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) throw new Error("No response from LLM");

  let contentText: string;
  if (typeof rawContent === "string") {
    contentText = rawContent;
  } else if (Array.isArray(rawContent)) {
    const textPart = rawContent.find((p): p is TextContent => p.type === "text");
    contentText = textPart?.text || JSON.stringify(rawContent);
  } else {
    contentText = JSON.stringify(rawContent);
  }

  let jsonText = contentText.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
  return JSON.parse(jsonText.trim());
}

// ============================================
// 1. PRODUCT SPEC SHEET PARSER
// ============================================

export interface ParsedProductSpec {
  productName: string;
  productSku?: string;
  supplierName?: string;
  version?: number;
  // Physical
  appearance?: string;
  color?: string;
  odor?: string;
  taste?: string;
  texture?: string;
  form?: "powder" | "liquid" | "granule" | "paste" | "flake" | "oil" | "extract" | "whole" | "other";
  meshSize?: string;
  // Chemical
  moisture?: string;
  protein?: string;
  fat?: string;
  fiber?: string;
  ash?: string;
  pH?: string;
  waterActivity?: string;
  // Microbiological
  totalPlateCount?: string;
  yeastAndMold?: string;
  coliform?: string;
  eColi?: string;
  salmonella?: string;
  listeria?: string;
  staphAureus?: string;
  // Heavy metals
  lead?: string;
  arsenic?: string;
  cadmium?: string;
  mercury?: string;
  // Storage
  shelfLifeMonths?: number;
  storageConditions?: string;
  packagingDescription?: string;
  // Regulatory
  countryOfOrigin?: string;
  hsCode?: string;
  ingredientStatement?: string;
  allergenDeclaration?: string;
  allergens?: string[];
  certifications?: string[];
  confidence: number;
}

export interface SpecSheetParseResult {
  success: boolean;
  documentType: "product_spec_sheet";
  spec?: ParsedProductSpec;
  rawText?: string;
  error?: string;
}

const SPEC_SHEET_PROMPT = `You are an expert product specification sheet parser for a food/ingredient manufacturing ERP system.

Analyze the document and extract structured data from a supplier's product specification sheet.

INSTRUCTIONS:
1. Identify product name, SKU, and supplier
2. Extract ALL physical properties: appearance, color, odor, taste, texture, form, mesh size
3. Extract ALL chemical/nutritional specs: moisture, protein, fat, fiber, ash, pH, water activity
4. Extract ALL microbiological limits: TPC, yeast & mold, coliform, E.coli, Salmonella, Listeria, Staph. aureus
5. Extract ALL heavy metal limits: lead, arsenic, cadmium, mercury
6. Extract storage conditions, shelf life, packaging info
7. Extract regulatory info: country of origin, HS code, ingredient statement
8. Extract allergen declarations and certifications (organic, kosher, halal, etc.)

For spec values, include the limit type and unit. Examples: "Max 6.0%", "<10 CFU/g", "Negative/25g", "Max 0.5 ppm"

Return JSON:
{
  "productName": "Organic Coconut Oil RBD",
  "productSku": "CO-RBD-001",
  "supplierName": "Tropical Oils Inc",
  "version": 1,
  "appearance": "Clear liquid above 25°C, white solid below",
  "color": "Water white to light yellow",
  "odor": "Bland, neutral",
  "taste": "Bland",
  "texture": "Smooth",
  "form": "oil",
  "meshSize": null,
  "moisture": "Max 0.1%",
  "protein": null,
  "fat": "Min 99.5%",
  "fiber": null,
  "ash": null,
  "pH": null,
  "waterActivity": "Max 0.3",
  "totalPlateCount": "Max 1000 CFU/g",
  "yeastAndMold": "Max 100 CFU/g",
  "coliform": "Max 10 CFU/g",
  "eColi": "Negative/g",
  "salmonella": "Negative/25g",
  "listeria": "Negative/25g",
  "staphAureus": null,
  "lead": "Max 0.1 ppm",
  "arsenic": "Max 0.1 ppm",
  "cadmium": "Max 0.05 ppm",
  "mercury": "Max 0.05 ppm",
  "shelfLifeMonths": 24,
  "storageConditions": "Store in cool, dry place. Avoid direct sunlight.",
  "packagingDescription": "20kg polylined boxes or 190kg steel drums",
  "countryOfOrigin": "Philippines",
  "hsCode": "1513.11.00",
  "ingredientStatement": "100% Refined, Bleached, Deodorized Coconut Oil",
  "allergenDeclaration": "Contains: Tree Nuts (Coconut). Free from: Peanuts, Soy, Wheat, Milk, Eggs, Fish, Shellfish",
  "allergens": ["tree_nuts"],
  "certifications": ["organic_usda", "kosher", "non_gmo"],
  "confidence": 85
}`;

export async function parseSpecSheet(
  fileUrl: string,
  filename: string
): Promise<SpecSheetParseResult> {
  console.log("[SpecSheetImport] Parsing spec sheet:", filename);
  try {
    const { messageContent, hasImage } = await extractDocumentContent(fileUrl, filename);
    const parsed = await callLLMForParsing(
      hasImage
        ? "You are a product specification parser. Analyze the document and extract structured spec data. IMPORTANT: Respond with ONLY valid JSON."
        : "You are a product specification parser. Always respond with valid JSON.",
      SPEC_SHEET_PROMPT + `\n\nDOCUMENT: ${filename}`,
      messageContent,
      hasImage
    );

    return {
      success: true,
      documentType: "product_spec_sheet",
      spec: { ...parsed, confidence: parsed.confidence || 0 },
    };
  } catch (error) {
    console.error("[SpecSheetImport] Parse error:", error);
    return {
      success: false,
      documentType: "product_spec_sheet",
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

export async function importSpecSheet(
  spec: ParsedProductSpec,
  userId: number
): Promise<{
  success: boolean;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}> {
  const createdRecords: { type: string; id: number; name: string }[] = [];
  const updatedRecords: { type: string; id: number; name: string; changes: string }[] = [];
  const warnings: string[] = [];

  try {
    // Find or create product
    let productId: number | undefined;
    if (spec.productSku) {
      const product = await db.getProductBySku(spec.productSku);
      if (product) productId = product.id;
    }
    if (!productId) {
      const products = await db.getProducts();
      const match = products.find(p => p.name.toLowerCase() === spec.productName.toLowerCase());
      if (match) productId = match.id;
    }
    if (!productId) {
      const result = await db.createProduct({
        sku: spec.productSku || `PROD-${nanoid(6)}`,
        name: spec.productName,
        unitPrice: "0",
        type: "physical",
        status: "active",
      });
      productId = result.id;
      createdRecords.push({ type: "product", id: result.id, name: spec.productName });
    }

    // Find or create vendor
    let vendorId: number | undefined;
    if (spec.supplierName) {
      const vendor = await db.getVendorByName(spec.supplierName);
      if (vendor) {
        vendorId = vendor.id;
      } else {
        const result = await db.createVendor({
          name: spec.supplierName,
          email: "",
          type: "supplier",
          status: "active",
        });
        vendorId = result.id;
        createdRecords.push({ type: "vendor", id: result.id, name: spec.supplierName });
      }
    }

    // Create product specification record
    const specResult = await db.createProductSpecification({
      productId,
      version: spec.version || 1,
      status: "active",
      appearance: spec.appearance,
      color: spec.color,
      odor: spec.odor,
      taste: spec.taste,
      texture: spec.texture,
      form: spec.form,
      meshSize: spec.meshSize,
      moisture: spec.moisture,
      protein: spec.protein,
      fat: spec.fat,
      fiber: spec.fiber,
      ash: spec.ash,
      pH: spec.pH,
      waterActivity: spec.waterActivity,
      totalPlateCount: spec.totalPlateCount,
      yeastAndMold: spec.yeastAndMold,
      coliform: spec.coliform,
      eColi: spec.eColi,
      salmonella: spec.salmonella,
      listeria: spec.listeria,
      staphAureus: spec.staphAureus,
      lead: spec.lead,
      arsenic: spec.arsenic,
      cadmium: spec.cadmium,
      mercury: spec.mercury,
      shelfLifeMonths: spec.shelfLifeMonths,
      storageConditions: spec.storageConditions,
      packagingDescription: spec.packagingDescription,
      countryOfOrigin: spec.countryOfOrigin,
      hsCode: spec.hsCode,
      ingredientStatement: spec.ingredientStatement,
      allergenDeclaration: spec.allergenDeclaration,
      createdBy: userId,
    });
    createdRecords.push({ type: "product_specification", id: specResult.id, name: `Spec v${spec.version || 1} for ${spec.productName}` });

    // Create allergen records
    if (spec.allergens?.length) {
      const validAllergens = ["milk", "eggs", "fish", "shellfish", "tree_nuts", "peanuts", "wheat", "soybeans", "sesame", "other"] as const;
      for (const allergen of spec.allergens) {
        const allergenType = validAllergens.includes(allergen as any) ? allergen as typeof validAllergens[number] : "other";
        const result = await db.createProductAllergen({
          productId,
          allergen: allergenType,
          customAllergenName: allergenType === "other" ? allergen : undefined,
          presenceType: "contains",
        });
        createdRecords.push({ type: "product_allergen", id: result.id, name: allergen });
      }
    }

    // Create certification records
    if (spec.certifications?.length) {
      const validCertTypes = [
        "organic_usda", "organic_eu", "kosher", "halal", "non_gmo",
        "gluten_free", "fair_trade", "rainforest_alliance", "brc",
        "sqf", "fssc_22000", "ifs", "iso_22000", "gmp", "haccp", "other"
      ] as const;
      for (const cert of spec.certifications) {
        const certType = validCertTypes.includes(cert as any) ? cert as typeof validCertTypes[number] : "other";
        const result = await db.createProductCertification({
          productId,
          certificationType: certType,
          customCertName: certType === "other" ? cert : undefined,
          status: "active",
        });
        createdRecords.push({ type: "product_certification", id: result.id, name: cert });
      }
    }

    await db.createDocumentImportLog({
      documentType: "product_spec_sheet",
      filename: `SpecSheet-${spec.productName}`,
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
      success: false, createdRecords, updatedRecords, warnings,
      error: error instanceof Error ? error.message : "Import failed",
    };
  }
}

// ============================================
// 2. CERTIFICATION PARSER (Organic, Kosher, Halal, etc.)
// ============================================

export interface ParsedCertification {
  certificationType: string;
  certificateNumber: string;
  certifyingBody: string;
  productName?: string;
  productSku?: string;
  companyName?: string;
  issueDate?: string;
  expiryDate?: string;
  scope?: string;
  status: "active" | "expired" | "pending";
  notes?: string;
  confidence: number;
}

export interface CertificationParseResult {
  success: boolean;
  documentType: "certification";
  certification?: ParsedCertification;
  rawText?: string;
  error?: string;
}

const CERTIFICATION_PROMPT = `You are an expert certification document parser for a food/ingredient manufacturing ERP system.

Analyze the document and extract structured data from a supplier certification (organic, kosher, halal, non-GMO, food safety, etc.).

INSTRUCTIONS:
1. Identify the certification type. Map to one of these values:
   organic_usda, organic_eu, kosher, halal, non_gmo, gluten_free, fair_trade,
   rainforest_alliance, brc, sqf, fssc_22000, ifs, iso_22000, gmp, haccp, other
2. Extract the certificate number, certifying body/agency
3. Extract the company/facility being certified
4. Extract product name if specific to a product
5. Extract issue date and expiry date
6. Extract scope of certification
7. Determine if active or expired based on dates

Return JSON:
{
  "certificationType": "organic_usda",
  "certificateNumber": "CERT-2025-12345",
  "certifyingBody": "Oregon Tilth",
  "productName": "Organic Coconut Oil",
  "productSku": null,
  "companyName": "Tropical Oils Inc",
  "issueDate": "2025-01-01",
  "expiryDate": "2026-01-01",
  "scope": "Processing and handling of organic coconut oil products",
  "status": "active",
  "notes": "NOP certified, covers RBD and Virgin varieties",
  "confidence": 90
}`;

export async function parseCertification(
  fileUrl: string,
  filename: string
): Promise<CertificationParseResult> {
  console.log("[CertImport] Parsing certification:", filename);
  try {
    const { messageContent, hasImage } = await extractDocumentContent(fileUrl, filename);
    const parsed = await callLLMForParsing(
      hasImage
        ? "You are a certification document parser. Extract structured data. Respond with ONLY valid JSON."
        : "You are a certification document parser. Always respond with valid JSON.",
      CERTIFICATION_PROMPT + `\n\nDOCUMENT: ${filename}`,
      messageContent,
      hasImage
    );

    return {
      success: true,
      documentType: "certification",
      certification: { ...parsed, confidence: parsed.confidence || 0 },
    };
  } catch (error) {
    console.error("[CertImport] Parse error:", error);
    return { success: false, documentType: "certification", error: error instanceof Error ? error.message : "Unknown parsing error" };
  }
}

export async function importCertification(
  cert: ParsedCertification,
  userId: number
): Promise<{
  success: boolean;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}> {
  const createdRecords: { type: string; id: number; name: string }[] = [];
  const updatedRecords: { type: string; id: number; name: string; changes: string }[] = [];
  const warnings: string[] = [];

  try {
    // Find or create product if specified
    let productId: number | undefined;
    if (cert.productName) {
      if (cert.productSku) {
        const product = await db.getProductBySku(cert.productSku);
        if (product) productId = product.id;
      }
      if (!productId) {
        const products = await db.getProducts();
        const match = products.find(p => p.name.toLowerCase() === cert.productName!.toLowerCase());
        if (match) productId = match.id;
      }
      if (!productId) {
        const result = await db.createProduct({
          sku: cert.productSku || `PROD-${nanoid(6)}`,
          name: cert.productName,
          unitPrice: "0",
          type: "physical",
          status: "active",
        });
        productId = result.id;
        createdRecords.push({ type: "product", id: result.id, name: cert.productName });
      }
    }

    // Find or create vendor
    let vendorId: number | undefined;
    if (cert.companyName) {
      const vendor = await db.getVendorByName(cert.companyName);
      if (vendor) {
        vendorId = vendor.id;
      } else {
        const result = await db.createVendor({
          name: cert.companyName,
          email: "",
          type: "supplier",
          status: "active",
        });
        vendorId = result.id;
        createdRecords.push({ type: "vendor", id: result.id, name: cert.companyName });
      }
    }

    // Create certification record if we have a product
    if (productId) {
      const validCertTypes = [
        "organic_usda", "organic_eu", "kosher", "halal", "non_gmo",
        "gluten_free", "fair_trade", "rainforest_alliance", "brc",
        "sqf", "fssc_22000", "ifs", "iso_22000", "gmp", "haccp", "other"
      ] as const;
      const certType = validCertTypes.includes(cert.certificationType as any)
        ? cert.certificationType as typeof validCertTypes[number]
        : "other";

      const result = await db.createProductCertification({
        productId,
        certificationType: certType,
        customCertName: certType === "other" ? cert.certificationType : undefined,
        certifyingBody: cert.certifyingBody,
        certificateNumber: cert.certificateNumber,
        issueDate: cert.issueDate ? new Date(cert.issueDate) : undefined,
        expiryDate: cert.expiryDate ? new Date(cert.expiryDate) : undefined,
        status: cert.status,
        notes: [cert.scope, cert.notes].filter(Boolean).join("\n"),
      });
      createdRecords.push({ type: "product_certification", id: result.id, name: `${cert.certificationType} - ${cert.certificateNumber}` });
    } else {
      warnings.push("No product specified or found - certification stored in import log only");
    }

    await db.createDocumentImportLog({
      documentType: "certification",
      filename: `Cert-${cert.certificationType}-${cert.certificateNumber}`,
      status: "completed",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: JSON.stringify(warnings),
      importedBy: userId,
      importedAt: Date.now(),
    });

    return { success: true, createdRecords, updatedRecords, warnings };
  } catch (error) {
    return { success: false, createdRecords, updatedRecords, warnings, error: error instanceof Error ? error.message : "Import failed" };
  }
}

// ============================================
// 3. SDS/MSDS PARSER (Safety Data Sheets)
// ============================================

export interface ParsedSds {
  productName: string;
  productSku?: string;
  supplierName: string;
  supplierPhone?: string;
  supplierEmergencyPhone?: string;
  sdsRevisionDate?: string;
  // Section 1: Identification
  chemicalName?: string;
  casNumber?: string;
  intendedUse?: string;
  // Section 2: Hazard identification
  ghsClassification?: string[];
  signalWord?: string;
  hazardStatements?: string[];
  precautionaryStatements?: string[];
  pictograms?: string[];
  // Section 3: Composition
  ingredients?: { name: string; casNumber?: string; percentage?: string }[];
  // Section 4: First aid
  firstAidInhalation?: string;
  firstAidSkin?: string;
  firstAidEyes?: string;
  firstAidIngestion?: string;
  // Section 7: Handling and storage
  handlingPrecautions?: string;
  storageConditions?: string;
  incompatibleMaterials?: string;
  // Section 8: Exposure controls / PPE
  exposureLimits?: string;
  ppe?: string;
  // Section 9: Physical/chemical properties
  physicalState?: string;
  color?: string;
  odor?: string;
  meltingPoint?: string;
  boilingPoint?: string;
  flashPoint?: string;
  pH?: string;
  specificGravity?: string;
  // Section 14: Transport
  unNumber?: string;
  properShippingName?: string;
  transportHazardClass?: string;
  packingGroup?: string;
  confidence: number;
}

export interface SdsParseResult {
  success: boolean;
  documentType: "sds_msds";
  sds?: ParsedSds;
  rawText?: string;
  error?: string;
}

const SDS_PROMPT = `You are an expert Safety Data Sheet (SDS/MSDS) parser for a food/ingredient manufacturing ERP system.

Analyze the document and extract structured data from a Safety Data Sheet.

INSTRUCTIONS:
Extract data from the standard 16 GHS sections. Focus on:
1. Section 1 - Product identification, supplier, CAS number
2. Section 2 - Hazard classification, signal word, H-statements, P-statements, pictograms
3. Section 3 - Composition/ingredients with CAS numbers and percentages
4. Section 4 - First aid measures (inhalation, skin, eyes, ingestion)
5. Section 7 - Handling and storage conditions
6. Section 8 - Exposure limits and PPE requirements
7. Section 9 - Physical/chemical properties (state, color, odor, pH, flash point, etc.)
8. Section 14 - Transport info (UN number, shipping name, hazard class, packing group)

Return JSON:
{
  "productName": "Citric Acid Anhydrous",
  "productSku": null,
  "supplierName": "Chemical Supply Corp",
  "supplierPhone": "+1-555-123-4567",
  "supplierEmergencyPhone": "CHEMTREC: 1-800-424-9300",
  "sdsRevisionDate": "2025-01-15",
  "chemicalName": "2-Hydroxypropane-1,2,3-tricarboxylic acid",
  "casNumber": "77-92-9",
  "intendedUse": "Food additive, acidulant",
  "ghsClassification": ["Eye Irrit. 2A"],
  "signalWord": "Warning",
  "hazardStatements": ["H319: Causes serious eye irritation"],
  "precautionaryStatements": ["P264: Wash hands thoroughly after handling", "P280: Wear eye protection"],
  "pictograms": ["GHS07 - Exclamation mark"],
  "ingredients": [{"name": "Citric acid anhydrous", "casNumber": "77-92-9", "percentage": "99-100%"}],
  "firstAidInhalation": "Move to fresh air. Seek medical attention if symptoms persist.",
  "firstAidSkin": "Wash with soap and water.",
  "firstAidEyes": "Rinse with water for at least 15 minutes. Seek medical attention.",
  "firstAidIngestion": "Rinse mouth. Do not induce vomiting.",
  "handlingPrecautions": "Avoid dust generation. Use local exhaust ventilation.",
  "storageConditions": "Store in cool, dry place in tightly sealed containers.",
  "incompatibleMaterials": "Strong oxidizers, strong bases, metals",
  "exposureLimits": "No specific OEL established",
  "ppe": "Safety glasses, dust mask, protective gloves",
  "physicalState": "Solid (crystalline powder)",
  "color": "White",
  "odor": "Odorless",
  "meltingPoint": "153°C",
  "boilingPoint": "Decomposes",
  "flashPoint": "Not applicable",
  "pH": "1.7 (1% solution)",
  "specificGravity": "1.665",
  "unNumber": "Not regulated",
  "properShippingName": "Not regulated",
  "transportHazardClass": "Not regulated",
  "packingGroup": "Not regulated",
  "confidence": 85
}`;

export async function parseSds(
  fileUrl: string,
  filename: string
): Promise<SdsParseResult> {
  console.log("[SDSImport] Parsing SDS:", filename);
  try {
    const { messageContent, hasImage } = await extractDocumentContent(fileUrl, filename);
    const parsed = await callLLMForParsing(
      hasImage
        ? "You are an SDS/MSDS parser. Extract structured safety data. Respond with ONLY valid JSON."
        : "You are an SDS/MSDS parser. Always respond with valid JSON.",
      SDS_PROMPT + `\n\nDOCUMENT: ${filename}`,
      messageContent,
      hasImage
    );

    return {
      success: true,
      documentType: "sds_msds",
      sds: { ...parsed, confidence: parsed.confidence || 0 },
    };
  } catch (error) {
    console.error("[SDSImport] Parse error:", error);
    return { success: false, documentType: "sds_msds", error: error instanceof Error ? error.message : "Unknown parsing error" };
  }
}

export async function importSds(
  sds: ParsedSds,
  userId: number
): Promise<{
  success: boolean;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}> {
  const createdRecords: { type: string; id: number; name: string }[] = [];
  const updatedRecords: { type: string; id: number; name: string; changes: string }[] = [];
  const warnings: string[] = [];

  try {
    // Find or create raw material
    let materialId: number | undefined;
    const materials = await db.getAllRawMaterials();
    const match = materials.find(m =>
      m.name.toLowerCase() === sds.productName.toLowerCase() ||
      (sds.casNumber && m.sku === sds.casNumber)
    );
    if (match) {
      materialId = match.id;
    } else {
      const result = await db.createRawMaterial({
        name: sds.productName,
        sku: sds.casNumber || `RM-${nanoid(6)}`,
        unit: "kg",
        unitCost: "0",
      });
      materialId = result.id;
      createdRecords.push({ type: "raw_material", id: result.id, name: sds.productName });
    }

    // Find or create vendor
    let vendorId: number | undefined;
    const vendor = await db.getVendorByName(sds.supplierName);
    if (vendor) {
      vendorId = vendor.id;
    } else {
      const result = await db.createVendor({
        name: sds.supplierName,
        email: "",
        type: "supplier",
        status: "active",
      });
      vendorId = result.id;
      createdRecords.push({ type: "vendor", id: result.id, name: sds.supplierName });
    }

    // Find or create a product for the specification linkage
    let productId: number | undefined;
    if (sds.productSku) {
      const product = await db.getProductBySku(sds.productSku);
      if (product) productId = product.id;
    }
    if (!productId) {
      const products = await db.getProducts();
      const prodMatch = products.find(p => p.name.toLowerCase() === sds.productName.toLowerCase());
      if (prodMatch) productId = prodMatch.id;
    }
    if (!productId) {
      const result = await db.createProduct({
        sku: sds.productSku || sds.casNumber || `PROD-${nanoid(6)}`,
        name: sds.productName,
        unitPrice: "0",
        type: "physical",
        status: "active",
      });
      productId = result.id;
      createdRecords.push({ type: "product", id: result.id, name: sds.productName });
    }

    // Store SDS data as a product specification with safety-focused fields
    const specResult = await db.createProductSpecification({
      productId,
      version: 1,
      status: "active",
      appearance: sds.physicalState,
      color: sds.color,
      odor: sds.odor,
      pH: sds.pH,
      storageConditions: sds.storageConditions,
      countryOfOrigin: undefined,
      customFields: {
        documentType: "sds_msds",
        casNumber: sds.casNumber,
        chemicalName: sds.chemicalName,
        intendedUse: sds.intendedUse,
        ghsClassification: sds.ghsClassification,
        signalWord: sds.signalWord,
        hazardStatements: sds.hazardStatements,
        precautionaryStatements: sds.precautionaryStatements,
        pictograms: sds.pictograms,
        ingredients: sds.ingredients,
        firstAid: {
          inhalation: sds.firstAidInhalation,
          skin: sds.firstAidSkin,
          eyes: sds.firstAidEyes,
          ingestion: sds.firstAidIngestion,
        },
        handlingPrecautions: sds.handlingPrecautions,
        incompatibleMaterials: sds.incompatibleMaterials,
        exposureLimits: sds.exposureLimits,
        ppe: sds.ppe,
        meltingPoint: sds.meltingPoint,
        boilingPoint: sds.boilingPoint,
        flashPoint: sds.flashPoint,
        specificGravity: sds.specificGravity,
        transport: {
          unNumber: sds.unNumber,
          properShippingName: sds.properShippingName,
          hazardClass: sds.transportHazardClass,
          packingGroup: sds.packingGroup,
        },
        supplierPhone: sds.supplierPhone,
        supplierEmergencyPhone: sds.supplierEmergencyPhone,
        sdsRevisionDate: sds.sdsRevisionDate,
      },
      createdBy: userId,
    });
    createdRecords.push({ type: "product_specification", id: specResult.id, name: `SDS for ${sds.productName}` });

    await db.createDocumentImportLog({
      documentType: "sds_msds",
      filename: `SDS-${sds.productName}`,
      status: "completed",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: JSON.stringify(warnings),
      importedBy: userId,
      importedAt: Date.now(),
    });

    return { success: true, createdRecords, updatedRecords, warnings };
  } catch (error) {
    return { success: false, createdRecords, updatedRecords, warnings, error: error instanceof Error ? error.message : "Import failed" };
  }
}

// ============================================
// 4. FREIGHT QUOTE PDF PARSER
// ============================================

export interface ParsedFreightQuote {
  quoteNumber: string;
  carrierName: string;
  carrierEmail?: string;
  quoteDate: string;
  validUntil?: string;
  origin: string;
  destination: string;
  serviceType?: string;
  transitDays?: number;
  weight?: string;
  dimensions?: string;
  containerType?: string;
  freightCharges: number;
  fuelSurcharge?: number;
  accessorialCharges?: number;
  customsFees?: number;
  insuranceFee?: number;
  totalAmount: number;
  currency?: string;
  incoterms?: string;
  notes?: string;
  confidence: number;
}

export interface FreightQuoteParseResult {
  success: boolean;
  documentType: "freight_quote";
  quote?: ParsedFreightQuote;
  rawText?: string;
  error?: string;
}

const FREIGHT_QUOTE_PROMPT = `You are an expert freight quote parser for a supply chain ERP system.

Analyze the document and extract structured data from a freight/shipping quote.

INSTRUCTIONS:
1. Extract quote number, carrier/forwarder name, quote date, validity period
2. Extract origin and destination (ports, addresses, or cities)
3. Extract service type (FCL, LCL, air freight, trucking, etc.)
4. Extract transit time, weight, dimensions, container type
5. Extract all charges: freight, fuel surcharge, accessorial, customs, insurance
6. Extract total quoted amount and currency
7. Extract Incoterms if specified

Return JSON:
{
  "quoteNumber": "QT-2025-001",
  "carrierName": "Pacific Freight Lines",
  "carrierEmail": "quotes@pacificfreight.com",
  "quoteDate": "2025-01-15",
  "validUntil": "2025-02-15",
  "origin": "Bangkok, Thailand",
  "destination": "Los Angeles, CA, USA",
  "serviceType": "FCL - Full Container Load",
  "transitDays": 21,
  "weight": "20,000 kg",
  "dimensions": "40' HC Container",
  "containerType": "40HC",
  "freightCharges": 3500.00,
  "fuelSurcharge": 450.00,
  "accessorialCharges": 200.00,
  "customsFees": 350.00,
  "insuranceFee": 150.00,
  "totalAmount": 4650.00,
  "currency": "USD",
  "incoterms": "CIF Los Angeles",
  "notes": "Rate valid for Jan-Feb shipments. Subject to GRI effective March 1.",
  "confidence": 85
}`;

export async function parseFreightQuote(
  fileUrl: string,
  filename: string
): Promise<FreightQuoteParseResult> {
  console.log("[FreightQuoteImport] Parsing freight quote:", filename);
  try {
    const { messageContent, hasImage } = await extractDocumentContent(fileUrl, filename);
    const parsed = await callLLMForParsing(
      hasImage
        ? "You are a freight quote parser. Extract structured shipping quote data. Respond with ONLY valid JSON."
        : "You are a freight quote parser. Always respond with valid JSON.",
      FREIGHT_QUOTE_PROMPT + `\n\nDOCUMENT: ${filename}`,
      messageContent,
      hasImage
    );

    return {
      success: true,
      documentType: "freight_quote",
      quote: { ...parsed, confidence: parsed.confidence || 0 },
    };
  } catch (error) {
    console.error("[FreightQuoteImport] Parse error:", error);
    return { success: false, documentType: "freight_quote", error: error instanceof Error ? error.message : "Unknown parsing error" };
  }
}

export async function importFreightQuote(
  quote: ParsedFreightQuote,
  userId: number
): Promise<{
  success: boolean;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}> {
  const createdRecords: { type: string; id: number; name: string }[] = [];
  const updatedRecords: { type: string; id: number; name: string; changes: string }[] = [];
  const warnings: string[] = [];

  try {
    // Find or create carrier
    let carrier = await db.getVendorByName(quote.carrierName);
    if (!carrier) {
      const result = await db.createVendor({
        name: quote.carrierName,
        email: quote.carrierEmail || "",
        type: "service",
        status: "active",
      });
      carrier = await db.getVendorById(result.id) || null;
      createdRecords.push({ type: "vendor", id: result.id, name: quote.carrierName });
    }

    // Store as freight booking with quote data
    const freightId = await db.createFreightHistory({
      invoiceNumber: quote.quoteNumber,
      carrierId: carrier!.id,
      invoiceDate: new Date(quote.quoteDate).getTime(),
      origin: quote.origin,
      destination: quote.destination,
      weight: quote.weight,
      dimensions: quote.dimensions,
      freightCharges: quote.freightCharges.toString(),
      fuelSurcharge: quote.fuelSurcharge?.toString(),
      accessorialCharges: quote.accessorialCharges?.toString(),
      totalAmount: quote.totalAmount.toString(),
      currency: quote.currency || "USD",
      notes: JSON.stringify({
        type: "freight_quote",
        validUntil: quote.validUntil,
        serviceType: quote.serviceType,
        transitDays: quote.transitDays,
        containerType: quote.containerType,
        customsFees: quote.customsFees,
        insuranceFee: quote.insuranceFee,
        incoterms: quote.incoterms,
        notes: quote.notes,
      }),
      createdBy: userId,
    });
    createdRecords.push({ type: "freight_quote", id: freightId, name: quote.quoteNumber });

    await db.createDocumentImportLog({
      documentType: "freight_quote",
      filename: `FreightQuote-${quote.quoteNumber}`,
      status: "completed",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: JSON.stringify(warnings),
      importedBy: userId,
      importedAt: Date.now(),
    });

    return { success: true, createdRecords, updatedRecords, warnings };
  } catch (error) {
    return { success: false, createdRecords, updatedRecords, warnings, error: error instanceof Error ? error.message : "Import failed" };
  }
}

// ============================================
// 5. SHIPPING DOCUMENT PARSERS (AWB, Receipt, Shipping Label)
// ============================================

export interface ParsedShippingDocument {
  documentType: "airway_bill" | "receipt" | "shipping_label";
  documentNumber: string;
  carrierName: string;
  // AWB-specific
  mawbNumber?: string;
  hawbNumber?: string;
  flightNumber?: string;
  // Common fields
  shipperName?: string;
  shipperAddress?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  origin: string;
  destination: string;
  shipDate?: string;
  deliveryDate?: string;
  weight?: string;
  pieces?: number;
  dimensions?: string;
  declaredValue?: number;
  // Receipt-specific
  receivedBy?: string;
  receivedDate?: string;
  conditionOnReceipt?: string;
  temperatureOnReceipt?: string;
  // Shipping label
  serviceType?: string;
  trackingNumber?: string;
  referenceNumbers?: string[];
  specialInstructions?: string;
  currency?: string;
  totalCharges?: number;
  notes?: string;
  confidence: number;
}

export interface ShippingDocParseResult {
  success: boolean;
  documentType: "airway_bill" | "receipt" | "shipping_label";
  document?: ParsedShippingDocument;
  rawText?: string;
  error?: string;
}

const SHIPPING_DOC_PROMPT = `You are an expert shipping document parser for a supply chain ERP system.

Analyze the document and determine if it is an:
1. Airway Bill (AWB) - air cargo shipping document with MAWB/HAWB numbers, flight info
2. Receipt / Delivery Receipt - proof of goods received, with receiver info, condition notes
3. Shipping Label - carrier label with tracking number, service type, addresses

INSTRUCTIONS:
- For AWBs: Extract MAWB/HAWB numbers, airline/carrier, flight number, shipper/consignee, origin/destination, weight, pieces
- For Receipts: Extract received by, date received, condition on receipt, temperature if applicable
- For Shipping Labels: Extract tracking number, carrier, service type, addresses, reference numbers

Return JSON:
{
  "documentType": "airway_bill" | "receipt" | "shipping_label",
  "documentNumber": "AWB-123-456789",
  "carrierName": "DHL Express",
  "mawbNumber": "123-456789",
  "hawbNumber": "HAWB-001",
  "flightNumber": "DHL7892",
  "shipperName": "Supplier Co Ltd",
  "shipperAddress": "123 Industrial Rd, Bangkok, Thailand",
  "consigneeName": "Our Company Inc",
  "consigneeAddress": "456 Commerce Ave, Los Angeles, CA 90001",
  "origin": "Bangkok, Thailand (BKK)",
  "destination": "Los Angeles, CA (LAX)",
  "shipDate": "2025-01-15",
  "deliveryDate": "2025-01-18",
  "weight": "500 kg",
  "pieces": 10,
  "dimensions": "120x80x100 cm per pallet",
  "declaredValue": 15000.00,
  "receivedBy": null,
  "receivedDate": null,
  "conditionOnReceipt": null,
  "temperatureOnReceipt": null,
  "serviceType": "Express",
  "trackingNumber": "1234567890",
  "referenceNumbers": ["PO-12345", "INV-67890"],
  "specialInstructions": "Temperature sensitive - keep below 25°C",
  "currency": "USD",
  "totalCharges": 2500.00,
  "notes": null,
  "confidence": 85
}`;

export async function parseShippingDocument(
  fileUrl: string,
  filename: string
): Promise<ShippingDocParseResult> {
  console.log("[ShippingDocImport] Parsing shipping document:", filename);
  try {
    const { messageContent, hasImage } = await extractDocumentContent(fileUrl, filename);
    const parsed = await callLLMForParsing(
      hasImage
        ? "You are a shipping document parser. Extract structured data. Respond with ONLY valid JSON."
        : "You are a shipping document parser. Always respond with valid JSON.",
      SHIPPING_DOC_PROMPT + `\n\nDOCUMENT: ${filename}`,
      messageContent,
      hasImage
    );

    const docType = parsed.documentType || "receipt";
    return {
      success: true,
      documentType: docType,
      document: { ...parsed, documentType: docType, confidence: parsed.confidence || 0 },
    };
  } catch (error) {
    console.error("[ShippingDocImport] Parse error:", error);
    return { success: false, documentType: "receipt", error: error instanceof Error ? error.message : "Unknown parsing error" };
  }
}

export async function importShippingDocument(
  doc: ParsedShippingDocument,
  userId: number
): Promise<{
  success: boolean;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}> {
  const createdRecords: { type: string; id: number; name: string }[] = [];
  const updatedRecords: { type: string; id: number; name: string; changes: string }[] = [];
  const warnings: string[] = [];

  try {
    // Find or create carrier
    let carrier = await db.getVendorByName(doc.carrierName);
    if (!carrier) {
      const result = await db.createVendor({
        name: doc.carrierName,
        email: "",
        type: "service",
        status: "active",
      });
      carrier = await db.getVendorById(result.id) || null;
      createdRecords.push({ type: "vendor", id: result.id, name: doc.carrierName });
    }

    // Create shipment record
    const shipmentResult = await db.createShipment({
      shipmentNumber: `SHP-${doc.documentNumber}`,
      type: "inbound",
      status: doc.documentType === "receipt" ? "delivered" : "in_transit",
      carrierId: carrier!.id,
      trackingNumber: doc.trackingNumber || doc.documentNumber,
      origin: doc.origin,
      destination: doc.destination,
      estimatedShipDate: doc.shipDate ? new Date(doc.shipDate) : undefined,
      estimatedDeliveryDate: doc.deliveryDate ? new Date(doc.deliveryDate) : undefined,
      actualDeliveryDate: doc.receivedDate ? new Date(doc.receivedDate) : undefined,
      weight: doc.weight,
      notes: [
        `${doc.documentType.replace(/_/g, " ").toUpperCase()}: ${doc.documentNumber}`,
        doc.mawbNumber ? `MAWB: ${doc.mawbNumber}` : null,
        doc.hawbNumber ? `HAWB: ${doc.hawbNumber}` : null,
        doc.flightNumber ? `Flight: ${doc.flightNumber}` : null,
        doc.shipperName ? `Shipper: ${doc.shipperName}` : null,
        doc.consigneeName ? `Consignee: ${doc.consigneeName}` : null,
        doc.receivedBy ? `Received by: ${doc.receivedBy}` : null,
        doc.conditionOnReceipt ? `Condition: ${doc.conditionOnReceipt}` : null,
        doc.temperatureOnReceipt ? `Temp on receipt: ${doc.temperatureOnReceipt}` : null,
        doc.serviceType ? `Service: ${doc.serviceType}` : null,
        doc.specialInstructions ? `Instructions: ${doc.specialInstructions}` : null,
        doc.referenceNumbers?.length ? `References: ${doc.referenceNumbers.join(", ")}` : null,
        doc.notes,
      ].filter(Boolean).join("\n"),
      createdBy: userId,
    } as any);
    createdRecords.push({ type: "shipment", id: shipmentResult.id, name: doc.documentNumber });

    // Try to link to PO via reference numbers
    if (doc.referenceNumbers?.length) {
      for (const ref of doc.referenceNumbers) {
        if (ref.startsWith("PO-") || ref.startsWith("PO ")) {
          const po = await db.findPurchaseOrderByNumber(ref);
          if (po) {
            updatedRecords.push({
              type: "purchase_order", id: po.id, name: ref,
              changes: `Linked to shipment ${doc.documentNumber}`,
            });
          }
        }
      }
    }

    await db.createDocumentImportLog({
      documentType: doc.documentType,
      filename: `${doc.documentType}-${doc.documentNumber}`,
      status: "completed",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: JSON.stringify(warnings),
      importedBy: userId,
      importedAt: Date.now(),
    });

    return { success: true, createdRecords, updatedRecords, warnings };
  } catch (error) {
    return { success: false, createdRecords, updatedRecords, warnings, error: error instanceof Error ? error.message : "Import failed" };
  }
}

// ============================================
// 6. CUSTOMS CERTIFICATE PARSERS
// (Phytosanitary, Fumigation, Insurance, Import/Export License, Weight Certificate)
// ============================================

export interface ParsedCustomsCertificate {
  documentType:
    | "phytosanitary_certificate"
    | "fumigation_certificate"
    | "insurance_certificate"
    | "import_license"
    | "export_license"
    | "weight_certificate"
    | "inspection_certificate";
  certificateNumber: string;
  issuerName: string;
  issuerCountry?: string;
  issueDate: string;
  expiryDate?: string;
  // Parties
  applicantName?: string;
  exporterName?: string;
  importerName?: string;
  // Shipment info
  origin?: string;
  destination?: string;
  portOfEntry?: string;
  portOfExit?: string;
  vesselName?: string;
  containerNumber?: string;
  // Product/goods
  productDescription: string;
  quantity?: string;
  weight?: string;
  // Type-specific fields
  // Phytosanitary
  plantHealthDeclaration?: string;
  treatmentType?: string;
  treatmentDate?: string;
  pestsFreeDeclaration?: string;
  // Fumigation
  fumigant?: string;
  dosage?: string;
  duration?: string;
  temperature?: string;
  // Insurance
  insuredValue?: number;
  coverageType?: string;
  policyNumber?: string;
  insurer?: string;
  beneficiary?: string;
  // License
  licenseType?: string;
  hsCodesAuthorized?: string[];
  quotaQuantity?: string;
  // Weight
  grossWeight?: string;
  netWeight?: string;
  tareWeight?: string;
  weighingMethod?: string;
  // Common
  relatedPoNumber?: string;
  notes?: string;
  confidence: number;
}

export interface CustomsCertParseResult {
  success: boolean;
  documentType: string;
  certificate?: ParsedCustomsCertificate;
  rawText?: string;
  error?: string;
}

const CUSTOMS_CERT_PROMPT = `You are an expert customs/trade compliance document parser for a supply chain ERP system.

Analyze the document and determine its type:
1. Phytosanitary Certificate - plant health inspection certificate for agricultural products
2. Fumigation Certificate - proof of fumigation treatment (methyl bromide, phosphine, etc.)
3. Insurance Certificate - cargo/marine insurance document
4. Import License / Export License - government authorization to import/export goods
5. Weight Certificate - official weight verification document
6. Inspection Certificate - third-party inspection/survey report

INSTRUCTIONS:
- Extract the certificate number, issuing authority, dates
- For Phytosanitary: plant health declaration, treatment details, pest-free declaration
- For Fumigation: fumigant used, dosage, duration, temperature
- For Insurance: insured value, coverage type, policy number, insurer, beneficiary
- For Licenses: license type, authorized HS codes, quota quantities
- For Weight Certs: gross weight, net weight, tare weight, weighing method
- Extract all shipment details: origin, destination, ports, vessel, container

Return JSON:
{
  "documentType": "phytosanitary_certificate" | "fumigation_certificate" | "insurance_certificate" | "import_license" | "export_license" | "weight_certificate" | "inspection_certificate",
  "certificateNumber": "PC-2025-001234",
  "issuerName": "Department of Agriculture, Thailand",
  "issuerCountry": "Thailand",
  "issueDate": "2025-01-15",
  "expiryDate": "2025-02-15",
  "applicantName": "Thai Exports Co Ltd",
  "exporterName": "Thai Exports Co Ltd",
  "importerName": "US Ingredients Inc",
  "origin": "Bangkok, Thailand",
  "destination": "Los Angeles, CA, USA",
  "portOfEntry": "Port of Los Angeles",
  "portOfExit": "Laem Chabang Port",
  "vesselName": "Pacific Star",
  "containerNumber": "MSKU1234567",
  "productDescription": "Dried coconut flakes, desiccated coconut",
  "quantity": "20 MT",
  "weight": "20,000 kg",
  "plantHealthDeclaration": "The plants/plant products described herein have been inspected and found to be free from quarantine pests.",
  "treatmentType": "Heat treatment at 56°C for 30 min",
  "treatmentDate": "2025-01-14",
  "pestsFreeDeclaration": "Free from regulated pests as per ISPM 15",
  "fumigant": null, "dosage": null, "duration": null, "temperature": null,
  "insuredValue": null, "coverageType": null, "policyNumber": null, "insurer": null, "beneficiary": null,
  "licenseType": null, "hsCodesAuthorized": null, "quotaQuantity": null,
  "grossWeight": null, "netWeight": null, "tareWeight": null, "weighingMethod": null,
  "relatedPoNumber": "PO-2025-100",
  "notes": "Certificate valid for single shipment only",
  "confidence": 85
}`;

export async function parseCustomsCertificate(
  fileUrl: string,
  filename: string
): Promise<CustomsCertParseResult> {
  console.log("[CustomsCertImport] Parsing customs certificate:", filename);
  try {
    const { messageContent, hasImage } = await extractDocumentContent(fileUrl, filename);
    const parsed = await callLLMForParsing(
      hasImage
        ? "You are a customs/trade compliance document parser. Extract structured data. Respond with ONLY valid JSON."
        : "You are a customs/trade compliance document parser. Always respond with valid JSON.",
      CUSTOMS_CERT_PROMPT + `\n\nDOCUMENT: ${filename}`,
      messageContent,
      hasImage
    );

    const docType = parsed.documentType || "inspection_certificate";
    return {
      success: true,
      documentType: docType,
      certificate: { ...parsed, documentType: docType, confidence: parsed.confidence || 0 },
    };
  } catch (error) {
    console.error("[CustomsCertImport] Parse error:", error);
    return { success: false, documentType: "inspection_certificate", error: error instanceof Error ? error.message : "Unknown parsing error" };
  }
}

export async function importCustomsCertificate(
  cert: ParsedCustomsCertificate,
  userId: number
): Promise<{
  success: boolean;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}> {
  const createdRecords: { type: string; id: number; name: string }[] = [];
  const updatedRecords: { type: string; id: number; name: string; changes: string }[] = [];
  const warnings: string[] = [];

  try {
    // Find or create exporter/applicant as vendor
    let vendorId: number | undefined;
    const vendorName = cert.exporterName || cert.applicantName || cert.issuerName;
    if (vendorName) {
      const vendor = await db.getVendorByName(vendorName);
      if (vendor) {
        vendorId = vendor.id;
      } else {
        const result = await db.createVendor({
          name: vendorName,
          email: "",
          type: "supplier",
          status: "active",
          country: cert.issuerCountry,
        });
        vendorId = result.id;
        createdRecords.push({ type: "vendor", id: result.id, name: vendorName });
      }
    }

    // Try to find related PO
    let relatedPoId: number | undefined;
    if (cert.relatedPoNumber) {
      const po = await db.findPurchaseOrderByNumber(cert.relatedPoNumber);
      if (po) {
        relatedPoId = po.id;
      } else {
        warnings.push(`Related PO ${cert.relatedPoNumber} not found`);
      }
    }

    // Map to customsDocuments table document type
    const docTypeMap: Record<string, string> = {
      phytosanitary_certificate: "phytosanitary_certificate",
      fumigation_certificate: "fumigation_certificate",
      insurance_certificate: "insurance_certificate",
      import_license: "import_license",
      export_license: "export_license",
      weight_certificate: "inspection_certificate",
      inspection_certificate: "inspection_certificate",
    };

    // Build detailed notes for the certificate
    const detailedNotes = [
      `Type: ${cert.documentType.replace(/_/g, " ").toUpperCase()}`,
      cert.issuerName ? `Issued by: ${cert.issuerName}${cert.issuerCountry ? ` (${cert.issuerCountry})` : ""}` : null,
      cert.applicantName ? `Applicant: ${cert.applicantName}` : null,
      cert.exporterName ? `Exporter: ${cert.exporterName}` : null,
      cert.importerName ? `Importer: ${cert.importerName}` : null,
      cert.productDescription ? `Product: ${cert.productDescription}` : null,
      cert.quantity ? `Quantity: ${cert.quantity}` : null,
      cert.weight ? `Weight: ${cert.weight}` : null,
      cert.vesselName ? `Vessel: ${cert.vesselName}` : null,
      cert.containerNumber ? `Container: ${cert.containerNumber}` : null,
      // Phytosanitary
      cert.plantHealthDeclaration ? `Plant Health: ${cert.plantHealthDeclaration}` : null,
      cert.treatmentType ? `Treatment: ${cert.treatmentType}` : null,
      cert.treatmentDate ? `Treatment Date: ${cert.treatmentDate}` : null,
      cert.pestsFreeDeclaration ? `Pest-Free: ${cert.pestsFreeDeclaration}` : null,
      // Fumigation
      cert.fumigant ? `Fumigant: ${cert.fumigant}` : null,
      cert.dosage ? `Dosage: ${cert.dosage}` : null,
      cert.duration ? `Duration: ${cert.duration}` : null,
      cert.temperature ? `Temperature: ${cert.temperature}` : null,
      // Insurance
      cert.insuredValue ? `Insured Value: ${cert.insuredValue}` : null,
      cert.coverageType ? `Coverage: ${cert.coverageType}` : null,
      cert.policyNumber ? `Policy: ${cert.policyNumber}` : null,
      cert.insurer ? `Insurer: ${cert.insurer}` : null,
      cert.beneficiary ? `Beneficiary: ${cert.beneficiary}` : null,
      // License
      cert.licenseType ? `License Type: ${cert.licenseType}` : null,
      cert.hsCodesAuthorized?.length ? `HS Codes: ${cert.hsCodesAuthorized.join(", ")}` : null,
      cert.quotaQuantity ? `Quota: ${cert.quotaQuantity}` : null,
      // Weight
      cert.grossWeight ? `Gross Weight: ${cert.grossWeight}` : null,
      cert.netWeight ? `Net Weight: ${cert.netWeight}` : null,
      cert.tareWeight ? `Tare Weight: ${cert.tareWeight}` : null,
      cert.weighingMethod ? `Weighing Method: ${cert.weighingMethod}` : null,
      cert.notes,
    ].filter(Boolean).join("\n");

    // Store as freight history (customs tracking)
    const freightId = await db.createFreightHistory({
      invoiceNumber: cert.certificateNumber,
      carrierId: vendorId || 0,
      invoiceDate: new Date(cert.issueDate).getTime(),
      origin: cert.origin || cert.portOfExit || cert.issuerCountry,
      destination: cert.destination || cert.portOfEntry,
      trackingNumber: cert.containerNumber,
      freightCharges: (cert.insuredValue || 0).toString(),
      totalAmount: "0",
      currency: "USD",
      relatedPoId,
      notes: detailedNotes,
      createdBy: userId,
    });
    createdRecords.push({ type: "customs_certificate", id: freightId, name: `${cert.documentType} - ${cert.certificateNumber}` });

    // Update related PO if found
    if (relatedPoId) {
      await db.updatePurchaseOrder(relatedPoId, {
        notes: `${cert.documentType.replace(/_/g, " ")}: ${cert.certificateNumber}`,
      } as any);
      updatedRecords.push({
        type: "purchase_order", id: relatedPoId, name: cert.relatedPoNumber!,
        changes: `Linked ${cert.documentType.replace(/_/g, " ")} certificate: ${cert.certificateNumber}`,
      });
    }

    await db.createDocumentImportLog({
      documentType: cert.documentType,
      filename: `${cert.documentType}-${cert.certificateNumber}`,
      status: "completed",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: JSON.stringify(warnings),
      importedBy: userId,
      importedAt: Date.now(),
    });

    return { success: true, createdRecords, updatedRecords, warnings };
  } catch (error) {
    return { success: false, createdRecords, updatedRecords, warnings, error: error instanceof Error ? error.message : "Import failed" };
  }
}

// ============================================
// UNIFIED PARSER: Auto-detect document type
// ============================================

export type AdditionalDocumentType =
  | "product_spec_sheet"
  | "certification"
  | "sds_msds"
  | "freight_quote"
  | "airway_bill"
  | "receipt"
  | "shipping_label"
  | "phytosanitary_certificate"
  | "fumigation_certificate"
  | "insurance_certificate"
  | "import_license"
  | "export_license"
  | "weight_certificate"
  | "inspection_certificate";

export interface AdditionalDocParseResult {
  success: boolean;
  documentType: AdditionalDocumentType | "unknown";
  spec?: ParsedProductSpec;
  certification?: ParsedCertification;
  sds?: ParsedSds;
  freightQuote?: ParsedFreightQuote;
  shippingDocument?: ParsedShippingDocument;
  customsCertificate?: ParsedCustomsCertificate;
  rawText?: string;
  error?: string;
}

const CLASSIFY_PROMPT = `Classify this document into exactly one of these types:
- product_spec_sheet: Product specification sheet with physical, chemical, microbiological specs
- certification: Organic, kosher, halal, non-GMO, food safety certificate
- sds_msds: Safety Data Sheet / Material Safety Data Sheet with GHS sections
- freight_quote: Freight/shipping quote with pricing
- airway_bill: Air waybill (MAWB/HAWB)
- receipt: Delivery receipt / proof of delivery
- shipping_label: Carrier shipping label with tracking info
- phytosanitary_certificate: Plant health certificate
- fumigation_certificate: Fumigation/pest treatment certificate
- insurance_certificate: Cargo/marine insurance certificate
- import_license: Government import authorization
- export_license: Government export authorization
- weight_certificate: Official weight/measure certificate
- inspection_certificate: Third-party inspection report

Respond with ONLY a JSON object: {"documentType": "<type>", "confidence": <0-100>}`;

export async function parseAdditionalDocument(
  fileUrl: string,
  filename: string,
  documentHint?: AdditionalDocumentType
): Promise<AdditionalDocParseResult> {
  console.log("[AdditionalDocImport] Parsing:", filename, "hint:", documentHint);

  try {
    let docType = documentHint;

    // Auto-detect if no hint
    if (!docType) {
      const { messageContent, hasImage } = await extractDocumentContent(fileUrl, filename);
      const classification = await callLLMForParsing(
        "You are a document classifier. Respond with ONLY valid JSON.",
        CLASSIFY_PROMPT + `\n\nFILENAME: ${filename}`,
        messageContent,
        hasImage
      );
      docType = classification.documentType as AdditionalDocumentType;
      console.log("[AdditionalDocImport] Auto-detected type:", docType);
    }

    // Route to specific parser
    switch (docType) {
      case "product_spec_sheet": {
        const result = await parseSpecSheet(fileUrl, filename);
        return {
          success: result.success,
          documentType: "product_spec_sheet",
          spec: result.spec,
          error: result.error,
        };
      }
      case "certification": {
        const result = await parseCertification(fileUrl, filename);
        return {
          success: result.success,
          documentType: "certification",
          certification: result.certification,
          error: result.error,
        };
      }
      case "sds_msds": {
        const result = await parseSds(fileUrl, filename);
        return {
          success: result.success,
          documentType: "sds_msds",
          sds: result.sds,
          error: result.error,
        };
      }
      case "freight_quote": {
        const result = await parseFreightQuote(fileUrl, filename);
        return {
          success: result.success,
          documentType: "freight_quote",
          freightQuote: result.quote,
          error: result.error,
        };
      }
      case "airway_bill":
      case "receipt":
      case "shipping_label": {
        const result = await parseShippingDocument(fileUrl, filename);
        return {
          success: result.success,
          documentType: result.documentType,
          shippingDocument: result.document,
          error: result.error,
        };
      }
      case "phytosanitary_certificate":
      case "fumigation_certificate":
      case "insurance_certificate":
      case "import_license":
      case "export_license":
      case "weight_certificate":
      case "inspection_certificate": {
        const result = await parseCustomsCertificate(fileUrl, filename);
        return {
          success: result.success,
          documentType: result.certificate?.documentType || docType,
          customsCertificate: result.certificate,
          error: result.error,
        };
      }
      default:
        return { success: false, documentType: "unknown", error: `Unknown document type: ${docType}` };
    }
  } catch (error) {
    console.error("[AdditionalDocImport] Parse error:", error);
    return {
      success: false,
      documentType: "unknown",
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

export async function importAdditionalDocument(
  parseResult: AdditionalDocParseResult,
  userId: number
): Promise<{
  success: boolean;
  documentType: string;
  createdRecords: { type: string; id: number; name: string }[];
  updatedRecords: { type: string; id: number; name: string; changes: string }[];
  warnings: string[];
  error?: string;
}> {
  switch (parseResult.documentType) {
    case "product_spec_sheet":
      if (!parseResult.spec) return { success: false, documentType: "product_spec_sheet", createdRecords: [], updatedRecords: [], warnings: [], error: "No spec data" };
      return { ...(await importSpecSheet(parseResult.spec, userId)), documentType: "product_spec_sheet" };

    case "certification":
      if (!parseResult.certification) return { success: false, documentType: "certification", createdRecords: [], updatedRecords: [], warnings: [], error: "No certification data" };
      return { ...(await importCertification(parseResult.certification, userId)), documentType: "certification" };

    case "sds_msds":
      if (!parseResult.sds) return { success: false, documentType: "sds_msds", createdRecords: [], updatedRecords: [], warnings: [], error: "No SDS data" };
      return { ...(await importSds(parseResult.sds, userId)), documentType: "sds_msds" };

    case "freight_quote":
      if (!parseResult.freightQuote) return { success: false, documentType: "freight_quote", createdRecords: [], updatedRecords: [], warnings: [], error: "No freight quote data" };
      return { ...(await importFreightQuote(parseResult.freightQuote, userId)), documentType: "freight_quote" };

    case "airway_bill":
    case "receipt":
    case "shipping_label":
      if (!parseResult.shippingDocument) return { success: false, documentType: parseResult.documentType, createdRecords: [], updatedRecords: [], warnings: [], error: "No shipping document data" };
      return { ...(await importShippingDocument(parseResult.shippingDocument, userId)), documentType: parseResult.documentType };

    case "phytosanitary_certificate":
    case "fumigation_certificate":
    case "insurance_certificate":
    case "import_license":
    case "export_license":
    case "weight_certificate":
    case "inspection_certificate":
      if (!parseResult.customsCertificate) return { success: false, documentType: parseResult.documentType, createdRecords: [], updatedRecords: [], warnings: [], error: "No customs certificate data" };
      return { ...(await importCustomsCertificate(parseResult.customsCertificate, userId)), documentType: parseResult.documentType };

    default:
      return { success: false, documentType: "unknown", createdRecords: [], updatedRecords: [], warnings: [], error: "Unknown document type" };
  }
}

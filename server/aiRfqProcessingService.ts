import { invokeLLM } from "./_core/llm";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "./_core/email";
import * as db from "./db";

// ============================================
// TYPES
// ============================================

export type RfqType = "vendor_rfq" | "freight_rfq" | "vendor_quote" | "freight_quote" | "rfq_question" | "general_inquiry";

export type RfqPriority = "urgent" | "high" | "medium" | "low";

export interface RfqClassification {
  rfqType: RfqType;
  confidence: number;
  priority: RfqPriority;
  isQuestion: boolean;
  questionTopics: string[];
  extractedRfqNumber?: string;
  matchedVendorId?: number;
  matchedCarrierId?: number;
  matchedRfqId?: number;
  summary: string;
}

export interface ExtractedRfqData {
  // Requester info
  requesterName?: string;
  requesterEmail?: string;
  requesterCompany?: string;

  // Material/product details
  materialName?: string;
  materialDescription?: string;
  quantity?: number;
  unit?: string;
  specifications?: string;

  // Delivery
  requiredDeliveryDate?: string;
  deliveryLocation?: string;
  incoterms?: string;

  // Freight-specific
  originCity?: string;
  originCountry?: string;
  destinationCity?: string;
  destinationCountry?: string;
  cargoType?: string;
  totalWeight?: number;
  totalVolume?: number;
  shippingMode?: string;

  // Pricing seen in quotes
  unitPrice?: number;
  totalPrice?: number;
  currency?: string;
  leadTimeDays?: number;
  validUntil?: string;
  paymentTerms?: string;

  // Identifiers
  rfqNumber?: string;
  quoteNumber?: string;

  // Questions detected
  questions: string[];
}

export interface RfqProcessingResult {
  success: boolean;
  emailId: number;
  classification: RfqClassification;
  extractedData: ExtractedRfqData;
  createdRecords: {
    vendorRfqId?: number;
    vendorQuoteId?: number;
    freightRfqId?: number;
    freightQuoteId?: number;
    rfqEmailId?: number;
  };
  suggestedReply?: {
    subject: string;
    body: string;
    confidence: number;
  };
  error?: string;
}

export interface RfqSortResult {
  id: number;
  emailId: number;
  rfqType: RfqType;
  priority: RfqPriority;
  subject: string;
  fromEmail: string;
  fromName?: string;
  summary: string;
  hasQuestions: boolean;
  questionCount: number;
  matchedRfqNumber?: string;
  matchedVendorName?: string;
  receivedAt: Date;
  status: "new" | "processed" | "replied" | "needs_review";
  confidence: number;
}

// ============================================
// CLASSIFICATION
// ============================================

/**
 * Classify an incoming email to determine if it's an RFQ, quote, or question
 */
export async function classifyRfqEmail(
  subject: string,
  body: string,
  fromEmail: string,
  fromName?: string
): Promise<RfqClassification> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert at classifying business emails related to Requests for Quotes (RFQs) and vendor/freight quotes for a supply chain ERP system. Analyze the email and classify it precisely.

Classification types:
- vendor_rfq: An incoming request asking us to provide a quote for materials/products
- freight_rfq: An incoming request asking for freight/shipping quotes
- vendor_quote: A vendor responding with pricing/quote for materials we requested
- freight_quote: A carrier/forwarder responding with freight/shipping pricing
- rfq_question: A question or clarification related to an existing RFQ or quote
- general_inquiry: General business inquiry that may lead to an RFQ

Always respond with valid JSON.`,
        },
        {
          role: "user",
          content: `Classify this email:

From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}
Subject: ${subject}

Body (first 4000 chars):
${body?.substring(0, 4000) || "(empty)"}

Return JSON:
{
  "rfqType": "vendor_rfq|freight_rfq|vendor_quote|freight_quote|rfq_question|general_inquiry",
  "confidence": 85,
  "priority": "urgent|high|medium|low",
  "isQuestion": false,
  "questionTopics": ["pricing", "delivery timeline"],
  "extractedRfqNumber": "RFQ-000123 or null",
  "summary": "Brief 1-2 sentence summary of the email content"
}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rfq_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              rfqType: { type: "string" },
              confidence: { type: "number" },
              priority: { type: "string" },
              isQuestion: { type: "boolean" },
              questionTopics: { type: "array", items: { type: "string" } },
              extractedRfqNumber: { type: "string" },
              summary: { type: "string" },
            },
            required: ["rfqType", "confidence", "priority", "isQuestion", "questionTopics", "summary"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return getDefaultClassification();
    }

    const parsed = JSON.parse(content);

    // Try to match vendor/carrier by email
    let matchedVendorId: number | undefined;
    let matchedCarrierId: number | undefined;

    const vendors = await db.getVendors();
    const matchedVendor = vendors.find(
      (v) => v.email?.toLowerCase() === fromEmail.toLowerCase()
    );
    if (matchedVendor) {
      matchedVendorId = matchedVendor.id;
    }

    if (parsed.rfqType === "freight_quote" || parsed.rfqType === "freight_rfq") {
      const carriers = await db.getFreightCarriers();
      const matchedCarrier = carriers.find(
        (c) => c.email?.toLowerCase() === fromEmail.toLowerCase()
      );
      if (matchedCarrier) {
        matchedCarrierId = matchedCarrier.id;
      }
    }

    // Try to match existing RFQ by number
    let matchedRfqId: number | undefined;
    if (parsed.extractedRfqNumber) {
      const vendorRfqs = await db.getVendorRfqs();
      const matchedVRfq = vendorRfqs.find(
        (r) => r.rfqNumber === parsed.extractedRfqNumber
      );
      if (matchedVRfq) {
        matchedRfqId = matchedVRfq.id;
      } else {
        const freightRfqs = await db.getFreightRfqs();
        const matchedFRfq = freightRfqs.find(
          (r) => r.rfqNumber === parsed.extractedRfqNumber
        );
        if (matchedFRfq) {
          matchedRfqId = matchedFRfq.id;
        }
      }
    }

    return {
      rfqType: validateRfqType(parsed.rfqType),
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
      priority: validatePriority(parsed.priority),
      isQuestion: parsed.isQuestion || false,
      questionTopics: parsed.questionTopics || [],
      extractedRfqNumber: parsed.extractedRfqNumber || undefined,
      matchedVendorId,
      matchedCarrierId,
      matchedRfqId,
      summary: parsed.summary || "",
    };
  } catch (error) {
    console.error("[AIRfqProcessing] Classification error:", error);
    return getDefaultClassification();
  }
}

// ============================================
// DATA EXTRACTION
// ============================================

/**
 * Extract structured RFQ/quote data from email content
 */
export async function extractRfqData(
  subject: string,
  body: string,
  fromEmail: string,
  classification: RfqClassification
): Promise<ExtractedRfqData> {
  try {
    const contextHint =
      classification.rfqType === "freight_rfq" || classification.rfqType === "freight_quote"
        ? "Focus on freight/shipping details: origin, destination, cargo, weight, volume, shipping mode, transit time."
        : "Focus on material/product details: name, specs, quantity, unit price, lead time, payment terms.";

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert at extracting structured data from business RFQ and quote emails. ${contextHint}

Extract all available data fields. For any field not mentioned in the email, use null.
Always respond with valid JSON.`,
        },
        {
          role: "user",
          content: `Extract data from this ${classification.rfqType} email:

From: ${fromEmail}
Subject: ${subject}

Body:
${body?.substring(0, 6000) || "(empty)"}

Return JSON with these fields (use null for missing):
{
  "requesterName": "string or null",
  "requesterEmail": "string or null",
  "requesterCompany": "string or null",
  "materialName": "string or null",
  "materialDescription": "string or null",
  "quantity": 0,
  "unit": "string or null",
  "specifications": "string or null",
  "requiredDeliveryDate": "YYYY-MM-DD or null",
  "deliveryLocation": "string or null",
  "incoterms": "string or null",
  "originCity": "string or null",
  "originCountry": "string or null",
  "destinationCity": "string or null",
  "destinationCountry": "string or null",
  "cargoType": "string or null",
  "totalWeight": 0,
  "totalVolume": 0,
  "shippingMode": "string or null",
  "unitPrice": 0,
  "totalPrice": 0,
  "currency": "USD",
  "leadTimeDays": 0,
  "validUntil": "YYYY-MM-DD or null",
  "paymentTerms": "string or null",
  "rfqNumber": "string or null",
  "quoteNumber": "string or null",
  "questions": ["Any questions found in the email"]
}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rfq_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              requesterName: { type: "string" },
              requesterEmail: { type: "string" },
              requesterCompany: { type: "string" },
              materialName: { type: "string" },
              materialDescription: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              specifications: { type: "string" },
              requiredDeliveryDate: { type: "string" },
              deliveryLocation: { type: "string" },
              incoterms: { type: "string" },
              originCity: { type: "string" },
              originCountry: { type: "string" },
              destinationCity: { type: "string" },
              destinationCountry: { type: "string" },
              cargoType: { type: "string" },
              totalWeight: { type: "number" },
              totalVolume: { type: "number" },
              shippingMode: { type: "string" },
              unitPrice: { type: "number" },
              totalPrice: { type: "number" },
              currency: { type: "string" },
              leadTimeDays: { type: "number" },
              validUntil: { type: "string" },
              paymentTerms: { type: "string" },
              rfqNumber: { type: "string" },
              quoteNumber: { type: "string" },
              questions: { type: "array", items: { type: "string" } },
            },
            required: ["questions"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { questions: [] };
    }

    const parsed = JSON.parse(content);
    return {
      ...parsed,
      // Ensure questions is always an array
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    };
  } catch (error) {
    console.error("[AIRfqProcessing] Extraction error:", error);
    return { questions: [] };
  }
}

// ============================================
// QUESTION REPLY GENERATION
// ============================================

/**
 * Generate an intelligent reply to questions found in an RFQ/quote email
 */
export async function generateRfqReply(
  originalEmail: { from: string; subject: string; body: string },
  classification: RfqClassification,
  extractedData: ExtractedRfqData,
  companyContext?: { companyName?: string; senderName?: string }
): Promise<{ subject: string; body: string; confidence: number }> {
  try {
    // Gather context from existing records
    let contextInfo = "";

    if (classification.matchedVendorId) {
      const vendor = await db.getVendorById(classification.matchedVendorId);
      if (vendor) {
        contextInfo += `\nKnown Vendor: ${vendor.name}, Lead Time: ${vendor.defaultLeadTimeDays || "N/A"} days`;
      }
    }

    if (classification.matchedRfqId) {
      if (classification.rfqType.includes("freight")) {
        const rfq = await db.getFreightRfqById(classification.matchedRfqId);
        if (rfq) {
          contextInfo += `\nRelated Freight RFQ: ${rfq.rfqNumber} - ${rfq.title}, Status: ${rfq.status}`;
          const quotes = await db.getFreightQuotes(rfq.id);
          if (quotes.length > 0) {
            contextInfo += `\nQuotes received: ${quotes.length}`;
          }
        }
      } else {
        const rfq = await db.getVendorRfqById(classification.matchedRfqId);
        if (rfq) {
          contextInfo += `\nRelated Vendor RFQ: ${rfq.rfqNumber} - ${rfq.materialName}, Status: ${rfq.status}`;
          const quotes = await db.getVendorQuotes({ rfqId: rfq.id });
          if (quotes.length > 0) {
            contextInfo += `\nQuotes received: ${quotes.length}`;
          }
        }
      }
    }

    // Get recent vendor RFQs and freight RFQs for additional context
    const recentVendorRfqs = await db.getVendorRfqs();
    const recentFreightRfqs = await db.getFreightRfqs();
    const activeVendorRfqs = recentVendorRfqs
      .filter((r) => ["sent", "partially_received"].includes(r.status))
      .slice(0, 5);
    const activeFreightRfqs = recentFreightRfqs
      .filter((r) => ["sent", "awaiting_quotes"].includes(r.status))
      .slice(0, 5);

    if (activeVendorRfqs.length > 0) {
      contextInfo += `\n\nActive Vendor RFQs: ${activeVendorRfqs.map((r) => `${r.rfqNumber} (${r.materialName})`).join(", ")}`;
    }
    if (activeFreightRfqs.length > 0) {
      contextInfo += `\nActive Freight RFQs: ${activeFreightRfqs.map((r) => `${r.rfqNumber} (${r.title})`).join(", ")}`;
    }

    const senderName = companyContext?.senderName || "Procurement Team";
    const companyName = companyContext?.companyName || "Our Company";

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a professional procurement and supply chain specialist replying to RFQ/quote-related emails on behalf of ${companyName}. You reply as ${senderName}.

Guidelines:
- Be professional, clear, and concise
- Answer specific questions with accurate information from the context provided
- If a question cannot be answered from the available context, acknowledge it and say you'll follow up
- For quote responses: acknowledge receipt and mention next steps (review, comparison, decision timeline)
- For RFQ requests: acknowledge and provide estimated response timeline
- For clarifications: provide clear, helpful answers
- Always include a professional closing

Respond with JSON.`,
        },
        {
          role: "user",
          content: `Generate a reply to this ${classification.rfqType} email:

From: ${originalEmail.from}
Subject: ${originalEmail.subject}
Body:
${originalEmail.body?.substring(0, 4000)}

Questions detected: ${extractedData.questions.length > 0 ? extractedData.questions.join("\n- ") : "None"}

Business Context:${contextInfo || " No specific context available"}

Generate reply JSON:
{
  "subject": "Re: original subject",
  "body": "Full email reply body in plain text",
  "confidence": 85
}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rfq_reply",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["subject", "body", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return {
        subject: `Re: ${originalEmail.subject}`,
        body: "Thank you for your email. We have received your inquiry and our team will review it shortly.",
        confidence: 30,
      };
    }

    return JSON.parse(content);
  } catch (error) {
    console.error("[AIRfqProcessing] Reply generation error:", error);
    return {
      subject: `Re: ${originalEmail.subject}`,
      body: "Thank you for your email. We have received your inquiry and our team will review it shortly.",
      confidence: 20,
    };
  }
}

// ============================================
// RECORD CREATION
// ============================================

/**
 * Create appropriate database records based on classification and extracted data
 */
async function createRecordsFromExtraction(
  emailId: number,
  classification: RfqClassification,
  extractedData: ExtractedRfqData,
  fromEmail: string,
  subject: string,
  body: string
): Promise<RfqProcessingResult["createdRecords"]> {
  const records: RfqProcessingResult["createdRecords"] = {};

  try {
    switch (classification.rfqType) {
      case "vendor_quote": {
        // A vendor is sending us a quote in response to our RFQ
        if (classification.matchedRfqId && classification.matchedVendorId) {
          const quote = await db.createVendorQuote({
            rfqId: classification.matchedRfqId,
            vendorId: classification.matchedVendorId,
            quoteNumber: extractedData.quoteNumber || undefined,
            status: "received",
            unitPrice: extractedData.unitPrice ? String(extractedData.unitPrice) : undefined,
            totalPrice: extractedData.totalPrice ? String(extractedData.totalPrice) : undefined,
            currency: extractedData.currency || "USD",
            leadTimeDays: extractedData.leadTimeDays || undefined,
            paymentTerms: extractedData.paymentTerms || undefined,
            validUntil: extractedData.validUntil ? new Date(extractedData.validUntil) : undefined,
            receivedVia: "email",
            rawEmailContent: body?.substring(0, 10000),
            notes: classification.summary,
          } as any);
          records.vendorQuoteId = quote.id;

          // Update RFQ status
          await db.updateVendorRfq(classification.matchedRfqId, {
            status: "partially_received",
          } as any);
        }

        // Log the email
        const rfqEmail = await db.createVendorRfqEmail({
          rfqId: classification.matchedRfqId || undefined,
          vendorId: classification.matchedVendorId || undefined,
          quoteId: records.vendorQuoteId || undefined,
          direction: "inbound",
          emailType: "quote_response",
          fromEmail,
          subject,
          body: body?.substring(0, 10000),
          aiParsed: true,
          aiExtractedData: JSON.stringify(extractedData),
          sendStatus: "delivered",
        } as any);
        records.rfqEmailId = rfqEmail.id;
        break;
      }

      case "freight_quote": {
        // A carrier is sending us a freight quote
        if (classification.matchedRfqId && classification.matchedCarrierId) {
          const quote = await db.createFreightQuote({
            rfqId: classification.matchedRfqId,
            carrierId: classification.matchedCarrierId,
            quoteNumber: extractedData.quoteNumber || undefined,
            status: "received",
            totalCost: extractedData.totalPrice ? String(extractedData.totalPrice) : undefined,
            currency: extractedData.currency || "USD",
            transitDays: extractedData.leadTimeDays || undefined,
            shippingMode: extractedData.shippingMode || undefined,
            validUntil: extractedData.validUntil ? new Date(extractedData.validUntil) : undefined,
            receivedVia: "email",
            rawEmailContent: body?.substring(0, 10000),
            notes: classification.summary,
          } as any);
          records.freightQuoteId = quote.id;

          // Update RFQ status
          await db.updateFreightRfq(classification.matchedRfqId, {
            status: "quotes_received",
          } as any);
        }

        // Log the freight email
        const freightEmail = await db.createFreightEmail({
          rfqId: classification.matchedRfqId || undefined,
          carrierId: classification.matchedCarrierId || undefined,
          direction: "inbound",
          emailType: "quote_response",
          fromEmail,
          subject,
          body: body?.substring(0, 10000),
          aiParsed: true,
          aiExtractedData: JSON.stringify(extractedData),
          status: "read",
        } as any);
        records.rfqEmailId = freightEmail.id;
        break;
      }

      case "vendor_rfq": {
        // Someone is requesting a quote from us
        const rfqNumber = await db.generateVendorRfqNumber();
        const rfq = await db.createVendorRfq({
          rfqNumber,
          materialName: extractedData.materialName || subject,
          materialDescription: extractedData.materialDescription || undefined,
          quantity: extractedData.quantity ? String(extractedData.quantity) : "0",
          unit: extractedData.unit || "units",
          specifications: extractedData.specifications || undefined,
          requiredDeliveryDate: extractedData.requiredDeliveryDate
            ? new Date(extractedData.requiredDeliveryDate)
            : undefined,
          deliveryLocation: extractedData.deliveryLocation || undefined,
          incoterms: extractedData.incoterms || undefined,
          status: "sent",
          priority: classification.priority === "urgent" ? "urgent" : classification.priority === "high" ? "high" : "normal",
          notes: `Auto-created from incoming email: ${fromEmail}\n\n${classification.summary}`,
        } as any);
        records.vendorRfqId = rfq.id;

        const rfqEmail = await db.createVendorRfqEmail({
          rfqId: rfq.id,
          direction: "inbound",
          emailType: "rfq_request",
          fromEmail,
          subject,
          body: body?.substring(0, 10000),
          aiParsed: true,
          aiExtractedData: JSON.stringify(extractedData),
          sendStatus: "delivered",
        } as any);
        records.rfqEmailId = rfqEmail.id;
        break;
      }

      case "freight_rfq": {
        // Someone is requesting freight quotes
        const rfq = await db.createFreightRfq({
          title: extractedData.materialDescription || subject,
          status: "draft",
          originCity: extractedData.originCity || undefined,
          originCountry: extractedData.originCountry || undefined,
          destinationCity: extractedData.destinationCity || undefined,
          destinationCountry: extractedData.destinationCountry || undefined,
          cargoDescription: extractedData.materialDescription || extractedData.specifications || undefined,
          cargoType: (extractedData.cargoType as any) || "general",
          totalWeight: extractedData.totalWeight ? String(extractedData.totalWeight) : undefined,
          totalVolume: extractedData.totalVolume ? String(extractedData.totalVolume) : undefined,
          preferredMode: (extractedData.shippingMode as any) || "any",
          requiredDeliveryDate: extractedData.requiredDeliveryDate
            ? new Date(extractedData.requiredDeliveryDate)
            : undefined,
          incoterms: extractedData.incoterms || undefined,
          notes: `Auto-created from incoming email: ${fromEmail}\n\n${classification.summary}`,
        } as any);
        records.freightRfqId = rfq.id;

        const freightEmail = await db.createFreightEmail({
          rfqId: rfq.id,
          direction: "inbound",
          emailType: "rfq_request",
          fromEmail,
          subject,
          body: body?.substring(0, 10000),
          aiParsed: true,
          aiExtractedData: JSON.stringify(extractedData),
          status: "read",
        } as any);
        records.rfqEmailId = freightEmail.id;
        break;
      }

      case "rfq_question": {
        // Log question email against the matched RFQ
        if (classification.matchedRfqId) {
          const rfqEmail = await db.createVendorRfqEmail({
            rfqId: classification.matchedRfqId,
            vendorId: classification.matchedVendorId || undefined,
            direction: "inbound",
            emailType: "clarification",
            fromEmail,
            subject,
            body: body?.substring(0, 10000),
            aiParsed: true,
            aiExtractedData: JSON.stringify(extractedData),
            sendStatus: "delivered",
          } as any);
          records.rfqEmailId = rfqEmail.id;
        }
        break;
      }

      default:
        // general_inquiry - no records created, just logged
        break;
    }
  } catch (error) {
    console.error("[AIRfqProcessing] Record creation error:", error);
  }

  return records;
}

// ============================================
// MAIN PROCESSING PIPELINE
// ============================================

/**
 * Process a single inbound email through the AI RFQ pipeline:
 * 1. Classify the email type
 * 2. Extract structured data
 * 3. Create/update database records
 * 4. Generate suggested reply if questions detected
 */
export async function processRfqEmail(
  emailId: number,
  companyContext?: { companyName?: string; senderName?: string }
): Promise<RfqProcessingResult> {
  try {
    // Fetch the email
    const email = await db.getInboundEmailById(emailId);
    if (!email) {
      return {
        success: false,
        emailId,
        classification: getDefaultClassification(),
        extractedData: { questions: [] },
        createdRecords: {},
        error: "Email not found",
      };
    }

    const subject = email.subject || "(no subject)";
    const body = email.bodyText || email.bodyHtml || "";
    const fromEmail = email.fromEmail;
    const fromName = email.fromName || undefined;

    // Step 1: Classify
    console.log(`[AIRfqProcessing] Classifying email #${emailId}: "${subject}"`);
    const classification = await classifyRfqEmail(subject, body, fromEmail, fromName);

    // Step 2: Extract data
    console.log(`[AIRfqProcessing] Extracting data (type: ${classification.rfqType}, confidence: ${classification.confidence})`);
    const extractedData = await extractRfqData(subject, body, fromEmail, classification);

    // Step 3: Create records
    console.log(`[AIRfqProcessing] Creating records...`);
    const createdRecords = await createRecordsFromExtraction(
      emailId,
      classification,
      extractedData,
      fromEmail,
      subject,
      body
    );

    // Step 4: Generate reply if questions detected or it's a quote/RFQ that needs acknowledgment
    let suggestedReply: RfqProcessingResult["suggestedReply"];
    if (
      classification.isQuestion ||
      extractedData.questions.length > 0 ||
      classification.rfqType === "vendor_quote" ||
      classification.rfqType === "freight_quote" ||
      classification.rfqType === "vendor_rfq"
    ) {
      console.log(`[AIRfqProcessing] Generating reply...`);
      suggestedReply = await generateRfqReply(
        { from: fromEmail, subject, body },
        classification,
        extractedData,
        companyContext
      );
    }

    // Update the inbound email with categorization
    await db.updateInboundEmail(emailId, {
      parsingStatus: "parsed",
      category: classification.rfqType.includes("freight") ? "freight_quote" : "purchase_order",
      priority: classification.priority,
      suggestedAction: classification.summary,
    } as any);

    console.log(`[AIRfqProcessing] Successfully processed email #${emailId}`);

    return {
      success: true,
      emailId,
      classification,
      extractedData,
      createdRecords,
      suggestedReply,
    };
  } catch (error) {
    console.error(`[AIRfqProcessing] Error processing email #${emailId}:`, error);
    return {
      success: false,
      emailId,
      classification: getDefaultClassification(),
      extractedData: { questions: [] },
      createdRecords: {},
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Batch process unprocessed RFQ/quote emails
 */
export async function processRfqEmailBatch(
  limit: number = 10,
  companyContext?: { companyName?: string; senderName?: string }
): Promise<{ processed: number; results: RfqProcessingResult[] }> {
  // Get unprocessed emails that look like RFQs/quotes
  const emails = await db.getInboundEmails({
    status: "pending",
    limit,
  });

  const results: RfqProcessingResult[] = [];

  for (const email of emails) {
    // Quick pre-filter: check if subject suggests RFQ/quote relevance
    const subjectLower = (email.subject || "").toLowerCase();
    const isLikelyRfq =
      subjectLower.includes("rfq") ||
      subjectLower.includes("quote") ||
      subjectLower.includes("pricing") ||
      subjectLower.includes("request for") ||
      subjectLower.includes("bid") ||
      subjectLower.includes("proposal") ||
      subjectLower.includes("freight") ||
      subjectLower.includes("shipping rate") ||
      subjectLower.includes("cost estimate");

    if (isLikelyRfq) {
      const result = await processRfqEmail(email.id, companyContext);
      results.push(result);
    }
  }

  return { processed: results.length, results };
}

/**
 * Get a sorted, prioritized view of all RFQ-related items
 */
export async function getSortedRfqItems(): Promise<RfqSortResult[]> {
  const items: RfqSortResult[] = [];

  // Get vendor RFQs with their emails
  const vendorRfqs = await db.getVendorRfqs();
  for (const rfq of vendorRfqs) {
    const emails = await db.getVendorRfqEmails({ rfqId: rfq.id, direction: "inbound" });
    const quotes = await db.getVendorQuotes({ rfqId: rfq.id });
    const hasUnansweredQuestions = emails.some((e) => e.emailType === "clarification");

    items.push({
      id: rfq.id,
      emailId: 0,
      rfqType: "vendor_rfq",
      priority: (rfq.priority as RfqPriority) || "medium",
      subject: `${rfq.rfqNumber} - ${rfq.materialName}`,
      fromEmail: "",
      summary: `${rfq.materialName} - ${rfq.quantity} ${rfq.unit}. ${quotes.length} quotes received.`,
      hasQuestions: hasUnansweredQuestions,
      questionCount: emails.filter((e) => e.emailType === "clarification").length,
      matchedRfqNumber: rfq.rfqNumber,
      receivedAt: rfq.createdAt,
      status: rfq.status === "draft" ? "new" : quotes.length > 0 ? "processed" : "needs_review",
      confidence: 100,
    });
  }

  // Get freight RFQs
  const freightRfqs = await db.getFreightRfqs();
  for (const rfq of freightRfqs) {
    const quotes = await db.getFreightQuotes(rfq.id);

    items.push({
      id: rfq.id,
      emailId: 0,
      rfqType: "freight_rfq",
      priority: rfq.status === "awaiting_quotes" ? "high" : "medium",
      subject: `${rfq.rfqNumber} - ${rfq.title}`,
      fromEmail: "",
      summary: `${rfq.originCity || "?"} → ${rfq.destinationCity || "?"}, ${rfq.cargoDescription || "cargo"}. ${quotes.length} quotes.`,
      hasQuestions: false,
      questionCount: 0,
      matchedRfqNumber: rfq.rfqNumber,
      receivedAt: rfq.createdAt,
      status: rfq.status === "draft" ? "new" : quotes.length > 0 ? "processed" : "needs_review",
      confidence: 100,
    });
  }

  // Get recent inbound emails that are RFQ-related (parsed with category)
  const inboundEmails = await db.getInboundEmails({ limit: 50 });
  for (const email of inboundEmails) {
    const category = email.category || "";
    if (
      category === "freight_quote" ||
      category === "purchase_order" ||
      (email.subject || "").toLowerCase().includes("rfq") ||
      (email.subject || "").toLowerCase().includes("quote")
    ) {
      // Avoid duplicates - check if we already have this via RFQ records
      const alreadyTracked = items.some(
        (i) => i.subject.includes(email.subject || "impossible_match")
      );
      if (!alreadyTracked) {
        items.push({
          id: email.id,
          emailId: email.id,
          rfqType: category === "freight_quote" ? "freight_quote" : "vendor_quote",
          priority: (email.priority as RfqPriority) || "medium",
          subject: email.subject || "(no subject)",
          fromEmail: email.fromEmail,
          fromName: email.fromName || undefined,
          summary: email.suggestedAction || "Incoming RFQ/quote email",
          hasQuestions: false,
          questionCount: 0,
          receivedAt: email.receivedAt,
          status: email.parsingStatus === "parsed" ? "processed" : "new",
          confidence: Number(email.categoryConfidence) || 50,
        });
      }
    }
  }

  // Sort: urgent first, then high, then by date (newest first)
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => {
    const priorityDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
  });

  return items;
}

/**
 * Send a reply for an RFQ email (after user review/approval)
 */
export async function sendRfqReply(params: {
  toEmail: string;
  subject: string;
  body: string;
  rfqType: RfqType;
  relatedRfqId?: number;
  relatedQuoteId?: number;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isEmailConfigured()) {
    return { success: false, error: "Email service not configured" };
  }

  const result = await sendEmail({
    to: params.toEmail,
    subject: params.subject,
    html: formatEmailHtml(params.body),
  });

  if (result.success) {
    // Log the sent reply
    if (params.rfqType.includes("freight")) {
      await db.createFreightEmail({
        rfqId: params.relatedRfqId || undefined,
        direction: "outbound",
        emailType: "clarification",
        toEmail: params.toEmail,
        subject: params.subject,
        body: params.body,
        aiGenerated: true,
        status: "sent",
        sentAt: new Date(),
      } as any);
    } else {
      await db.createVendorRfqEmail({
        rfqId: params.relatedRfqId || undefined,
        quoteId: params.relatedQuoteId || undefined,
        direction: "outbound",
        emailType: "clarification",
        toEmail: params.toEmail,
        subject: params.subject,
        body: params.body,
        aiGenerated: true,
        sendStatus: "sent",
        sentAt: new Date(),
      } as any);
    }
  }

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  };
}

// ============================================
// HELPERS
// ============================================

function validateRfqType(type: string): RfqType {
  const valid: RfqType[] = [
    "vendor_rfq",
    "freight_rfq",
    "vendor_quote",
    "freight_quote",
    "rfq_question",
    "general_inquiry",
  ];
  return valid.includes(type as RfqType) ? (type as RfqType) : "general_inquiry";
}

function validatePriority(priority: string): RfqPriority {
  const valid: RfqPriority[] = ["urgent", "high", "medium", "low"];
  return valid.includes(priority as RfqPriority) ? (priority as RfqPriority) : "medium";
}

function getDefaultClassification(): RfqClassification {
  return {
    rfqType: "general_inquiry",
    confidence: 30,
    priority: "medium",
    isQuestion: false,
    questionTopics: [],
    summary: "Could not classify email",
  };
}

import { invokeLLM } from "./_core/llm";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "./_core/email";
import * as db from "./db";

export interface EmailContext {
  originalEmail: {
    from: string;
    subject: string;
    body: string;
    receivedAt?: Date;
  };
  relatedData?: {
    vendor?: any;
    customer?: any;
    purchaseOrder?: any;
    invoice?: any;
    product?: any;
  };
  companyContext?: {
    companyName: string;
    senderName: string;
    senderTitle?: string;
  };
}

export interface GeneratedReply {
  subject: string;
  body: string;
  tone: "professional" | "friendly" | "formal" | "urgent";
  confidence: number;
  suggestedActions?: string[];
}

/**
 * Analyze an email to determine its intent and extract key information
 */
export async function analyzeEmail(email: { from: string; subject: string; body: string }): Promise<{
  intent: string;
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  category: "inquiry" | "complaint" | "order" | "quote_request" | "follow_up" | "general";
  extractedEntities: {
    poNumbers?: string[];
    invoiceNumbers?: string[];
    productNames?: string[];
    dates?: string[];
    amounts?: string[];
  };
  suggestedPriority: "low" | "medium" | "high" | "urgent";
}> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an email analysis assistant for an ERP system. Analyze the incoming email and extract key information.
        
Your task is to:
1. Determine the sender's intent (what they want)
2. Assess the sentiment (positive, neutral, negative, urgent)
3. Categorize the email type
4. Extract any business entities mentioned (PO numbers, invoice numbers, product names, dates, amounts)
5. Suggest a priority level for response

Respond in JSON format only.`,
      },
      {
        role: "user",
        content: `Analyze this email:

From: ${email.from}
Subject: ${email.subject}

Body:
${email.body}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            intent: { type: "string", description: "The main intent of the email" },
            sentiment: { type: "string", enum: ["positive", "neutral", "negative", "urgent"] },
            category: { type: "string", enum: ["inquiry", "complaint", "order", "quote_request", "follow_up", "general"] },
            extractedEntities: {
              type: "object",
              properties: {
                poNumbers: { type: "array", items: { type: "string" } },
                invoiceNumbers: { type: "array", items: { type: "string" } },
                productNames: { type: "array", items: { type: "string" } },
                dates: { type: "array", items: { type: "string" } },
                amounts: { type: "array", items: { type: "string" } },
              },
              required: ["poNumbers", "invoiceNumbers", "productNames", "dates", "amounts"],
              additionalProperties: false,
            },
            suggestedPriority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          },
          required: ["intent", "sentiment", "category", "extractedEntities", "suggestedPriority"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content === "string") {
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  }
  throw new Error("Failed to analyze email");
}

/**
 * Generate an email reply using AI based on context
 */
export async function generateEmailReply(context: EmailContext): Promise<GeneratedReply> {
  const { originalEmail, relatedData, companyContext } = context;
  
  // Build context string from related data
  let contextInfo = "";
  if (relatedData?.vendor) {
    contextInfo += `\nVendor Info: ${relatedData.vendor.name}, Lead Time: ${relatedData.vendor.defaultLeadTimeDays} days`;
  }
  if (relatedData?.customer) {
    contextInfo += `\nCustomer Info: ${relatedData.customer.name}, Email: ${relatedData.customer.email}`;
  }
  if (relatedData?.purchaseOrder) {
    contextInfo += `\nPO Info: ${relatedData.purchaseOrder.poNumber}, Status: ${relatedData.purchaseOrder.status}, Total: $${relatedData.purchaseOrder.totalAmount}`;
  }
  if (relatedData?.invoice) {
    contextInfo += `\nInvoice Info: ${relatedData.invoice.invoiceNumber}, Status: ${relatedData.invoice.status}, Amount: $${relatedData.invoice.totalAmount}`;
  }

  const senderName = companyContext?.senderName || "Customer Service";
  const companyName = companyContext?.companyName || "Our Company";

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a professional email reply assistant for ${companyName}. Generate appropriate email replies that are:
- Professional and courteous
- Clear and concise
- Helpful and solution-oriented
- Appropriate in tone based on the original email's sentiment

You are replying on behalf of ${senderName}${companyContext?.senderTitle ? `, ${companyContext.senderTitle}` : ""}.

Always:
1. Acknowledge the sender's concern or request
2. Provide relevant information or next steps
3. Offer assistance for any follow-up questions
4. End with a professional closing

Respond in JSON format with the reply details.`,
      },
      {
        role: "user",
        content: `Generate a reply to this email:

Original Email:
From: ${originalEmail.from}
Subject: ${originalEmail.subject}
Body:
${originalEmail.body}

${contextInfo ? `\nRelevant Business Context:${contextInfo}` : ""}

Generate an appropriate reply.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_reply",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string", description: "Reply subject line (usually Re: original subject)" },
            body: { type: "string", description: "The full email reply body in plain text" },
            tone: { type: "string", enum: ["professional", "friendly", "formal", "urgent"] },
            confidence: { type: "number", description: "Confidence score 0-100 for the reply appropriateness" },
            suggestedActions: {
              type: "array",
              items: { type: "string" },
              description: "Any follow-up actions suggested based on the email",
            },
          },
          required: ["subject", "body", "tone", "confidence", "suggestedActions"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content === "string") {
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  }
  throw new Error("Failed to generate email reply");
}

/**
 * Generate and optionally send an email reply
 */
export async function processEmailReply(params: {
  originalEmail: {
    from: string;
    subject: string;
    body: string;
    emailId?: number;
  };
  autoSend?: boolean;
  companyName?: string;
  senderName?: string;
  senderTitle?: string;
}): Promise<{
  success: boolean;
  generatedReply: GeneratedReply;
  emailSent?: boolean;
  messageId?: string;
  error?: string;
}> {
  const { originalEmail, autoSend = false, companyName, senderName, senderTitle } = params;

  // First analyze the email
  const analysis = await analyzeEmail(originalEmail);
  
  // Fetch related data based on extracted entities
  let relatedData: EmailContext["relatedData"] = {};
  
  // Try to find vendor by email
  const vendors = await db.getVendors();
  const matchingVendor = vendors.find(v => 
    v.email?.toLowerCase() === originalEmail.from.toLowerCase()
  );
  if (matchingVendor) {
    relatedData.vendor = matchingVendor;
  }
  
  // Try to find customer by email
  const customers = await db.getCustomers();
  const matchingCustomer = customers.find(c => 
    c.email?.toLowerCase() === originalEmail.from.toLowerCase()
  );
  if (matchingCustomer) {
    relatedData.customer = matchingCustomer;
  }
  
  // Look up PO if mentioned
  if (analysis.extractedEntities.poNumbers?.length) {
    const pos = await db.getPurchaseOrders();
    const matchingPo = pos.find(po => 
      analysis.extractedEntities.poNumbers?.includes(po.poNumber)
    );
    if (matchingPo) {
      relatedData.purchaseOrder = matchingPo;
    }
  }
  
  // Look up invoice if mentioned
  if (analysis.extractedEntities.invoiceNumbers?.length) {
    const invoices = await db.getInvoices();
    const matchingInvoice = invoices.find(inv => 
      analysis.extractedEntities.invoiceNumbers?.includes(inv.invoiceNumber)
    );
    if (matchingInvoice) {
      relatedData.invoice = matchingInvoice;
    }
  }

  // Generate the reply
  const generatedReply = await generateEmailReply({
    originalEmail,
    relatedData,
    companyContext: {
      companyName: companyName || "Our Company",
      senderName: senderName || "Customer Service",
      senderTitle,
    },
  });

  // If auto-send is enabled and email is configured, send the reply
  if (autoSend && isEmailConfigured()) {
    const emailResult = await sendEmail({
      to: originalEmail.from,
      subject: generatedReply.subject,
      html: formatEmailHtml(generatedReply.body),
    });

    // Log the sent email
    console.log(`[EmailReply] ${emailResult.success ? 'Sent' : 'Failed'} reply to ${originalEmail.from}`, {
      emailId: originalEmail.emailId,
      subject: generatedReply.subject,
      messageId: emailResult.messageId,
      error: emailResult.error,
    });

    return {
      success: true,
      generatedReply,
      emailSent: emailResult.success,
      messageId: emailResult.messageId,
      error: emailResult.error,
    };
  }

  return {
    success: true,
    generatedReply,
    emailSent: false,
  };
}

/**
 * Quick reply templates for common scenarios
 */
export const replyTemplates = {
  acknowledgment: (senderName: string) => `
Dear Sender,

Thank you for your email. We have received your message and will respond within 24-48 business hours.

If your matter is urgent, please call our support line.

Best regards,
${senderName}
  `.trim(),

  orderConfirmation: (orderNumber: string, senderName: string) => `
Dear Customer,

Thank you for your order. Your order ${orderNumber} has been received and is being processed.

You will receive a shipping confirmation once your order has been dispatched.

Best regards,
${senderName}
  `.trim(),

  quoteRequest: (senderName: string) => `
Dear Valued Partner,

Thank you for your quote request. Our team is reviewing your requirements and will provide a detailed quote within 2-3 business days.

If you have any immediate questions, please don't hesitate to reach out.

Best regards,
${senderName}
  `.trim(),

  followUp: (reference: string, senderName: string) => `
Dear Sender,

Thank you for following up regarding ${reference}. We are actively working on this matter and will provide an update shortly.

We appreciate your patience.

Best regards,
${senderName}
  `.trim(),
};

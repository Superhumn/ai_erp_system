/**
 * Email Attachment OCR Processing
 * Extracts text and structured data from PDF/image attachments
 */

import { invokeLLM } from './llm';

export interface ExtractedAttachmentData {
  type: 'invoice' | 'receipt' | 'purchase_order' | 'shipping_document' | 'customs_document' | 'bill_of_lading' | 'packing_list' | 'credit_memo' | 'bank_statement' | 'sales_order' | 'contract' | 'quote' | 'term_sheet' | 'contact_card' | 'unknown';
  confidence: number;
  extractedText: string;
  structuredData: {
    // Common fields
    documentNumber?: string;
    documentDate?: string;
    totalAmount?: number;
    currency?: string;
    
    // Vendor/Supplier info
    vendorName?: string;
    vendorAddress?: string;
    vendorEmail?: string;
    vendorPhone?: string;
    
    // Customer/Buyer info
    customerName?: string;
    customerAddress?: string;
    
    // Line items
    lineItems?: Array<{
      description: string;
      quantity?: number;
      unitPrice?: number;
      total?: number;
      sku?: string;
    }>;
    
    // Shipping info
    trackingNumber?: string;
    carrier?: string;
    shipDate?: string;
    deliveryDate?: string;
    
    // Payment info
    paymentTerms?: string;
    dueDate?: string;
    paymentMethod?: string;
    
    // Customs/trade fields
    countryOfOrigin?: string;
    portOfEntry?: string;
    containerNumber?: string;
    hsCode?: string;

    // Contract fields
    contractType?: string;
    startDate?: string;
    endDate?: string;
    partyName?: string;

    // Bank statement fields
    accountNumber?: string;
    bankName?: string;
    statementPeriodStart?: string;
    statementPeriodEnd?: string;
    openingBalance?: number;
    closingBalance?: number;
    statementTransactions?: Array<{
      date: string;
      description: string;
      amount: number;
      type: string;
      reference?: string;
    }>;

    // Quote/proposal fields
    quoteNumber?: string;
    validUntil?: string;
    proposalTitle?: string;

    // Term sheet fields
    investmentAmount?: number;
    preMoneyValuation?: number;
    postMoneyValuation?: number;
    investorName?: string;
    roundType?: string;
    keyTerms?: string[];

    // Contact card fields
    contactFirstName?: string;
    contactLastName?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactOrganization?: string;
    contactJobTitle?: string;
    contactLinkedinUrl?: string;
    contactAddress?: string;

    // Additional fields
    poNumber?: string;
    invoiceNumber?: string;
    notes?: string;
  };
  rawOcrOutput?: string;
}

/**
 * Process an attachment and extract structured data using LLM vision
 */
export async function processAttachment(
  attachmentUrl: string,
  mimeType: string,
  fileName: string
): Promise<ExtractedAttachmentData> {
  // Determine if this is an image or PDF
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  
  if (!isImage && !isPdf) {
    return {
      type: 'unknown',
      confidence: 0,
      extractedText: '',
      structuredData: {},
    };
  }

  try {
    // Use LLM with vision to extract text and structure
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `You are a document processing assistant specialized in extracting structured data from business documents.
          
Analyze the provided document image/PDF and extract:
1. Document type (invoice, receipt, purchase_order, shipping_document, customs_document, bill_of_lading, packing_list, credit_memo, bank_statement, sales_order, contract, quote, term_sheet, contact_card, or unknown)
2. All visible text
3. Structured data including:
   - Document number, date, amounts
   - Vendor/supplier information
   - Customer/buyer information
   - Line items with descriptions, quantities, prices
   - Shipping/tracking information if present
   - Payment terms and due dates

Return your analysis in the specified JSON format.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Please analyze this document (${fileName}) and extract all relevant information.`
            },
            isPdf ? {
              type: 'file_url',
              file_url: {
                url: attachmentUrl,
                mime_type: 'application/pdf'
              }
            } : {
              type: 'image_url',
              image_url: {
                url: attachmentUrl,
                detail: 'high'
              }
            }
          ] as any
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              documentType: {
                type: 'string',
                enum: ['invoice', 'receipt', 'purchase_order', 'shipping_document', 'customs_document', 'bill_of_lading', 'packing_list', 'credit_memo', 'bank_statement', 'sales_order', 'contract', 'quote', 'term_sheet', 'contact_card', 'unknown'],
                description: 'The type of document'
              },
              confidence: {
                type: 'number',
                description: 'Confidence score 0-100'
              },
              extractedText: {
                type: 'string',
                description: 'All visible text from the document'
              },
              documentNumber: { type: 'string', description: 'Invoice/PO/Receipt number' },
              documentDate: { type: 'string', description: 'Document date in YYYY-MM-DD format' },
              totalAmount: { type: 'number', description: 'Total amount' },
              currency: { type: 'string', description: 'Currency code (USD, EUR, etc)' },
              vendorName: { type: 'string', description: 'Vendor/supplier company name' },
              vendorAddress: { type: 'string', description: 'Vendor address' },
              vendorEmail: { type: 'string', description: 'Vendor email' },
              vendorPhone: { type: 'string', description: 'Vendor phone' },
              customerName: { type: 'string', description: 'Customer/buyer name' },
              customerAddress: { type: 'string', description: 'Customer address' },
              lineItems: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    quantity: { type: 'number' },
                    unitPrice: { type: 'number' },
                    total: { type: 'number' },
                    sku: { type: 'string' }
                  },
                  required: ['description'],
                  additionalProperties: false
                },
                description: 'Line items from the document'
              },
              trackingNumber: { type: 'string', description: 'Shipping tracking number' },
              carrier: { type: 'string', description: 'Shipping carrier' },
              shipDate: { type: 'string', description: 'Ship date' },
              deliveryDate: { type: 'string', description: 'Expected delivery date' },
              paymentTerms: { type: 'string', description: 'Payment terms (Net 30, etc)' },
              dueDate: { type: 'string', description: 'Payment due date' },
              countryOfOrigin: { type: 'string', description: 'Country of origin for customs/trade docs' },
              portOfEntry: { type: 'string', description: 'Port of entry for customs docs' },
              containerNumber: { type: 'string', description: 'Container number for shipping/customs' },
              hsCode: { type: 'string', description: 'Harmonized System code for customs' },
              contractType: { type: 'string', description: 'Contract type (vendor, customer, nda, lease, service, employment, partnership)' },
              startDate: { type: 'string', description: 'Contract/period start date' },
              endDate: { type: 'string', description: 'Contract/period end date' },
              partyName: { type: 'string', description: 'Other party name (for contracts)' },
              accountNumber: { type: 'string', description: 'Bank account number (for bank statements)' },
              bankName: { type: 'string', description: 'Bank name (for bank statements)' },
              statementPeriodStart: { type: 'string', description: 'Statement period start date' },
              statementPeriodEnd: { type: 'string', description: 'Statement period end date' },
              openingBalance: { type: 'number', description: 'Opening balance (for bank statements)' },
              closingBalance: { type: 'number', description: 'Closing balance (for bank statements)' },
              statementTransactions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    description: { type: 'string' },
                    amount: { type: 'number' },
                    type: { type: 'string', description: 'debit or credit' },
                    reference: { type: 'string' }
                  },
                  required: ['date', 'description', 'amount', 'type'],
                  additionalProperties: false
                },
                description: 'Individual transactions from a bank statement'
              },
              quoteNumber: { type: 'string', description: 'Quote/proposal number' },
              validUntil: { type: 'string', description: 'Quote validity/expiry date' },
              proposalTitle: { type: 'string', description: 'Proposal or quote title' },
              investmentAmount: { type: 'number', description: 'Investment amount (for term sheets)' },
              preMoneyValuation: { type: 'number', description: 'Pre-money valuation (for term sheets)' },
              postMoneyValuation: { type: 'number', description: 'Post-money valuation (for term sheets)' },
              investorName: { type: 'string', description: 'Investor name (for term sheets)' },
              roundType: { type: 'string', description: 'Funding round type (seed, series_a, etc.)' },
              keyTerms: { type: 'array', items: { type: 'string' }, description: 'Key terms from term sheet' },
              contactFirstName: { type: 'string', description: 'Contact first name (for business cards)' },
              contactLastName: { type: 'string', description: 'Contact last name (for business cards)' },
              contactEmail: { type: 'string', description: 'Contact email (for business cards)' },
              contactPhone: { type: 'string', description: 'Contact phone (for business cards)' },
              contactOrganization: { type: 'string', description: 'Contact organization (for business cards)' },
              contactJobTitle: { type: 'string', description: 'Contact job title (for business cards)' },
              contactLinkedinUrl: { type: 'string', description: 'Contact LinkedIn URL (for business cards)' },
              contactAddress: { type: 'string', description: 'Contact address (for business cards)' },
              poNumber: { type: 'string', description: 'Purchase order reference' },
              invoiceNumber: { type: 'string', description: 'Invoice number reference' },
              notes: { type: 'string', description: 'Any additional notes or comments' }
            },
            required: ['documentType', 'confidence', 'extractedText'],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('No response from LLM');
    }

    const parsed = JSON.parse(content);
    
    return {
      type: parsed.documentType,
      confidence: parsed.confidence / 100,
      extractedText: parsed.extractedText,
      structuredData: {
        documentNumber: parsed.documentNumber,
        documentDate: parsed.documentDate,
        totalAmount: parsed.totalAmount,
        currency: parsed.currency,
        vendorName: parsed.vendorName,
        vendorAddress: parsed.vendorAddress,
        vendorEmail: parsed.vendorEmail,
        vendorPhone: parsed.vendorPhone,
        customerName: parsed.customerName,
        customerAddress: parsed.customerAddress,
        lineItems: parsed.lineItems,
        trackingNumber: parsed.trackingNumber,
        carrier: parsed.carrier,
        shipDate: parsed.shipDate,
        deliveryDate: parsed.deliveryDate,
        paymentTerms: parsed.paymentTerms,
        dueDate: parsed.dueDate,
        countryOfOrigin: parsed.countryOfOrigin,
        portOfEntry: parsed.portOfEntry,
        containerNumber: parsed.containerNumber,
        hsCode: parsed.hsCode,
        contractType: parsed.contractType,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        partyName: parsed.partyName,
        accountNumber: parsed.accountNumber,
        bankName: parsed.bankName,
        statementPeriodStart: parsed.statementPeriodStart,
        statementPeriodEnd: parsed.statementPeriodEnd,
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance,
        statementTransactions: parsed.statementTransactions,
        quoteNumber: parsed.quoteNumber,
        validUntil: parsed.validUntil,
        proposalTitle: parsed.proposalTitle,
        investmentAmount: parsed.investmentAmount,
        preMoneyValuation: parsed.preMoneyValuation,
        postMoneyValuation: parsed.postMoneyValuation,
        investorName: parsed.investorName,
        roundType: parsed.roundType,
        keyTerms: parsed.keyTerms,
        contactFirstName: parsed.contactFirstName,
        contactLastName: parsed.contactLastName,
        contactEmail: parsed.contactEmail,
        contactPhone: parsed.contactPhone,
        contactOrganization: parsed.contactOrganization,
        contactJobTitle: parsed.contactJobTitle,
        contactLinkedinUrl: parsed.contactLinkedinUrl,
        contactAddress: parsed.contactAddress,
        poNumber: parsed.poNumber,
        invoiceNumber: parsed.invoiceNumber,
        notes: parsed.notes,
      },
      rawOcrOutput: content as string,
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    return {
      type: 'unknown',
      confidence: 0,
      extractedText: '',
      structuredData: {},
    };
  }
}

/**
 * Process multiple attachments from an email
 */
export async function processEmailAttachments(
  attachments: Array<{
    id: number;
    filename: string;
    mimeType: string | null;
    storageUrl: string | null;
  }>
): Promise<Map<number, ExtractedAttachmentData>> {
  const results = new Map<number, ExtractedAttachmentData>();
  
  // Filter to only processable attachments
  const processable = attachments.filter(a => 
    a.storageUrl && a.mimeType && (
      a.mimeType.startsWith('image/') ||
      a.mimeType === 'application/pdf'
    )
  );

  // Process in parallel (max 3 at a time to avoid rate limits)
  const batchSize = 3;
  for (let i = 0; i < processable.length; i += batchSize) {
    const batch = processable.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (attachment) => {
        const result = await processAttachment(
          attachment.storageUrl!,
          attachment.mimeType!,
          attachment.filename
        );
        return { id: attachment.id, result };
      })
    );
    
    for (const { id, result } of batchResults) {
      results.set(id, result);
    }
  }

  return results;
}

/**
 * Determine the best category for an email based on its attachments
 */
export function categorizeByAttachments(
  attachmentResults: ExtractedAttachmentData[]
): { category: string; confidence: number } | null {
  if (attachmentResults.length === 0) {
    return null;
  }

  // Find the highest confidence result
  let bestResult: ExtractedAttachmentData | null = null;
  for (const result of attachmentResults) {
    if (!bestResult || result.confidence > bestResult.confidence) {
      bestResult = result;
    }
  }

  if (!bestResult || bestResult.type === 'unknown' || bestResult.confidence < 0.5) {
    return null;
  }

  // Map attachment types to email categories
  const categoryMap: Record<string, string> = {
    'invoice': 'invoice',
    'receipt': 'receipt',
    'purchase_order': 'purchase_order',
    'shipping_document': 'shipping_confirmation',
    'customs_document': 'customs_document',
    'bill_of_lading': 'shipping_confirmation',
    'packing_list': 'shipping_confirmation',
    'credit_memo': 'invoice',
    'bank_statement': 'general',
    'sales_order': 'purchase_order',
    'contract': 'general',
    'quote': 'invoice',
    'term_sheet': 'general',
    'contact_card': 'general',
  };

  return {
    category: categoryMap[bestResult.type] || 'general',
    confidence: bestResult.confidence,
  };
}

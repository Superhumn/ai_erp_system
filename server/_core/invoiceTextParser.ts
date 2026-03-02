/**
 * Natural Language Invoice Parser
 * Parses simple text like "$8500 invoice for 300lbs beef barbacoa bill to sysco net 30"
 * into structured invoice data using AI
 */

import { invokeLLM } from './llm';

export interface ParsedInvoiceData {
  amount: number;
  description: string;
  quantity?: number;
  unit?: string;
  customerName: string;
  paymentTerms?: string;
  dueInDays?: number;
}

/**
 * Parse natural language text into invoice data using AI
 */
export async function parseInvoiceText(text: string): Promise<ParsedInvoiceData> {
  const systemPrompt = `You are an invoice data extraction assistant. Extract structured invoice information from natural language text.

Extract the following fields:
- amount: The total invoice amount (number only, no currency symbol)
- description: Product/service description
- quantity: Quantity if mentioned (number only)
- unit: Unit of measurement if mentioned (e.g., "lbs", "pieces", "hours")
- customerName: Customer or company name to bill to
- paymentTerms: Payment terms like "net 30", "net 15", "due on receipt"
- dueInDays: Number of days until payment is due (extract from payment terms)

Return ONLY a valid JSON object with these fields. Use null for missing fields.
Example output:
{
  "amount": 8500,
  "description": "300lbs beef barbacoa",
  "quantity": 300,
  "unit": "lbs",
  "customerName": "sysco",
  "paymentTerms": "net 30",
  "dueInDays": 30
}`;

  const userPrompt = `Extract invoice data from this text: "${text}"`;

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
    if (!parsed.amount || !parsed.customerName) {
      throw new Error('Missing required fields: amount and customerName are required');
    }

    return {
      amount: Number(parsed.amount),
      description: parsed.description || 'Invoice',
      quantity: parsed.quantity ? Number(parsed.quantity) : undefined,
      unit: parsed.unit || undefined,
      customerName: String(parsed.customerName).trim(),
      paymentTerms: parsed.paymentTerms || undefined,
      dueInDays: parsed.dueInDays ? Number(parsed.dueInDays) : undefined,
    };
  } catch (error) {
    console.error('[InvoiceTextParser] Failed to parse invoice text:', error);
    throw new Error(`Failed to parse invoice text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create customer record or find existing one by name
 */
export async function findOrCreateCustomer(customerName: string, db: any): Promise<number> {
  // Try to find existing customer by name (case-insensitive)
  const existing = await db.getCustomerByName(customerName);
  if (existing) {
    return existing.id;
  }

  // Create new customer
  const customer = await db.createCustomer({
    name: customerName,
    type: 'business',
    status: 'active',
  });

  return customer.id;
}

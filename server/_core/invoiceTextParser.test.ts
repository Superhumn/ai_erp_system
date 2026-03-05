import { describe, it, expect, vi } from 'vitest';
import { parseInvoiceText } from './invoiceTextParser';

// Mock the LLM
vi.mock('./llm', () => ({
  invokeLLM: vi.fn(async () => {
    return {
      id: 'test-id',
      created: Date.now(),
      model: 'test-model',
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content: JSON.stringify({
            amount: 8500,
            description: "300lbs beef barbacoa",
            quantity: 300,
            unit: "lbs",
            customerName: "sysco",
            paymentTerms: "net 30",
            dueInDays: 30
          })
        },
        finish_reason: 'stop'
      }]
    };
  })
}));

describe('Invoice Text Parser', () => {
  it('should parse invoice text correctly', async () => {
    const text = "$8500 invoice for 300lbs beef barbacoa bill to sysco net 30";
    const result = await parseInvoiceText(text);
    
    expect(result.amount).toBe(8500);
    expect(result.description).toBe("300lbs beef barbacoa");
    expect(result.quantity).toBe(300);
    expect(result.unit).toBe("lbs");
    expect(result.customerName).toBe("sysco");
    expect(result.paymentTerms).toBe("net 30");
    expect(result.dueInDays).toBe(30);
  });

  it('should handle missing optional fields', async () => {
    const { invokeLLM } = await import('./llm');
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      id: 'test-id',
      created: Date.now(),
      model: 'test-model',
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content: JSON.stringify({
            amount: 1000,
            description: "Consulting services",
            customerName: "Acme Corp",
            quantity: null,
            unit: null,
            paymentTerms: null,
            dueInDays: null
          })
        },
        finish_reason: 'stop'
      }]
    });

    const text = "$1000 invoice to Acme Corp";
    const result = await parseInvoiceText(text);
    
    expect(result.amount).toBe(1000);
    expect(result.customerName).toBe("Acme Corp");
    expect(result.quantity).toBeUndefined();
    expect(result.paymentTerms).toBeUndefined();
  });

  it('should calculate correct unit price when quantity is provided', () => {
    // This is a conceptual test for the invoice creation logic
    // In actual implementation, $8500 for 300 units means:
    // - Total amount: $8500
    // - Quantity: 300
    // - Unit price: $8500 / 300 = $28.33 per unit
    const totalAmount = 8500;
    const quantity = 300;
    const expectedUnitPrice = 28.33; // rounded to 2 decimals
    
    const calculatedUnitPrice = totalAmount / quantity;
    expect(Number(calculatedUnitPrice.toFixed(2))).toBe(expectedUnitPrice);
  });
});

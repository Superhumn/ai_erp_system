import { describe, expect, it } from "vitest";
import { z } from "zod";

// Test schemas for B2B and International Freight Invoicing
describe("B2B Invoice Schemas", () => {
  // Payment Terms Schema
  const paymentTermsSchema = z.enum([
    'due_on_receipt',
    'net_15',
    'net_30',
    'net_45',
    'net_60',
    'net_90',
    'eom',
    'cod',
    'cia',
    'custom'
  ]);

  // Payment Method Schema
  const paymentMethodSchema = z.enum([
    'bank_transfer',
    'wire',
    'ach',
    'check',
    'credit_card',
    'letter_of_credit',
    'cash_in_advance',
    'documentary_collection',
    'open_account',
    'consignment',
    'other'
  ]);

  // B2B Invoice Schema
  const b2bInvoiceSchema = z.object({
    invoiceNumber: z.string(),
    customerId: z.number(),
    issueDate: z.date(),
    dueDate: z.date().optional(),
    subtotal: z.string(),
    totalAmount: z.string(),
    paymentTerms: paymentTermsSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    purchaseOrderNumber: z.string().optional(),
  });

  // International Freight Invoice Schema
  const internationalInvoiceSchema = z.object({
    invoiceNumber: z.string(),
    customerId: z.number(),
    issueDate: z.date(),
    subtotal: z.string(),
    totalAmount: z.string(),
    incoterms: z.string().optional(),
    portOfLoading: z.string().optional(),
    portOfDischarge: z.string().optional(),
    exportLicenseNumber: z.string().optional(),
    importLicenseNumber: z.string().optional(),
    freightAmount: z.string().optional(),
    insuranceAmount: z.string().optional(),
    customsDuties: z.string().optional(),
  });

  // Invoice Item with International Fields
  const internationalInvoiceItemSchema = z.object({
    description: z.string(),
    quantity: z.string(),
    unitPrice: z.string(),
    totalAmount: z.string(),
    hsCode: z.string().optional(),
    countryOfOrigin: z.string().optional(),
    weight: z.string().optional(),
    volume: z.string().optional(),
  });

  describe("Payment Terms Validation", () => {
    it("should validate all payment terms", () => {
      const terms = [
        'due_on_receipt',
        'net_15',
        'net_30',
        'net_45',
        'net_60',
        'net_90',
        'eom',
        'cod',
        'cia',
        'custom'
      ];

      for (const term of terms) {
        const result = paymentTermsSchema.safeParse(term);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid payment terms", () => {
      const result = paymentTermsSchema.safeParse('invalid_term');
      expect(result.success).toBe(false);
    });
  });

  describe("Payment Method Validation", () => {
    it("should validate all payment methods", () => {
      const methods = [
        'bank_transfer',
        'wire',
        'ach',
        'check',
        'credit_card',
        'letter_of_credit',
        'cash_in_advance',
        'documentary_collection',
        'open_account',
        'consignment',
        'other'
      ];

      for (const method of methods) {
        const result = paymentMethodSchema.safeParse(method);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid payment method", () => {
      const result = paymentMethodSchema.safeParse('invalid_method');
      expect(result.success).toBe(false);
    });
  });

  describe("B2B Invoice Validation", () => {
    it("should validate a complete B2B invoice", () => {
      const invoice = {
        invoiceNumber: "INV-2026-001",
        customerId: 1,
        issueDate: new Date("2026-02-01"),
        dueDate: new Date("2026-03-03"),
        subtotal: "10000.00",
        totalAmount: "10800.00",
        paymentTerms: "net_30" as const,
        paymentMethod: "wire" as const,
        purchaseOrderNumber: "PO-12345",
      };

      const result = b2bInvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });

    it("should validate B2B invoice without optional fields", () => {
      const invoice = {
        invoiceNumber: "INV-2026-002",
        customerId: 2,
        issueDate: new Date("2026-02-01"),
        subtotal: "5000.00",
        totalAmount: "5400.00",
      };

      const result = b2bInvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });
  });

  describe("International Freight Invoice Validation", () => {
    it("should validate a complete international freight invoice", () => {
      const invoice = {
        invoiceNumber: "INV-2026-003",
        customerId: 3,
        issueDate: new Date("2026-02-01"),
        subtotal: "50000.00",
        totalAmount: "58500.00",
        incoterms: "CIF",
        portOfLoading: "Shanghai Port",
        portOfDischarge: "Los Angeles Port",
        exportLicenseNumber: "EXP-123456",
        importLicenseNumber: "IMP-789012",
        freightAmount: "5000.00",
        insuranceAmount: "1500.00",
        customsDuties: "2000.00",
      };

      const result = internationalInvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });

    it("should validate invoice with minimal international fields", () => {
      const invoice = {
        invoiceNumber: "INV-2026-004",
        customerId: 4,
        issueDate: new Date("2026-02-01"),
        subtotal: "20000.00",
        totalAmount: "22000.00",
        incoterms: "FOB",
      };

      const result = internationalInvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });
  });

  describe("International Invoice Item Validation", () => {
    it("should validate item with complete international fields", () => {
      const item = {
        description: "Electronic Components",
        quantity: "1000",
        unitPrice: "10.50",
        totalAmount: "10500.00",
        hsCode: "8542.31",
        countryOfOrigin: "China",
        weight: "150.5",
        volume: "2.5",
      };

      const result = internationalInvoiceItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it("should validate item without international fields", () => {
      const item = {
        description: "Standard Product",
        quantity: "50",
        unitPrice: "100.00",
        totalAmount: "5000.00",
      };

      const result = internationalInvoiceItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });
  });

  describe("Incoterms Validation", () => {
    const commonIncoterms = [
      "EXW", // Ex Works
      "FCA", // Free Carrier
      "FAS", // Free Alongside Ship
      "FOB", // Free on Board
      "CFR", // Cost and Freight
      "CIF", // Cost, Insurance and Freight
      "CPT", // Carriage Paid To
      "CIP", // Carriage and Insurance Paid To
      "DAP", // Delivered at Place
      "DPU", // Delivered at Place Unloaded
      "DDP", // Delivered Duty Paid
    ];

    it("should support all common incoterms", () => {
      for (const incoterm of commonIncoterms) {
        const invoice = {
          invoiceNumber: "INV-TEST",
          customerId: 1,
          issueDate: new Date(),
          subtotal: "1000.00",
          totalAmount: "1000.00",
          incoterms: incoterm,
        };

        const result = internationalInvoiceSchema.safeParse(invoice);
        expect(result.success).toBe(true);
      }
    });
  });
});

// Test total calculation including freight charges
describe("Invoice Total Calculation", () => {
  interface InvoiceTotals {
    subtotal: number;
    taxAmount?: number;
    discountAmount?: number;
    freightAmount?: number;
    insuranceAmount?: number;
    customsDuties?: number;
  }

  const calculateTotal = (invoice: InvoiceTotals): number => {
    let total = invoice.subtotal;
    if (invoice.freightAmount) total += invoice.freightAmount;
    if (invoice.insuranceAmount) total += invoice.insuranceAmount;
    if (invoice.customsDuties) total += invoice.customsDuties;
    if (invoice.taxAmount) total += invoice.taxAmount;
    if (invoice.discountAmount) total -= invoice.discountAmount;
    return total;
  };

  it("should calculate total with freight charges", () => {
    const invoice = {
      subtotal: 10000,
      freightAmount: 1500,
      insuranceAmount: 500,
      taxAmount: 1200,
    };

    const total = calculateTotal(invoice);
    expect(total).toBe(13200);
  });

  it("should calculate total with customs duties", () => {
    const invoice = {
      subtotal: 20000,
      freightAmount: 2000,
      insuranceAmount: 800,
      customsDuties: 3000,
      taxAmount: 2580,
    };

    const total = calculateTotal(invoice);
    expect(total).toBe(28380);
  });

  it("should calculate total with discount", () => {
    const invoice = {
      subtotal: 15000,
      freightAmount: 1000,
      taxAmount: 1600,
      discountAmount: 500,
    };

    const total = calculateTotal(invoice);
    expect(total).toBe(17100);
  });

  it("should calculate total without optional charges", () => {
    const invoice = {
      subtotal: 5000,
      taxAmount: 500,
    };

    const total = calculateTotal(invoice);
    expect(total).toBe(5500);
  });
});

// Test payment terms due date calculation
describe("Payment Terms Due Date Calculation", () => {
  const calculateDueDate = (issueDate: Date, paymentTerms: string): Date => {
    const due = new Date(issueDate);
    
    switch (paymentTerms) {
      case 'due_on_receipt':
        return due;
      case 'net_15':
        due.setDate(due.getDate() + 15);
        return due;
      case 'net_30':
        due.setDate(due.getDate() + 30);
        return due;
      case 'net_45':
        due.setDate(due.getDate() + 45);
        return due;
      case 'net_60':
        due.setDate(due.getDate() + 60);
        return due;
      case 'net_90':
        due.setDate(due.getDate() + 90);
        return due;
      case 'eom':
        // End of month
        due.setMonth(due.getMonth() + 1, 0);
        return due;
      default:
        return due;
    }
  };

  it("should calculate net_30 due date", () => {
    const issueDate = new Date("2026-02-01");
    const dueDate = calculateDueDate(issueDate, "net_30");
    const expected = new Date("2026-03-03");
    
    expect(dueDate.toDateString()).toBe(expected.toDateString());
  });

  it("should calculate net_60 due date", () => {
    const issueDate = new Date("2026-01-15");
    const dueDate = calculateDueDate(issueDate, "net_60");
    const expected = new Date("2026-03-16");
    
    expect(dueDate.toDateString()).toBe(expected.toDateString());
  });

  it("should handle due_on_receipt", () => {
    const issueDate = new Date("2026-02-01");
    const dueDate = calculateDueDate(issueDate, "due_on_receipt");
    
    expect(dueDate.toDateString()).toBe(issueDate.toDateString());
  });

  it("should calculate end of month", () => {
    const issueDate = new Date("2026-02-15");
    const dueDate = calculateDueDate(issueDate, "eom");
    
    expect(dueDate.getDate()).toBe(28); // Feb 2026 has 28 days
    expect(dueDate.getMonth()).toBe(1); // February (0-indexed)
  });
});

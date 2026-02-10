#!/usr/bin/env node

/**
 * Manual test script for invoice creation from text
 * This tests the complete flow:
 * 1. Parse invoice text
 * 2. Create draft invoice
 * 3. Preview invoice data
 */

import { parseInvoiceText } from './server/_core/invoiceTextParser.js';

// Sample invoice texts to test
const testCases = [
  {
    name: "Original example",
    text: "$8500 invoice for 300lbs beef barbacoa bill to sysco net 30"
  },
  {
    name: "Simple invoice",
    text: "$1000 invoice to Acme Corp"
  },
  {
    name: "Invoice with due on receipt",
    text: "$5000 for consulting services to TechStart Inc due on receipt"
  },
  {
    name: "Complex invoice",
    text: "$12,500 invoice for 500 units of Product X to Big Company Ltd payment terms net 45"
  }
];

console.log("🧪 Testing Invoice Text Parser\n");
console.log("=" .repeat(60));

for (const testCase of testCases) {
  console.log(`\n📋 Test: ${testCase.name}`);
  console.log(`📝 Input: "${testCase.text}"`);
  console.log("-".repeat(60));
  
  try {
    const result = await parseInvoiceText(testCase.text);
    
    console.log("✅ Parsed successfully:");
    console.log(`   Amount: $${result.amount.toFixed(2)}`);
    console.log(`   Description: ${result.description}`);
    console.log(`   Customer: ${result.customerName}`);
    
    if (result.quantity) {
      console.log(`   Quantity: ${result.quantity} ${result.unit || ''}`);
    }
    
    if (result.paymentTerms) {
      console.log(`   Payment Terms: ${result.paymentTerms}`);
      console.log(`   Due in Days: ${result.dueInDays || 'N/A'}`);
    }
  } catch (error) {
    console.log(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

console.log("\n" + "=".repeat(60));
console.log("✨ Test complete!\n");

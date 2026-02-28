/**
 * GL Automation Service
 *
 * Auto-generates journal entries from operational workflows:
 *  - PO received → DR Inventory / CR Accounts Payable
 *  - Shipment delivered → DR COGS / CR Inventory + DR AR / CR Revenue
 *  - Invoice paid → DR Cash / CR AR
 *  - Landed cost posted → DR Inventory / CR Accrued Liabilities
 *  - FX revaluation → DR/CR FX Gain/Loss
 *  - Production completed → DR FG Inventory / CR WIP
 */

import * as db from "./db";

interface GLLine {
  accountId: number;
  debit: string;
  credit: string;
  description: string;
}

function generateTxnNumber(prefix: string) {
  const d = new Date();
  const yr = d.getFullYear().toString().slice(-2);
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${prefix}-${yr}${mo}-${rnd}`;
}

/**
 * Create a GL journal entry from template-based automation.
 */
export async function createAutoJournalEntry(params: {
  companyId?: number;
  triggerEvent: string;
  referenceType: string;
  referenceId: number;
  description: string;
  lines: GLLine[];
  currency?: string;
  createdBy?: number;
  autoPost?: boolean;
}) {
  const totalDebit = params.lines.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
  const totalCredit = params.lines.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);

  // Validate debits = credits
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal entry out of balance: debits=${totalDebit.toFixed(2)}, credits=${totalCredit.toFixed(2)}`
    );
  }

  const txnNumber = generateTxnNumber("JE");
  const now = new Date();

  // Create the transaction header
  const txn = await db.createTransaction({
    companyId: params.companyId,
    transactionNumber: txnNumber,
    type: "journal",
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    date: now,
    description: `[Auto] ${params.description}`,
    totalAmount: totalDebit.toFixed(2),
    currency: params.currency || "USD",
    status: params.autoPost ? "posted" : "draft",
    createdBy: params.createdBy,
    ...(params.autoPost ? { postedBy: params.createdBy, postedAt: now } : {}),
  });

  // Create the line items
  for (const line of params.lines) {
    await db.createTransactionLine({
      transactionId: txn.id,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    });
  }

  return { transactionId: txn.id, transactionNumber: txnNumber };
}

/**
 * Auto-post journal entry when a PO is received.
 * DR: Inventory/Raw Materials (asset)
 * CR: Accounts Payable (liability)
 */
export async function postPurchaseReceiptEntry(params: {
  companyId?: number;
  purchaseOrderId: number;
  totalAmount: string;
  inventoryAccountId: number;
  payableAccountId: number;
  createdBy?: number;
}) {
  return createAutoJournalEntry({
    companyId: params.companyId,
    triggerEvent: "po_received",
    referenceType: "purchase_order",
    referenceId: params.purchaseOrderId,
    description: `PO Receipt - PO #${params.purchaseOrderId}`,
    currency: "USD",
    createdBy: params.createdBy,
    autoPost: true,
    lines: [
      {
        accountId: params.inventoryAccountId,
        debit: params.totalAmount,
        credit: "0",
        description: "Inventory received from PO",
      },
      {
        accountId: params.payableAccountId,
        debit: "0",
        credit: params.totalAmount,
        description: "Accounts payable for PO receipt",
      },
    ],
  });
}

/**
 * Auto-post journal entry when an outbound shipment is created (revenue recognition).
 * DR: Accounts Receivable + DR: COGS
 * CR: Revenue + CR: Inventory
 */
export async function postShipmentRevenueEntry(params: {
  companyId?: number;
  shipmentId: number;
  revenueAmount: string;
  cogsAmount: string;
  receivableAccountId: number;
  revenueAccountId: number;
  cogsAccountId: number;
  inventoryAccountId: number;
  createdBy?: number;
}) {
  return createAutoJournalEntry({
    companyId: params.companyId,
    triggerEvent: "shipment_delivered",
    referenceType: "shipment",
    referenceId: params.shipmentId,
    description: `Revenue Recognition - Shipment #${params.shipmentId}`,
    createdBy: params.createdBy,
    autoPost: true,
    lines: [
      {
        accountId: params.receivableAccountId,
        debit: params.revenueAmount,
        credit: "0",
        description: "Accounts receivable for shipped order",
      },
      {
        accountId: params.revenueAccountId,
        debit: "0",
        credit: params.revenueAmount,
        description: "Revenue recognized on shipment",
      },
      {
        accountId: params.cogsAccountId,
        debit: params.cogsAmount,
        credit: "0",
        description: "Cost of goods sold",
      },
      {
        accountId: params.inventoryAccountId,
        debit: "0",
        credit: params.cogsAmount,
        description: "Inventory relieved for shipment",
      },
    ],
  });
}

/**
 * Auto-post journal entry when a payment is received.
 * DR: Cash/Bank
 * CR: Accounts Receivable
 */
export async function postPaymentReceivedEntry(params: {
  companyId?: number;
  paymentId: number;
  amount: string;
  cashAccountId: number;
  receivableAccountId: number;
  createdBy?: number;
}) {
  return createAutoJournalEntry({
    companyId: params.companyId,
    triggerEvent: "payment_received",
    referenceType: "payment",
    referenceId: params.paymentId,
    description: `Payment Received - Payment #${params.paymentId}`,
    createdBy: params.createdBy,
    autoPost: true,
    lines: [
      {
        accountId: params.cashAccountId,
        debit: params.amount,
        credit: "0",
        description: "Cash received",
      },
      {
        accountId: params.receivableAccountId,
        debit: "0",
        credit: params.amount,
        description: "AR cleared by payment",
      },
    ],
  });
}

/**
 * Auto-post journal entry for landed cost allocation.
 * DR: Inventory (increase asset value by landed costs)
 * CR: Accrued Freight / Duties Payable
 */
export async function postLandedCostEntry(params: {
  companyId?: number;
  allocationId: number;
  totalLandedCost: string;
  inventoryAccountId: number;
  accruedLiabilityAccountId: number;
  createdBy?: number;
}) {
  return createAutoJournalEntry({
    companyId: params.companyId,
    triggerEvent: "landed_cost_posted",
    referenceType: "landed_cost_allocation",
    referenceId: params.allocationId,
    description: `Landed Cost Allocation #${params.allocationId}`,
    createdBy: params.createdBy,
    autoPost: true,
    lines: [
      {
        accountId: params.inventoryAccountId,
        debit: params.totalLandedCost,
        credit: "0",
        description: "Inventory value increased by landed costs",
      },
      {
        accountId: params.accruedLiabilityAccountId,
        debit: "0",
        credit: params.totalLandedCost,
        description: "Accrued freight/duties payable",
      },
    ],
  });
}

/**
 * Auto-post FX revaluation journal entry.
 * If gain: DR: Foreign Currency Receivable / CR: FX Gain
 * If loss: DR: FX Loss / CR: Foreign Currency Receivable
 */
export async function postFxRevaluationEntry(params: {
  companyId?: number;
  entityType: string;
  entityId: number;
  gainLossAmount: number;
  fxGainLossAccountId: number;
  foreignCurrencyAccountId: number;
  createdBy?: number;
}) {
  const isGain = params.gainLossAmount >= 0;
  const absAmount = Math.abs(params.gainLossAmount).toFixed(2);

  return createAutoJournalEntry({
    companyId: params.companyId,
    triggerEvent: "fx_revaluation",
    referenceType: params.entityType,
    referenceId: params.entityId,
    description: `FX ${isGain ? "Gain" : "Loss"} - ${params.entityType} #${params.entityId}`,
    createdBy: params.createdBy,
    autoPost: true,
    lines: isGain
      ? [
          {
            accountId: params.foreignCurrencyAccountId,
            debit: absAmount,
            credit: "0",
            description: "FX revaluation - increase in receivable value",
          },
          {
            accountId: params.fxGainLossAccountId,
            debit: "0",
            credit: absAmount,
            description: "FX gain on revaluation",
          },
        ]
      : [
          {
            accountId: params.fxGainLossAccountId,
            debit: absAmount,
            credit: "0",
            description: "FX loss on revaluation",
          },
          {
            accountId: params.foreignCurrencyAccountId,
            debit: "0",
            credit: absAmount,
            description: "FX revaluation - decrease in receivable value",
          },
        ],
  });
}

/**
 * Auto-post production completion entry.
 * DR: Finished Goods Inventory
 * CR: Work-in-Progress / Raw Material Inventory
 */
export async function postProductionCompletionEntry(params: {
  companyId?: number;
  workOrderId: number;
  totalCost: string;
  finishedGoodsAccountId: number;
  wipAccountId: number;
  createdBy?: number;
}) {
  return createAutoJournalEntry({
    companyId: params.companyId,
    triggerEvent: "production_completed",
    referenceType: "work_order",
    referenceId: params.workOrderId,
    description: `Production Completion - WO #${params.workOrderId}`,
    createdBy: params.createdBy,
    autoPost: true,
    lines: [
      {
        accountId: params.finishedGoodsAccountId,
        debit: params.totalCost,
        credit: "0",
        description: "Finished goods produced",
      },
      {
        accountId: params.wipAccountId,
        debit: "0",
        credit: params.totalCost,
        description: "WIP consumed in production",
      },
    ],
  });
}

/**
 * Process GL entry templates for a given trigger event.
 * Looks up active templates and creates journal entries using template formulas.
 */
export async function processGlTemplatesForEvent(params: {
  companyId?: number;
  triggerEvent: string;
  referenceType: string;
  referenceId: number;
  amount: number;
  description: string;
  createdBy?: number;
}) {
  const templates = await db.getGlEntryTemplates(params.companyId, params.triggerEvent);
  const results = [];

  for (const template of templates) {
    const templateLines = template.templateLines as any[];
    if (!Array.isArray(templateLines) || templateLines.length === 0) continue;

    const lines: GLLine[] = templateLines.map((tl: any) => ({
      accountId: tl.accountId,
      debit: tl.isDebit ? params.amount.toFixed(2) : "0",
      credit: tl.isDebit ? "0" : params.amount.toFixed(2),
      description: tl.description || params.description,
    }));

    const result = await createAutoJournalEntry({
      companyId: params.companyId,
      triggerEvent: params.triggerEvent,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: `${template.name} - ${params.description}`,
      createdBy: params.createdBy,
      autoPost: true,
      lines,
    });

    results.push(result);
  }

  return results;
}

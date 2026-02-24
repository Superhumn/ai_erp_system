/**
 * QuickBooks Online Sync Service
 * Handles bidirectional sync of customers, vendors, invoices, payments, and accounts.
 */

import { makeQuickBooksRequest, refreshQuickBooksToken } from "./_core/quickbooks";
import * as db from "./db";

interface QBSyncContext {
  accessToken: string;
  realmId: string;
  userId: number;
}

async function getAuthenticatedContext(userId: number): Promise<QBSyncContext | null> {
  const token = await db.getQuickBooksOAuthToken(userId);
  if (!token || !token.realmId) return null;

  let accessToken = token.accessToken;
  const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();

  if (isExpired && token.refreshToken) {
    const refreshResult = await refreshQuickBooksToken(token.refreshToken);
    if (refreshResult.error || !refreshResult.access_token) return null;

    await db.upsertQuickBooksOAuthToken({
      userId,
      accessToken: refreshResult.access_token,
      refreshToken: refreshResult.refresh_token!,
      expiresAt: new Date(Date.now() + (refreshResult.expires_in! * 1000)),
      realmId: token.realmId,
    });
    accessToken = refreshResult.access_token;
  }

  return { accessToken, realmId: token.realmId, userId };
}

// ============================================
// CUSTOMER SYNC
// ============================================

export async function syncCustomersFromQB(userId: number): Promise<{ synced: number; errors: string[] }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { synced: 0, errors: ["QuickBooks not connected"] };

  const errors: string[] = [];
  let synced = 0;

  const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "query?query=SELECT * FROM Customer MAXRESULTS 1000");
  if (result.error || !result.data?.QueryResponse?.Customer) {
    return { synced: 0, errors: [result.error || "No customers returned"] };
  }

  for (const qbCustomer of result.data.QueryResponse.Customer) {
    try {
      const existingCustomers = [await db.getCustomerByQuickbooksId(qbCustomer.Id)].filter(Boolean);
      if (existingCustomers.length > 0) {
        // Update existing
        await db.updateCustomer(existingCustomers[0].id, {
          name: qbCustomer.DisplayName,
          email: qbCustomer.PrimaryEmailAddr?.Address,
          phone: qbCustomer.PrimaryPhone?.FreeFormNumber,
          address: formatQBAddress(qbCustomer.BillAddr),
          syncSource: 'quickbooks',
          lastSyncedAt: new Date(),
        });
      } else {
        // Create new
        await db.createCustomer({
          name: qbCustomer.DisplayName,
          email: qbCustomer.PrimaryEmailAddr?.Address,
          phone: qbCustomer.PrimaryPhone?.FreeFormNumber,
          address: formatQBAddress(qbCustomer.BillAddr),
          type: 'business',
          status: qbCustomer.Active ? 'active' : 'inactive',
          quickbooksCustomerId: qbCustomer.Id,
          syncSource: 'quickbooks',
          lastSyncedAt: new Date(),
        });
      }
      synced++;
    } catch (err: any) {
      errors.push(`Customer ${qbCustomer.DisplayName}: ${err.message}`);
    }
  }

  await db.createSyncLog({ integration: 'quickbooks', action: 'sync_customers', status: errors.length ? 'partial' : 'success', details: `Synced ${synced} customers. ${errors.length} errors.` });
  return { synced, errors };
}

export async function pushCustomerToQB(userId: number, customerId: number): Promise<{ quickbooksId?: string; error?: string }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { error: "QuickBooks not connected" };

  const customer = await db.getCustomerById(customerId);
  if (!customer) return { error: "Customer not found" };

  const qbCustomer: any = {
    DisplayName: customer.name,
    PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
    PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
  };

  if (customer.quickbooksCustomerId) {
    // Update existing in QB — need to fetch current SyncToken first
    const existing = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, `customer/${customer.quickbooksCustomerId}`);
    if (existing.error) return { error: existing.error };
    qbCustomer.Id = customer.quickbooksCustomerId;
    qbCustomer.SyncToken = existing.data?.Customer?.SyncToken;

    const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "customer", {
      method: "POST",
      body: JSON.stringify(qbCustomer),
    });
    if (result.error) return { error: result.error };
    return { quickbooksId: customer.quickbooksCustomerId };
  } else {
    // Create new in QB
    const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "customer", {
      method: "POST",
      body: JSON.stringify(qbCustomer),
    });
    if (result.error) return { error: result.error };
    const qbId = result.data?.Customer?.Id;
    if (qbId) {
      await db.updateCustomer(customerId, { quickbooksCustomerId: qbId, syncSource: 'quickbooks', lastSyncedAt: new Date() });
    }
    return { quickbooksId: qbId };
  }
}

// ============================================
// VENDOR SYNC
// ============================================

export async function syncVendorsFromQB(userId: number): Promise<{ synced: number; errors: string[] }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { synced: 0, errors: ["QuickBooks not connected"] };

  const errors: string[] = [];
  let synced = 0;

  const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "query?query=SELECT * FROM Vendor MAXRESULTS 1000");
  if (result.error || !result.data?.QueryResponse?.Vendor) {
    return { synced: 0, errors: [result.error || "No vendors returned"] };
  }

  for (const qbVendor of result.data.QueryResponse.Vendor) {
    try {
      const existing = await db.getVendorByQuickbooksId(qbVendor.Id);
      if (existing) {
        await db.updateVendor(existing.id, {
          name: qbVendor.DisplayName,
          contactName: qbVendor.GivenName ? `${qbVendor.GivenName} ${qbVendor.FamilyName || ''}`.trim() : undefined,
          email: qbVendor.PrimaryEmailAddr?.Address,
          phone: qbVendor.PrimaryPhone?.FreeFormNumber,
          address: formatQBAddress(qbVendor.BillAddr),
          taxId: qbVendor.TaxIdentifier,
        });
      } else {
        await db.createVendor({
          name: qbVendor.DisplayName,
          contactName: qbVendor.GivenName ? `${qbVendor.GivenName} ${qbVendor.FamilyName || ''}`.trim() : undefined,
          email: qbVendor.PrimaryEmailAddr?.Address,
          phone: qbVendor.PrimaryPhone?.FreeFormNumber,
          address: formatQBAddress(qbVendor.BillAddr),
          type: 'supplier',
          status: qbVendor.Active ? 'active' : 'inactive',
          quickbooksVendorId: qbVendor.Id,
          taxId: qbVendor.TaxIdentifier,
        });
      }
      synced++;
    } catch (err: any) {
      errors.push(`Vendor ${qbVendor.DisplayName}: ${err.message}`);
    }
  }

  await db.createSyncLog({ integration: 'quickbooks', action: 'sync_vendors', status: errors.length ? 'partial' : 'success', details: `Synced ${synced} vendors. ${errors.length} errors.` });
  return { synced, errors };
}

export async function pushVendorToQB(userId: number, vendorId: number): Promise<{ quickbooksId?: string; error?: string }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { error: "QuickBooks not connected" };

  const vendor = await db.getVendorById(vendorId);
  if (!vendor) return { error: "Vendor not found" };

  const qbVendor: any = {
    DisplayName: vendor.name,
    PrimaryEmailAddr: vendor.email ? { Address: vendor.email } : undefined,
    PrimaryPhone: vendor.phone ? { FreeFormNumber: vendor.phone } : undefined,
    TaxIdentifier: vendor.taxId || undefined,
  };

  if (vendor.quickbooksVendorId) {
    const existing = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, `vendor/${vendor.quickbooksVendorId}`);
    if (existing.error) return { error: existing.error };
    qbVendor.Id = vendor.quickbooksVendorId;
    qbVendor.SyncToken = existing.data?.Vendor?.SyncToken;

    const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "vendor", {
      method: "POST",
      body: JSON.stringify(qbVendor),
    });
    if (result.error) return { error: result.error };
    return { quickbooksId: vendor.quickbooksVendorId };
  } else {
    const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "vendor", {
      method: "POST",
      body: JSON.stringify(qbVendor),
    });
    if (result.error) return { error: result.error };
    const qbId = result.data?.Vendor?.Id;
    if (qbId) {
      await db.updateVendor(vendorId, { quickbooksVendorId: qbId });
    }
    return { quickbooksId: qbId };
  }
}

// ============================================
// INVOICE SYNC
// ============================================

export async function syncInvoicesFromQB(userId: number): Promise<{ synced: number; errors: string[] }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { synced: 0, errors: ["QuickBooks not connected"] };

  const errors: string[] = [];
  let synced = 0;

  const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "query?query=SELECT * FROM Invoice MAXRESULTS 500");
  if (result.error || !result.data?.QueryResponse?.Invoice) {
    return { synced: 0, errors: [result.error || "No invoices returned"] };
  }

  for (const qbInv of result.data.QueryResponse.Invoice) {
    try {
      // Check if we already have this invoice
      const existing = await db.getInvoiceByQuickbooksId(qbInv.Id.toString());
      if (existing) {
        // Update status based on QB balance
        const balance = parseFloat(qbInv.Balance || '0');
        const total = parseFloat(qbInv.TotalAmt || '0');
        let status: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled' = 'sent';
        if (balance === 0) status = 'paid';
        else if (balance < total) status = 'partial';

        await db.updateInvoice(existing.id, {
          status,
          paidAmount: (total - balance).toFixed(2),
        });
      } else {
        // Create new invoice from QB
        const balance = parseFloat(qbInv.Balance || '0');
        const total = parseFloat(qbInv.TotalAmt || '0');
        let status: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled' = 'sent';
        if (balance === 0) status = 'paid';
        else if (balance < total) status = 'partial';

        // Find linked customer
        let customerId: number | undefined;
        if (qbInv.CustomerRef?.value) {
          const linkedCustomer = await db.getCustomerByQuickbooksId(qbInv.CustomerRef.value);
          if (linkedCustomer) customerId = linkedCustomer.id;
        }

        await db.createInvoice({
          invoiceNumber: qbInv.DocNumber || `QB-${qbInv.Id}`,
          customerId,
          type: 'invoice',
          status,
          issueDate: new Date(qbInv.TxnDate),
          dueDate: qbInv.DueDate ? new Date(qbInv.DueDate) : undefined,
          subtotal: (total - parseFloat(qbInv.TxnTaxDetail?.TotalTax || '0')).toFixed(2),
          taxAmount: (qbInv.TxnTaxDetail?.TotalTax || 0).toString(),
          totalAmount: total.toFixed(2),
          paidAmount: (total - balance).toFixed(2),
          quickbooksInvoiceId: qbInv.Id,
        });
      }
      synced++;
    } catch (err: any) {
      errors.push(`Invoice ${qbInv.DocNumber}: ${err.message}`);
    }
  }

  await db.createSyncLog({ integration: 'quickbooks', action: 'sync_invoices', status: errors.length ? 'partial' : 'success', details: `Synced ${synced} invoices. ${errors.length} errors.` });
  return { synced, errors };
}

export async function pushInvoiceToQB(userId: number, invoiceId: number): Promise<{ quickbooksId?: string; error?: string }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { error: "QuickBooks not connected" };

  const invoice = await db.getInvoiceWithItems(invoiceId);
  if (!invoice) return { error: "Invoice not found" };

  // Build QB invoice object
  const qbInvoice: any = {
    DocNumber: invoice.invoiceNumber,
    TxnDate: new Date(invoice.issueDate).toISOString().split('T')[0],
    DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : undefined,
    Line: (invoice.items || []).map((item: any, idx: number) => ({
      LineNum: idx + 1,
      Amount: parseFloat(item.totalAmount),
      DetailType: "SalesItemLineDetail",
      Description: item.description,
      SalesItemLineDetail: {
        Qty: parseFloat(item.quantity),
        UnitPrice: parseFloat(item.unitPrice),
      },
    })),
  };

  // Link to QB customer if available
  if (invoice.customerId) {
    const customer = await db.getCustomerById(invoice.customerId);
    if (customer?.quickbooksCustomerId) {
      qbInvoice.CustomerRef = { value: customer.quickbooksCustomerId };
    }
  }

  if (invoice.quickbooksInvoiceId) {
    // Update existing
    const existing = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, `invoice/${invoice.quickbooksInvoiceId}`);
    if (existing.error) return { error: existing.error };
    qbInvoice.Id = invoice.quickbooksInvoiceId;
    qbInvoice.SyncToken = existing.data?.Invoice?.SyncToken;
  }

  const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "invoice", {
    method: "POST",
    body: JSON.stringify(qbInvoice),
  });

  if (result.error) return { error: result.error };
  const qbId = result.data?.Invoice?.Id;
  if (qbId && !invoice.quickbooksInvoiceId) {
    await db.updateInvoice(invoiceId, { quickbooksInvoiceId: qbId });
  }
  return { quickbooksId: qbId };
}

// ============================================
// ACCOUNT SYNC (Chart of Accounts)
// ============================================

export async function syncAccountsFromQB(userId: number): Promise<{ synced: number; errors: string[] }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { synced: 0, errors: ["QuickBooks not connected"] };

  const errors: string[] = [];
  let synced = 0;

  const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "query?query=SELECT * FROM Account MAXRESULTS 1000");
  if (result.error || !result.data?.QueryResponse?.Account) {
    return { synced: 0, errors: [result.error || "No accounts returned"] };
  }

  for (const qbAcct of result.data.QueryResponse.Account) {
    try {
      const existingAcct = await db.getAccountByQuickbooksId(qbAcct.Id.toString());
      const accountType = mapQBAccountType(qbAcct.AccountType);

      if (existingAcct) {
        await db.updateAccount(existingAcct.id, {
          name: qbAcct.Name,
          isActive: qbAcct.Active,
        });
      } else {
        await db.createAccount({
          code: qbAcct.AcctNum || qbAcct.Id,
          name: qbAcct.Name,
          type: accountType,
          subtype: qbAcct.AccountSubType || undefined,
          quickbooksAccountId: qbAcct.Id,
          isActive: qbAcct.Active,
        });
      }
      synced++;
    } catch (err: any) {
      errors.push(`Account ${qbAcct.Name}: ${err.message}`);
    }
  }

  await db.createSyncLog({ integration: 'quickbooks', action: 'sync_accounts', status: errors.length ? 'partial' : 'success', details: `Synced ${synced} accounts. ${errors.length} errors.` });
  return { synced, errors };
}

// ============================================
// PAYMENT SYNC
// ============================================

export async function syncPaymentsFromQB(userId: number): Promise<{ synced: number; errors: string[] }> {
  const ctx = await getAuthenticatedContext(userId);
  if (!ctx) return { synced: 0, errors: ["QuickBooks not connected"] };

  const errors: string[] = [];
  let synced = 0;

  const result = await makeQuickBooksRequest(ctx.accessToken, ctx.realmId, "query?query=SELECT * FROM Payment MAXRESULTS 500");
  if (result.error || !result.data?.QueryResponse?.Payment) {
    return { synced: 0, errors: [result.error || "No payments returned"] };
  }

  for (const qbPay of result.data.QueryResponse.Payment) {
    try {
      const existingPay = await db.getPaymentByQuickbooksId(qbPay.Id);
      if (!existingPay) {
        // Find linked customer
        let customerId: number | undefined;
        if (qbPay.CustomerRef?.value) {
          const payCustomer = await db.getCustomerByQuickbooksId(qbPay.CustomerRef.value);
          if (payCustomer) customerId = payCustomer.id;
        }

        // Find linked invoice
        let invoiceId: number | undefined;
        if (qbPay.Line?.[0]?.LinkedTxn?.[0]?.TxnId) {
          const inv = await db.getInvoiceByQuickbooksId(qbPay.Line[0].LinkedTxn[0].TxnId);
          if (inv) invoiceId = inv.id;
        }

        await db.createPayment({
          type: 'received',
          status: 'completed',
          amount: qbPay.TotalAmt?.toString() || '0',
          currency: qbPay.CurrencyRef?.value || 'USD',
          paymentMethod: mapQBPaymentMethod(qbPay.PaymentMethodRef?.name),
          paymentNumber: `QB-${qbPay.Id}`,
          paymentDate: new Date(qbPay.TxnDate),
          customerId,
          invoiceId,
          quickbooksPaymentId: qbPay.Id,
        });
        synced++;
      }
    } catch (err: any) {
      errors.push(`Payment QB-${qbPay.Id}: ${err.message}`);
    }
  }

  await db.createSyncLog({ integration: 'quickbooks', action: 'sync_payments', status: errors.length ? 'partial' : 'success', details: `Synced ${synced} payments. ${errors.length} errors.` });
  return { synced, errors };
}

// ============================================
// FULL SYNC
// ============================================

export async function runFullSync(userId: number): Promise<{
  accounts: { synced: number; errors: string[] };
  customers: { synced: number; errors: string[] };
  vendors: { synced: number; errors: string[] };
  invoices: { synced: number; errors: string[] };
  payments: { synced: number; errors: string[] };
}> {
  const accountsResult = await syncAccountsFromQB(userId);
  const customersResult = await syncCustomersFromQB(userId);
  const vendorsResult = await syncVendorsFromQB(userId);
  const invoicesResult = await syncInvoicesFromQB(userId);
  const paymentsResult = await syncPaymentsFromQB(userId);

  await db.createSyncLog({
    integration: 'quickbooks',
    action: 'full_sync',
    status: 'success',
    details: JSON.stringify({
      accounts: accountsResult.synced,
      customers: customersResult.synced,
      vendors: vendorsResult.synced,
      invoices: invoicesResult.synced,
      payments: paymentsResult.synced,
    }),
  });

  return {
    accounts: accountsResult,
    customers: customersResult,
    vendors: vendorsResult,
    invoices: invoicesResult,
    payments: paymentsResult,
  };
}

// ============================================
// HELPERS
// ============================================

function formatQBAddress(addr: any): string | undefined {
  if (!addr) return undefined;
  const parts = [addr.Line1, addr.Line2, addr.City, addr.CountrySubDivisionCode, addr.PostalCode, addr.Country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function mapQBAccountType(qbType: string): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' {
  const typeMap: Record<string, 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'> = {
    'Bank': 'asset',
    'Other Current Asset': 'asset',
    'Fixed Asset': 'asset',
    'Other Asset': 'asset',
    'Accounts Receivable': 'asset',
    'Accounts Payable': 'liability',
    'Credit Card': 'liability',
    'Other Current Liability': 'liability',
    'Long Term Liability': 'liability',
    'Equity': 'equity',
    'Income': 'revenue',
    'Other Income': 'revenue',
    'Cost of Goods Sold': 'expense',
    'Expense': 'expense',
    'Other Expense': 'expense',
  };
  return typeMap[qbType] || 'expense';
}

function mapQBPaymentMethod(name?: string): 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'ach' | 'wire' | 'other' {
  if (!name) return 'other';
  const lower = name.toLowerCase();
  if (lower.includes('cash')) return 'cash';
  if (lower.includes('check')) return 'check';
  if (lower.includes('credit') || lower.includes('card')) return 'credit_card';
  if (lower.includes('ach')) return 'ach';
  if (lower.includes('wire')) return 'wire';
  if (lower.includes('transfer')) return 'bank_transfer';
  return 'other';
}

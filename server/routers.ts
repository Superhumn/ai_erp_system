import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "./_core/email";
import { processEmailReply, analyzeEmail, generateEmailReply } from "./emailReplyService";
import * as emailService from "./_core/emailService";
import * as sendgridProvider from "./_core/sendgridProvider";
import { parseUploadedDocument, importPurchaseOrder, importFreightInvoice, importVendorInvoice, importCustomsDocument, matchLineItemsToMaterials } from "./documentImportService";
import { processAIAgentRequest, getQuickAnalysis, getSystemOverview, getPendingActions, type AIAgentContext } from "./aiAgentService";
import { autonomousWorkflowRouter } from "./autonomousWorkflowRouter";
import * as db from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { sendGmailMessage, createGmailDraft, listGmailMessages, getGmailMessage, replyToGmailMessage, getGmailProfile } from "./_core/gmail";
import { createGoogleDoc, insertTextInDoc, getGoogleDoc, updateGoogleDoc, createGoogleSheet, updateGoogleSheet, appendToGoogleSheet, getGoogleSheetValues, shareGoogleFile, getFileShareableLink } from "./_core/googleWorkspace";
import { getGoogleFullAccessAuthUrl, syncDriveFolder, listDriveFolders, getFolderInfo, getSimpleFileType } from "./_core/googleDrive";
import { getQuickBooksAuthUrl, validateOAuthState, exchangeCodeForToken, refreshQuickBooksToken, getCompanyInfo } from "./_core/quickbooks";
import { listTranscripts, getTranscript, extractParticipants, parseActionItems, validateApiKey as validateFirefliesApiKey } from "./_core/fireflies";

// Role-based access middleware
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

const financeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'finance', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Finance access required' });
  }
  return next({ ctx });
});

const opsProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operations access required' });
  }
  return next({ ctx });
});

const legalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'legal', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Legal access required' });
  }
  return next({ ctx });
});

// Copacker can only access their assigned warehouse inventory
const copackerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'copacker'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Copacker access required' });
  }
  return next({ ctx });
});

// Vendor can access their own purchase orders and shipments
const vendorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'vendor'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Vendor access required' });
  }
  return next({ ctx });
});

// Helper to create audit log
async function createAuditLog(userId: number, action: 'create' | 'update' | 'delete' | 'view' | 'export' | 'approve' | 'reject', entityType: string, entityId: number, entityName?: string, oldValues?: any, newValues?: any) {
  await db.createAuditLog({
    userId,
    action,
    entityType,
    entityId,
    entityName,
    oldValues,
    newValues,
  });
}

// Helper to refresh Google OAuth token
async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken?: string; expiresAt?: Date; error?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return { error: 'Google OAuth not configured' };
  }
  
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[Google OAuth] Failed to refresh token:', error);
      return { error: 'Failed to refresh token' };
    }
    
    const data = await response.json();
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));
    
    return {
      accessToken: data.access_token,
      expiresAt,
    };
  } catch (error: any) {
    console.error('[Google OAuth] Error refreshing token:', error);
    return { error: error.message };
  }
}

// Helper to get valid Google access token (refreshes if needed)
async function getValidGoogleToken(userId: number): Promise<{ accessToken: string; error?: string }> {
  const token = await db.getGoogleOAuthToken(userId);
  
  if (!token) {
    return { accessToken: '', error: 'Google account not connected' };
  }
  
  // Check if token needs refresh
  if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
    const refreshed = await refreshGoogleToken(token.refreshToken);
    
    if (refreshed.accessToken && refreshed.expiresAt) {
      // Update database with new token
      await db.upsertGoogleOAuthToken({
        userId,
        accessToken: refreshed.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: refreshed.expiresAt,
      });
      return { accessToken: refreshed.accessToken };
    }
    
    return { accessToken: '', error: refreshed.error || 'Failed to refresh token' };
  }
  
  return { accessToken: token.accessToken };
}

// Helper to generate unique numbers
function generateNumber(prefix: string) {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}${month}-${random}`;
}

export const appRouter = router({
  system: systemRouter,

  // Autonomous Supply Chain Workflows
  autonomousWorkflows: autonomousWorkflowRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============================================
  // USER MANAGEMENT
  // ============================================
  users: router({
    list: adminProcedure.query(() => db.getAllUsers()),
    updateRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin', 'finance', 'ops', 'legal', 'exec']) }))
      .mutation(async ({ input, ctx }) => {
        await db.updateUserRole(input.userId, input.role);
        await createAuditLog(ctx.user.id, 'update', 'user', input.userId, undefined, undefined, { role: input.role });
        return { success: true };
      }),
  }),

  // ============================================
  // COMPANY MANAGEMENT
  // ============================================
  companies: router({
    list: protectedProcedure.query(() => db.getCompanies()),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getCompanyById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        legalName: z.string().optional(),
        taxId: z.string().optional(),
        type: z.enum(['parent', 'subsidiary', 'branch']).optional(),
        parentCompanyId: z.number().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCompany(input);
        await createAuditLog(ctx.user.id, 'create', 'company', result.id, input.name);
        return result;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        legalName: z.string().optional(),
        taxId: z.string().optional(),
        status: z.enum(['active', 'inactive', 'pending']).optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateCompany(id, data);
        await createAuditLog(ctx.user.id, 'update', 'company', id);
        return { success: true };
      }),
  }),

  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================
  customers: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getCustomers(input?.companyId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getCustomerById(input.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['individual', 'business']).optional(),
        creditLimit: z.string().optional(),
        paymentTerms: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCustomer(input);
        await createAuditLog(ctx.user.id, 'create', 'customer', result.id, input.name);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        status: z.enum(['active', 'inactive', 'prospect']).optional(),
        creditLimit: z.string().optional(),
        paymentTerms: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateCustomer(id, data);
        await createAuditLog(ctx.user.id, 'update', 'customer', id);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteCustomer(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'customer', input.id);
        return { success: true };
      }),
    
    // Shopify sync
    syncFromShopify: adminProcedure
      .input(z.object({ shopifyAccessToken: z.string(), shopifyStoreDomain: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { shopifyAccessToken, shopifyStoreDomain } = input;
        
        // Fetch customers from Shopify
        const response = await fetch(`https://${shopifyStoreDomain}/admin/api/2024-01/customers.json`, {
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Failed to fetch Shopify customers' });
        }
        
        const data = await response.json();
        const shopifyCustomers = data.customers || [];
        
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        
        for (const sc of shopifyCustomers) {
          // Check if customer already exists by Shopify ID
          const existing = await db.getCustomerByShopifyId(sc.id.toString());
          
          const customerData = {
            name: `${sc.first_name || ''} ${sc.last_name || ''}`.trim() || sc.email || 'Unknown',
            email: sc.email || undefined,
            phone: sc.phone || undefined,
            address: sc.default_address?.address1 || undefined,
            city: sc.default_address?.city || undefined,
            state: sc.default_address?.province || undefined,
            country: sc.default_address?.country || undefined,
            postalCode: sc.default_address?.zip || undefined,
            type: 'individual' as const,
            shopifyCustomerId: sc.id.toString(),
            syncSource: 'shopify' as const,
            lastSyncedAt: new Date(),
            shopifyData: JSON.stringify(sc),
          };
          
          if (existing) {
            await db.updateCustomer(existing.id, customerData);
            updated++;
          } else {
            await db.createCustomer(customerData);
            imported++;
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'shopify_sync', 0, `Imported ${imported}, Updated ${updated}`);
        
        return { imported, updated, skipped, total: shopifyCustomers.length };
      }),
    
    // HubSpot sync
    syncFromHubspot: adminProcedure
      .input(z.object({ hubspotAccessToken: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { hubspotAccessToken } = input;
        
        // Fetch contacts from HubSpot
        const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=email,firstname,lastname,phone,address,city,state,country,zip,company', {
          headers: {
            'Authorization': `Bearer ${hubspotAccessToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Failed to fetch HubSpot contacts' });
        }
        
        const data = await response.json();
        const hubspotContacts = data.results || [];
        
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        
        for (const hc of hubspotContacts) {
          const props = hc.properties || {};
          
          // Check if customer already exists by HubSpot ID
          const existing = await db.getCustomerByHubspotId(hc.id.toString());
          
          const customerData = {
            name: `${props.firstname || ''} ${props.lastname || ''}`.trim() || props.email || 'Unknown',
            email: props.email || undefined,
            phone: props.phone || undefined,
            address: props.address || undefined,
            city: props.city || undefined,
            state: props.state || undefined,
            country: props.country || undefined,
            postalCode: props.zip || undefined,
            type: props.company ? 'business' as const : 'individual' as const,
            hubspotContactId: hc.id.toString(),
            syncSource: 'hubspot' as const,
            lastSyncedAt: new Date(),
            hubspotData: JSON.stringify(hc),
          };
          
          if (existing) {
            await db.updateCustomer(existing.id, customerData);
            updated++;
          } else {
            await db.createCustomer(customerData);
            imported++;
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'hubspot_sync', 0, `Imported ${imported}, Updated ${updated}`);
        
        return { imported, updated, skipped, total: hubspotContacts.length };
      }),
    
    // Get sync status
    getSyncStatus: protectedProcedure.query(async () => {
      const customers = await db.getCustomers();
      const shopifyCount = customers.filter(c => c.shopifyCustomerId).length;
      const hubspotCount = customers.filter(c => c.hubspotContactId).length;
      const manualCount = customers.filter(c => !c.shopifyCustomerId && !c.hubspotContactId).length;
      
      return {
        total: customers.length,
        shopify: shopifyCount,
        hubspot: hubspotCount,
        manual: manualCount,
      };
    }),
  }),

  // ============================================
  // VENDOR MANAGEMENT
  // ============================================
  vendors: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getVendors(input?.companyId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getVendorById(input.id)),
    create: opsProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['supplier', 'contractor', 'service']).optional(),
        paymentTerms: z.number().optional(),
        defaultLeadTimeDays: z.number().optional(),
        taxId: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createVendor(input);
        await createAuditLog(ctx.user.id, 'create', 'vendor', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        status: z.enum(['active', 'inactive', 'pending']).optional(),
        paymentTerms: z.number().optional(),
        defaultLeadTimeDays: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateVendor(id, data);
        await createAuditLog(ctx.user.id, 'update', 'vendor', id);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteVendor(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'vendor', input.id);
        return { success: true };
      }),
  }),

  // ============================================
  // PRODUCT MANAGEMENT
  // ============================================
  products: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getProducts(input?.companyId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getProductById(input.id)),
    create: opsProcedure
      .input(z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        companyId: z.number().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(['physical', 'digital', 'service']).optional(),
        unitPrice: z.string(),
        costPrice: z.string().optional(),
        currency: z.string().optional(),
        taxable: z.boolean().optional(),
        taxRate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProduct(input);
        await createAuditLog(ctx.user.id, 'create', 'product', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unitPrice: z.string().optional(),
        costPrice: z.string().optional(),
        status: z.enum(['active', 'inactive', 'discontinued']).optional(),
        taxable: z.boolean().optional(),
        taxRate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProduct(id, data);
        await createAuditLog(ctx.user.id, 'update', 'product', id);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProduct(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'product', input.id);
        return { success: true };
      }),
  }),

  // ============================================
  // FINANCE - ACCOUNTS
  // ============================================
  accounts: router({
    list: financeProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getAccounts(input?.companyId)),
    get: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getAccountById(input.id)),
    create: financeProcedure
      .input(z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
        companyId: z.number().optional(),
        subtype: z.string().optional(),
        description: z.string().optional(),
        currency: z.string().optional(),
        parentAccountId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createAccount(input);
        await createAuditLog(ctx.user.id, 'create', 'account', result.id, input.name);
        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateAccount(id, data);
        await createAuditLog(ctx.user.id, 'update', 'account', id);
        return { success: true };
      }),
  }),

  // ============================================
  // FINANCE - INVOICES
  // ============================================
  invoices: router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInvoices(input)),
    get: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getInvoiceWithItems(input.id)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        customerId: z.number().optional(),
        type: z.enum(['invoice', 'credit_note', 'quote']).optional(),
        issueDate: z.date(),
        dueDate: z.date().optional(),
        subtotal: z.string(),
        taxAmount: z.string().optional(),
        discountAmount: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
          taxAmount: z.string().optional(),
          totalAmount: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...invoiceData } = input;
        const invoiceNumber = generateNumber('INV');
        const result = await db.createInvoice({ ...invoiceData, invoiceNumber, createdBy: ctx.user.id });
        
        if (items && items.length > 0) {
          for (const item of items) {
            await db.createInvoiceItem({ ...item, invoiceId: result.id });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'invoice', result.id, invoiceNumber);
        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled']).optional(),
        dueDate: z.date().optional(),
        paidAmount: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldInvoice = await db.getInvoiceById(id);
        await db.updateInvoice(id, data);
        await createAuditLog(ctx.user.id, 'update', 'invoice', id, oldInvoice?.invoiceNumber, oldInvoice, data);
        return { success: true };
      }),
    approve: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateInvoice(input.id, { status: 'sent', approvedBy: ctx.user.id, approvedAt: new Date() });
        await createAuditLog(ctx.user.id, 'approve', 'invoice', input.id);
        return { success: true };
      }),
    sendEmail: financeProcedure
      .input(z.object({
        invoiceId: z.number(),
        message: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoice = await db.getInvoiceWithItems(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        
        const customer = invoice.customer;
        if (!customer?.email) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Customer has no email address' });
        }
        
        // Format line items for email
        const itemsHtml = invoice.items?.map((item: any) => 
          `<tr><td>${item.description}</td><td>${item.quantity}</td><td>$${Number(item.unitPrice).toFixed(2)}</td><td>$${Number(item.totalAmount).toFixed(2)}</td></tr>`
        ).join('') || '';
        
        const emailContent = `
          <h2>Invoice ${invoice.invoiceNumber}</h2>
          <p>Dear ${customer.name},</p>
          ${input.message ? `<p>${input.message}</p>` : ''}
          <p>Please find your invoice details below:</p>
          <table border="1" cellpadding="8" style="border-collapse: collapse;">
            <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
            ${itemsHtml}
          </table>
          <p><strong>Subtotal:</strong> $${Number(invoice.subtotal).toFixed(2)}</p>
          <p><strong>Tax:</strong> $${Number(invoice.taxAmount || 0).toFixed(2)}</p>
          <p><strong>Total Due:</strong> $${Number(invoice.totalAmount).toFixed(2)}</p>
          <p><strong>Due Date:</strong> ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}</p>
          ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
          <p>Thank you for your business!</p>
        `;
        
        const { sendEmail } = await import('./_core/email');
        await sendEmail({
          to: customer.email,
          subject: `Invoice ${invoice.invoiceNumber} from SuperHumn`,
          html: emailContent,
        });
        
        // Update invoice status to sent
        await db.updateInvoice(input.invoiceId, { status: 'sent' });
        await createAuditLog(ctx.user.id, 'update', 'invoice', input.invoiceId, invoice.invoiceNumber);
        
        return { success: true };
      }),
    generatePdf: financeProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await db.getInvoiceWithItems(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        
        const { generateInvoicePdf, getDefaultCompanyInfo } = await import('./_core/invoicePdf');
        const company = getDefaultCompanyInfo();
        
        const pdfBuffer = await generateInvoicePdf({
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          customer: {
            name: invoice.customer?.name || 'Customer',
            email: invoice.customer?.email,
          },
          items: invoice.items.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          })),
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          discountAmount: invoice.discountAmount,
          totalAmount: invoice.totalAmount,
          notes: invoice.notes,
          terms: invoice.terms,
          currency: invoice.currency || 'USD',
        }, company);
        
        // Return base64 encoded PDF
        return { 
          pdf: pdfBuffer.toString('base64'),
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
        };
      }),
    recordPayment: financeProcedure
      .input(z.object({
        invoiceId: z.number(),
        amount: z.string(),
        paymentMethod: z.enum(['cash', 'check', 'bank_transfer', 'credit_card', 'other']).default('bank_transfer'),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoice = await db.getInvoiceById(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        
        // Create payment record
        const paymentResult = await db.createPayment({
          companyId: invoice.companyId,
          type: 'received',
          status: 'completed',
          amount: input.amount,
          currency: invoice.currency || 'USD',
          paymentMethod: input.paymentMethod,
          paymentNumber: `PAY-${Date.now()}`,
          paymentDate: new Date(),
          invoiceId: input.invoiceId,
          notes: input.notes || `Payment received for invoice ${invoice.invoiceNumber}`,
        });
        
        // Update invoice paid amount and status
        const currentPaid = parseFloat(invoice.paidAmount || '0');
        const newPayment = parseFloat(input.amount);
        const totalPaid = currentPaid + newPayment;
        const totalDue = parseFloat(invoice.totalAmount);
        
        const newStatus = totalPaid >= totalDue ? 'paid' : 'partial';
        await db.updateInvoice(input.invoiceId, {
          paidAmount: totalPaid.toString(),
          status: newStatus,
        });
        
        await createAuditLog(ctx.user.id, 'update', 'invoice', input.invoiceId, `Payment recorded: ${input.amount}`);
        
        return { 
          success: true, 
          paymentId: paymentResult.id,
          newStatus,
          totalPaid: totalPaid.toString(),
        };
      }),
  }),

  // ============================================
  // FINANCE - PAYMENTS
  // ============================================
  payments: router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getPayments(input)),
    get: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPaymentById(input.id)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['received', 'made']),
        invoiceId: z.number().optional(),
        vendorId: z.number().optional(),
        customerId: z.number().optional(),
        accountId: z.number().optional(),
        amount: z.string(),
        currency: z.string().optional(),
        paymentMethod: z.enum(['cash', 'check', 'bank_transfer', 'credit_card', 'ach', 'wire', 'other']).optional(),
        paymentDate: z.date(),
        referenceNumber: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const paymentNumber = generateNumber('PAY');
        const result = await db.createPayment({ ...input, paymentNumber, createdBy: ctx.user.id });
        
        // Update invoice paid amount if linked
        if (input.invoiceId) {
          const invoice = await db.getInvoiceById(input.invoiceId);
          if (invoice) {
            const newPaidAmount = (parseFloat(invoice.paidAmount || '0') + parseFloat(input.amount)).toString();
            const newStatus = parseFloat(newPaidAmount) >= parseFloat(invoice.totalAmount) ? 'paid' : 'partial';
            await db.updateInvoice(input.invoiceId, { paidAmount: newPaidAmount, status: newStatus });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'payment', result.id, paymentNumber);
        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updatePayment(id, data);
        await createAuditLog(ctx.user.id, 'update', 'payment', id);
        return { success: true };
      }),
  }),

  // ============================================
  // FINANCE - TRANSACTIONS
  // ============================================
  transactions: router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getTransactions(input)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['journal', 'invoice', 'payment', 'expense', 'transfer', 'adjustment']),
        date: z.date(),
        description: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const transactionNumber = generateNumber('TXN');
        const result = await db.createTransaction({ ...input, transactionNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'transaction', result.id, transactionNumber);
        return result;
      }),
  }),

  // ============================================
  // SALES - ORDERS
  // ============================================
  orders: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getOrders(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getOrderWithItems(input.id)),
    create: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        customerId: z.number().optional(),
        type: z.enum(['sales', 'return']).optional(),
        orderDate: z.date(),
        shippingAddress: z.string().optional(),
        billingAddress: z.string().optional(),
        subtotal: z.string(),
        taxAmount: z.string().optional(),
        shippingAmount: z.string().optional(),
        discountAmount: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          sku: z.string().optional(),
          name: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          taxAmount: z.string().optional(),
          discountAmount: z.string().optional(),
          totalAmount: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...orderData } = input;
        const orderNumber = generateNumber('ORD');
        const result = await db.createOrder({ ...orderData, orderNumber, createdBy: ctx.user.id });
        
        if (items && items.length > 0) {
          for (const item of items) {
            await db.createOrderItem({ ...item, orderId: result.id });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'order', result.id, orderNumber);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateOrder(id, data);
        await createAuditLog(ctx.user.id, 'update', 'order', id);
        return { success: true };
      }),
  }),

  // ============================================
  // OPERATIONS - INVENTORY
  // ============================================
  inventory: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        warehouseId: z.number().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInventory(input)),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        productId: z.number(),
        warehouseId: z.number().optional(),
        quantity: z.string(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createInventory(input);
        await createAuditLog(ctx.user.id, 'create', 'inventory', result.id);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.string().optional(),
        reservedQuantity: z.string().optional(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const [oldInventory] = await db.getInventory({ id } as any) || [];
        await db.updateInventory(id, data);
        await createAuditLog(ctx.user.id, 'update', 'inventory', id);

        // Check for low stock and create notification
        if (data.quantity && oldInventory) {
          const newQty = parseFloat(data.quantity);
          const reorderLevel = parseFloat(oldInventory.reorderLevel || '0');

          if (newQty <= reorderLevel && newQty > 0) {
            const allUsers = await db.getAllUsers();
            const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
            const product = await db.getProductById(oldInventory.productId);

            await db.notifyUsersOfEvent({
              type: 'inventory_low',
              title: `Low Stock Alert: ${product?.name || 'Product'}`,
              message: `Inventory for ${product?.name} is at ${newQty} units, below reorder level of ${reorderLevel}`,
              entityType: 'inventory',
              entityId: id,
              severity: 'warning',
              link: `/operations/inventory`,
              metadata: { productId: oldInventory.productId, quantity: newQty, reorderLevel },
            }, opsUsers.map(u => u.id));
          }
        }

        return { success: true };
      }),
    bulkUpdate: opsProcedure
      .input(z.object({
        ids: z.array(z.number()),
        action: z.enum(['adjust_quantity', 'change_location', 'update_reorder_point']),
        quantityAdjustment: z.number().optional(),
        warehouseId: z.number().optional(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { ids, action, ...data } = input;

        // Build the update data based on action
        const updateData: {
          quantityAdjustment?: number;
          warehouseId?: number;
          reorderLevel?: string;
          reorderQuantity?: string;
        } = {};

        switch (action) {
          case 'adjust_quantity':
            if (data.quantityAdjustment !== undefined) {
              updateData.quantityAdjustment = data.quantityAdjustment;
            }
            break;
          case 'change_location':
            if (data.warehouseId !== undefined) {
              updateData.warehouseId = data.warehouseId;
            }
            break;
          case 'update_reorder_point':
            if (data.reorderLevel !== undefined) {
              updateData.reorderLevel = data.reorderLevel;
            }
            if (data.reorderQuantity !== undefined) {
              updateData.reorderQuantity = data.reorderQuantity;
            }
            break;
        }

        const results = await db.bulkUpdateInventory(ids, updateData);

        // Create audit logs for each updated item
        for (const result of results.filter(r => r.success)) {
          await createAuditLog(ctx.user.id, 'bulk_update', 'inventory', result.id);
        }

        // Check for low stock alerts on quantity adjustments
        if (action === 'adjust_quantity' && data.quantityAdjustment !== undefined) {
          const updatedItems = await db.getInventoryByIds(ids);
          const allUsers = await db.getAllUsers();
          const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));

          for (const item of updatedItems) {
            const qty = parseFloat(item.quantity || '0');
            const reorderLevel = parseFloat(item.reorderLevel || '0');

            if (qty <= reorderLevel && qty > 0) {
              const product = await db.getProductById(item.productId);
              await db.notifyUsersOfEvent({
                type: 'inventory_low',
                title: `Low Stock Alert: ${product?.name || 'Product'}`,
                message: `Inventory for ${product?.name} is at ${qty} units, below reorder level of ${reorderLevel}`,
                entityType: 'inventory',
                entityId: item.id,
                severity: 'warning',
                link: `/operations/inventory`,
                metadata: { productId: item.productId, quantity: qty, reorderLevel },
              }, opsUsers.map(u => u.id));
            }
          }
        }

        return {
          success: true,
          results,
          totalUpdated: results.filter(r => r.success).length,
          totalFailed: results.filter(r => !r.success).length,
        };
      }),
    // Get pending inventory from POs (on order or in transit)
    getPendingFromPOs: opsProcedure
      .query(() => db.getPendingInventoryFromPOs()),
    // Get inbound shipments from POs
    getInboundShipments: opsProcedure
      .query(() => db.getInboundShipmentsFromPOs()),
  }),

  // ============================================
  // OPERATIONS - WAREHOUSES
  // ============================================
  warehouses: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getWarehouses(input)),
    getById: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getWarehouseById(input.id)),
    create: opsProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['warehouse', 'store', 'distribution', 'copacker', '3pl']).optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWarehouse(input);
        await createAuditLog(ctx.user.id, 'create', 'warehouse', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['warehouse', 'store', 'distribution', 'copacker', '3pl']).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateWarehouse(id, data);
        await createAuditLog(ctx.user.id, 'update', 'warehouse', id, `Updated warehouse ${id}`);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteWarehouse(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'warehouse', input.id, `Deleted warehouse ${input.id}`);
        return { success: true };
      }),
    summary: opsProcedure.query(() => db.getLocationInventorySummary()),
  }),

  // ============================================
  // INVENTORY TRANSFERS
  // ============================================
  transfers: router({
    list: opsProcedure
      .input(z.object({
        status: z.string().optional(),
        fromWarehouseId: z.number().optional(),
        toWarehouseId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInventoryTransfers(input)),
    getById: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const transfer = await db.getTransferById(input.id);
        const items = await db.getTransferItems(input.id);
        return { transfer, items };
      }),
    create: opsProcedure
      .input(z.object({
        fromWarehouseId: z.number(),
        toWarehouseId: z.number(),
        requestedDate: z.date(),
        expectedArrival: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createTransfer({
          ...input,
          requestedBy: ctx.user.id,
        });
        await createAuditLog(ctx.user.id, 'create', 'transfer', result.id, result.transferNumber);
        return result;
      }),
    addItem: opsProcedure
      .input(z.object({
        transferId: z.number(),
        productId: z.number(),
        requestedQuantity: z.string(),
        lotNumber: z.string().optional(),
        expirationDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.addTransferItem(input);
      }),
    ship: opsProcedure
      .input(z.object({
        id: z.number(),
        trackingNumber: z.string().optional(),
        carrier: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.trackingNumber || input.carrier) {
          await db.updateTransfer(input.id, {
            trackingNumber: input.trackingNumber,
            carrier: input.carrier,
          });
        }
        await db.processTransferShipment(input.id);
        await createAuditLog(ctx.user.id, 'update', 'transfer', input.id, 'Shipped transfer');
        return { success: true };
      }),
    receive: opsProcedure
      .input(z.object({
        id: z.number(),
        items: z.array(z.object({
          itemId: z.number(),
          receivedQuantity: z.number(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.processTransferReceipt(input.id, input.items);
        await createAuditLog(ctx.user.id, 'update', 'transfer', input.id, 'Received transfer');
        return { success: true };
      }),
    cancel: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateTransfer(input.id, { status: 'cancelled' });
        await createAuditLog(ctx.user.id, 'update', 'transfer', input.id, 'Cancelled transfer');
        return { success: true };
      }),
  }),

  // ============================================
  // OPERATIONS - PRODUCTION BATCHES
  // ============================================
  productionBatches: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getProductionBatches(input)),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        productId: z.number(),
        quantity: z.string(),
        status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
        startDate: z.date().optional(),
        completionDate: z.date().optional(),
        warehouseId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const batchNumber = generateNumber('BATCH');
        const result = await db.createProductionBatch({ ...input, batchNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'productionBatch', result.id, batchNumber);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
        completionDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProductionBatch(id, data);
        await createAuditLog(ctx.user.id, 'update', 'productionBatch', id);
        return { success: true };
      }),
  }),

  // ============================================
  // OPERATIONS - PURCHASE ORDERS
  // ============================================
  purchaseOrders: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        vendorId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getPurchaseOrders(input)),
    get: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPurchaseOrderWithItems(input.id)),
    getItems: opsProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(({ input }) => db.getPurchaseOrderItems(input.purchaseOrderId)),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        vendorId: z.number(),
        orderDate: z.date(),
        expectedDate: z.date().optional(),
        shippingAddress: z.string().optional(),
        subtotal: z.string(),
        taxAmount: z.string().optional(),
        shippingAmount: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          totalAmount: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...poData } = input;
        const poNumber = generateNumber('PO');
        const result = await db.createPurchaseOrder({ ...poData, poNumber, createdBy: ctx.user.id });

        if (items && items.length > 0) {
          for (const item of items) {
            const poItem = await db.createPurchaseOrderItem({ ...item, purchaseOrderId: result.id });

            // Try to link to raw material if productId is provided
            if (item.productId) {
              const product = await db.getProductById(item.productId);
              if (product) {
                // Try to find matching raw material by name or SKU
                const rawMaterial = await db.getRawMaterialByNameOrSku(product.name, product.sku || '');
                if (rawMaterial) {
                  await db.createPurchaseOrderRawMaterialLink({
                    purchaseOrderItemId: poItem.id,
                    rawMaterialId: rawMaterial.id,
                    orderedQuantity: item.quantity,
                    unit: rawMaterial.unit || 'EA',
                  });
                }
              }
            }
          }
        }

        await createAuditLog(ctx.user.id, 'create', 'purchaseOrder', result.id, poNumber);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled']).optional(),
        receivedDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldPO = await db.getPurchaseOrderById(id);
        await db.updatePurchaseOrder(id, data);
        await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', id, oldPO?.poNumber, oldPO, data);
        
        // Create notification for PO status changes
        if (data.status && oldPO?.status !== data.status) {
          const notificationType = data.status === 'received' ? 'po_received' as const :
            data.status === 'confirmed' ? 'po_approved' as const :
            data.status === 'partial' ? 'po_received' as const : 'system' as const;
          
          const allUsers = await db.getAllUsers();
          const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
          
          await db.notifyUsersOfEvent({
            type: notificationType,
            title: `PO ${oldPO?.poNumber} ${data.status}`,
            message: `Purchase Order ${oldPO?.poNumber} status changed from ${oldPO?.status} to ${data.status}`,
            entityType: 'purchase_order',
            entityId: id,
            severity: data.status === 'received' ? 'info' : 'info',
            link: `/operations/purchase-orders/${id}`,
          }, opsUsers.map(u => u.id));
        }
        
        return { success: true };
      }),
    approve: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updatePurchaseOrder(input.id, { status: 'sent', approvedBy: ctx.user.id, approvedAt: new Date() });
        await createAuditLog(ctx.user.id, 'approve', 'purchaseOrder', input.id);
        return { success: true };
      }),
    sendToSupplier: opsProcedure
      .input(z.object({
        poId: z.number(),
        message: z.string().optional(),
        createShipment: z.boolean().optional(),
        createFreightRfq: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.getPurchaseOrderWithItems(input.poId);
        if (!po) throw new TRPCError({ code: 'NOT_FOUND', message: 'PO not found' });
        
        const vendor = await db.getVendorById(po.vendorId);
        if (!vendor) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
        
        // Generate supplier portal link for document uploads
        const portalToken = nanoid(32);
        const portalLink = `${process.env.VITE_APP_URL || ''}/supplier-portal/${portalToken}`;
        
        // Create shipment if requested
        let shipmentId: number | undefined;
        if (input.createShipment) {
          const shipmentNumber = generateNumber('SHIP');
          const shipment = await db.createShipment({
            type: 'inbound',
            purchaseOrderId: po.id,
            shipmentNumber,
            status: 'pending',
            fromAddress: vendor.address || undefined,
          });
          shipmentId = shipment.id;
        }
        
        // Create freight RFQ if requested
        let rfqId: number | undefined;
        if (input.createFreightRfq) {
          const rfq = await db.createFreightRfq({
            title: `Freight for PO ${po.poNumber}`,
            purchaseOrderId: po.id,
            status: 'draft',
            originAddress: vendor.address || undefined,
            createdById: ctx.user.id,
          });
          rfqId = rfq.id;
        }
        
        // Send email to supplier
        if (vendor.email && isEmailConfigured()) {
          const itemsHtml = po.items?.map((item: any) => 
            `<tr><td>${item.description}</td><td>${item.quantity}</td><td>$${item.unitPrice}</td><td>$${item.totalAmount}</td></tr>`
          ).join('') || '';
          
          const emailHtml = formatEmailHtml(`
            <h2>Purchase Order: ${po.poNumber}</h2>
            <p>Dear ${vendor.contactName || vendor.name},</p>
            <p>Please find attached our purchase order ${po.poNumber}.</p>
            ${input.message ? `<p><strong>Message:</strong> ${input.message}</p>` : ''}
            
            <h3>Order Details</h3>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
              <tr style="background: #f3f4f6;"><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
              ${itemsHtml}
              <tr><td colspan="3" style="text-align: right;"><strong>Subtotal:</strong></td><td>$${po.subtotal}</td></tr>
              <tr><td colspan="3" style="text-align: right;"><strong>Total:</strong></td><td><strong>$${po.totalAmount}</strong></td></tr>
            </table>
            
            <h3>Required Documentation</h3>
            <p>Please upload the following documents to our supplier portal:</p>
            <ul>
              <li>Commercial Invoice</li>
              <li>Packing List</li>
              <li>Product Dimensions & Weight</li>
              <li>HS Codes for all items</li>
              <li>Certificate of Origin (if applicable)</li>
              <li>MSDS/SDS (if applicable)</li>
            </ul>
            <p><a href="${portalLink}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upload Documents to Portal</a></p>
            
            <p>Expected Delivery Date: ${po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'TBD'}</p>
            <p>Please confirm receipt of this order and provide estimated shipping date.</p>
          `);
          
          await sendEmail({
            to: vendor.email,
            subject: `Purchase Order ${po.poNumber} - Action Required`,
            html: emailHtml,
          });
        }
        
        // Update PO status to sent
        await db.updatePurchaseOrder(po.id, { status: 'sent' });
        await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', po.id, po.poNumber);
        
        return { success: true, shipmentId, rfqId, portalToken };
      }),
  }),

  // ============================================
  // OPERATIONS - SHIPMENTS
  // ============================================
  shipments: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getShipments(input)),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['inbound', 'outbound']),
        orderId: z.number().optional(),
        purchaseOrderId: z.number().optional(),
        carrier: z.string().optional(),
        trackingNumber: z.string().optional(),
        shipDate: z.date().optional(),
        fromAddress: z.string().optional(),
        toAddress: z.string().optional(),
        weight: z.string().optional(),
        cost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const shipmentNumber = generateNumber('SHIP');
        const result = await db.createShipment({ ...input, shipmentNumber });
        await createAuditLog(ctx.user.id, 'create', 'shipment', result.id, shipmentNumber);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'in_transit', 'delivered', 'returned', 'cancelled']).optional(),
        trackingNumber: z.string().optional(),
        deliveryDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const [oldShipment] = await db.getShipments({ id } as any) || [];
        await db.updateShipment(id, data);
        await createAuditLog(ctx.user.id, 'update', 'shipment', id);
        
        // Create notification for shipment status changes
        if (data.status && oldShipment?.status !== data.status) {
          const allUsers = await db.getAllUsers();
          const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
          
          await db.notifyUsersOfEvent({
            type: 'shipping_update',
            title: `Shipment ${oldShipment?.shipmentNumber} ${data.status}`,
            message: `Shipment ${oldShipment?.shipmentNumber} status changed to ${data.status}${data.trackingNumber ? ` (Tracking: ${data.trackingNumber})` : ''}`,
            entityType: 'shipment',
            entityId: id,
            severity: data.status === 'delivered' ? 'info' : data.status === 'returned' ? 'warning' : 'info',
            link: `/operations/shipments`,
            metadata: { trackingNumber: data.trackingNumber || oldShipment?.trackingNumber },
          }, opsUsers.map(u => u.id));
        }
        
        return { success: true };
      }),
  }),

  // ============================================
  // HR - DEPARTMENTS
  // ============================================
  departments: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getDepartments(input?.companyId)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        code: z.string().optional(),
        parentDepartmentId: z.number().optional(),
        managerId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createDepartment(input);
        await createAuditLog(ctx.user.id, 'create', 'department', result.id, input.name);
        return result;
      }),
  }),

  // ============================================
  // HR - EMPLOYEES
  // ============================================
  employees: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        departmentId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getEmployees(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getEmployeeById(input.id)),
    create: adminProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        companyId: z.number().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        hireDate: z.date().optional(),
        departmentId: z.number().optional(),
        managerId: z.number().optional(),
        jobTitle: z.string().optional(),
        employmentType: z.enum(['full_time', 'part_time', 'contractor', 'intern']).optional(),
        salary: z.string().optional(),
        salaryFrequency: z.enum(['hourly', 'weekly', 'biweekly', 'monthly', 'annual']).optional(),
        currency: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const employeeNumber = generateNumber('EMP');
        const result = await db.createEmployee({ ...input, employeeNumber });
        await createAuditLog(ctx.user.id, 'create', 'employee', result.id, `${input.firstName} ${input.lastName}`);
        return result;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        departmentId: z.number().optional(),
        managerId: z.number().optional(),
        jobTitle: z.string().optional(),
        status: z.enum(['active', 'inactive', 'on_leave', 'terminated']).optional(),
        salary: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateEmployee(id, data);
        await createAuditLog(ctx.user.id, 'update', 'employee', id);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteEmployee(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'employee', input.id);
        return { success: true };
      }),
    compensationHistory: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(({ input }) => db.getCompensationHistory(input.employeeId)),
    addCompensation: adminProcedure
      .input(z.object({
        employeeId: z.number(),
        effectiveDate: z.date(),
        salary: z.string(),
        salaryFrequency: z.enum(['hourly', 'weekly', 'biweekly', 'monthly', 'annual']).optional(),
        currency: z.string().optional(),
        reason: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCompensationRecord({ ...input, approvedBy: ctx.user.id });
        await db.updateEmployee(input.employeeId, { salary: input.salary, salaryFrequency: input.salaryFrequency });
        await createAuditLog(ctx.user.id, 'create', 'compensation', result.id);
        return result;
      }),
  }),

  // ============================================
  // HR - EMPLOYEE PAYMENTS
  // ============================================
  employeePayments: router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        employeeId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getEmployeePayments(input)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        employeeId: z.number(),
        type: z.enum(['salary', 'bonus', 'commission', 'reimbursement', 'other']).optional(),
        amount: z.string(),
        currency: z.string().optional(),
        paymentDate: z.date(),
        payPeriodStart: z.date().optional(),
        payPeriodEnd: z.date().optional(),
        paymentMethod: z.enum(['check', 'direct_deposit', 'wire', 'other']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const paymentNumber = generateNumber('EMPAY');
        const result = await db.createEmployeePayment({ ...input, paymentNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'employeePayment', result.id, paymentNumber);
        return result;
      }),
  }),

  // ============================================
  // LEGAL - CONTRACTS
  // ============================================
  contracts: router({
    list: legalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getContracts(input)),
    get: legalProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getContractWithKeyDates(input.id)),
    create: legalProcedure
      .input(z.object({
        title: z.string().min(1),
        companyId: z.number().optional(),
        type: z.enum(['customer', 'vendor', 'employment', 'nda', 'partnership', 'lease', 'service', 'other']),
        partyType: z.enum(['customer', 'vendor', 'employee', 'other']).optional(),
        partyId: z.number().optional(),
        partyName: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        renewalDate: z.date().optional(),
        autoRenewal: z.boolean().optional(),
        value: z.string().optional(),
        currency: z.string().optional(),
        description: z.string().optional(),
        terms: z.string().optional(),
        keyDates: z.array(z.object({
          dateType: z.string(),
          date: z.date(),
          description: z.string().optional(),
          reminderDays: z.number().optional(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { keyDates, ...contractData } = input;
        const contractNumber = generateNumber('CON');
        const result = await db.createContract({ ...contractData, contractNumber, createdBy: ctx.user.id });
        
        if (keyDates && keyDates.length > 0) {
          for (const kd of keyDates) {
            await db.createContractKeyDate({ ...kd, contractId: result.id });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'contract', result.id, contractNumber);
        return result;
      }),
    update: legalProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        status: z.enum(['draft', 'pending_review', 'pending_signature', 'active', 'expired', 'terminated', 'renewed']).optional(),
        endDate: z.date().optional(),
        renewalDate: z.date().optional(),
        value: z.string().optional(),
        description: z.string().optional(),
        terms: z.string().optional(),
        documentUrl: z.string().optional(),
        signedDocumentUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldContract = await db.getContractById(id);
        await db.updateContract(id, data);
        await createAuditLog(ctx.user.id, 'update', 'contract', id, oldContract?.contractNumber, oldContract, data);
        return { success: true };
      }),
    approve: legalProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateContract(input.id, { status: 'active', approvedBy: ctx.user.id, approvedAt: new Date() });
        await createAuditLog(ctx.user.id, 'approve', 'contract', input.id);
        return { success: true };
      }),
    addKeyDate: legalProcedure
      .input(z.object({
        contractId: z.number(),
        dateType: z.string(),
        date: z.date(),
        description: z.string().optional(),
        reminderDays: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createContractKeyDate(input);
        await createAuditLog(ctx.user.id, 'create', 'contractKeyDate', result.id);
        return result;
      }),
  }),

  // ============================================
  // LEGAL - DISPUTES
  // ============================================
  disputes: router({
    list: legalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getDisputes(input)),
    get: legalProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getDisputeById(input.id)),
    create: legalProcedure
      .input(z.object({
        title: z.string().min(1),
        companyId: z.number().optional(),
        type: z.enum(['customer', 'vendor', 'employee', 'legal', 'regulatory', 'other']),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        partyType: z.enum(['customer', 'vendor', 'employee', 'other']).optional(),
        partyId: z.number().optional(),
        partyName: z.string().optional(),
        contractId: z.number().optional(),
        description: z.string().optional(),
        estimatedValue: z.string().optional(),
        currency: z.string().optional(),
        filedDate: z.date().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const disputeNumber = generateNumber('DIS');
        const result = await db.createDispute({ ...input, disputeNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'dispute', result.id, disputeNumber);
        return result;
      }),
    update: legalProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['open', 'investigating', 'negotiating', 'resolved', 'escalated', 'closed']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        resolution: z.string().optional(),
        actualValue: z.string().optional(),
        resolvedDate: z.date().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldDispute = await db.getDisputeById(id);
        await db.updateDispute(id, data);
        await createAuditLog(ctx.user.id, 'update', 'dispute', id, oldDispute?.disputeNumber, oldDispute, data);
        return { success: true };
      }),
  }),

  // ============================================
  // LEGAL - DOCUMENTS
  // ============================================
  documents: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getDocuments(input)),
    upload: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        type: z.enum(['contract', 'invoice', 'receipt', 'report', 'legal', 'hr', 'other']),
        category: z.string().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
        fileData: z.string(), // base64 encoded
        mimeType: z.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { fileData, mimeType: inputMimeType, ...docData } = input;
        const mimeType = inputMimeType || 'application/octet-stream';

        // Decode base64 and upload to S3
        const buffer = Buffer.from(fileData, 'base64');
        const fileKey = `documents/${ctx.user.id}/${nanoid()}-${input.name}`;
        const { url } = await storagePut(fileKey, buffer, mimeType);

        const result = await db.createDocument({
          ...docData,
          fileUrl: url,
          fileKey,
          fileSize: buffer.length,
          mimeType,
          uploadedBy: ctx.user.id,
        });
        
        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);
        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteDocument(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'document', input.id);
        return { success: true };
      }),
  }),

  // ============================================
  // PROJECTS
  // ============================================
  projects: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        ownerId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getProjects(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getProjectWithDetails(input.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        description: z.string().optional(),
        type: z.enum(['internal', 'client', 'product', 'research', 'other']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        ownerId: z.number().optional(),
        departmentId: z.number().optional(),
        startDate: z.date().optional(),
        targetEndDate: z.date().optional(),
        budget: z.string().optional(),
        currency: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const projectNumber = generateNumber('PRJ');
        const result = await db.createProject({ ...input, projectNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'project', result.id, input.name);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        ownerId: z.number().optional(),
        targetEndDate: z.date().optional(),
        actualEndDate: z.date().optional(),
        budget: z.string().optional(),
        actualCost: z.string().optional(),
        progress: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProject(id, data);
        await createAuditLog(ctx.user.id, 'update', 'project', id);
        return { success: true };
      }),
    addMilestone: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProjectMilestone(input);
        await createAuditLog(ctx.user.id, 'create', 'projectMilestone', result.id, input.name);
        return result;
      }),
    updateMilestone: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.date().optional(),
        completedDate: z.date().optional(),
        status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProjectMilestone(id, data);
        await createAuditLog(ctx.user.id, 'update', 'projectMilestone', id);
        return { success: true };
      }),
    addTask: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        milestoneId: z.number().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        assigneeId: z.number().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        dueDate: z.date().optional(),
        estimatedHours: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProjectTask({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'projectTask', result.id, input.name);
        return result;
      }),
    updateTask: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        assigneeId: z.number().optional(),
        status: z.enum(['todo', 'in_progress', 'review', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        dueDate: z.date().optional(),
        completedDate: z.date().optional(),
        actualHours: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProjectTask(id, data);
        await createAuditLog(ctx.user.id, 'update', 'projectTask', id);
        return { success: true };
      }),
    tasks: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectTasks(input.projectId)),
  }),

  // ============================================
  // DASHBOARD & METRICS
  // ============================================
  dashboard: router({
    metrics: protectedProcedure.query(() => db.getDashboardMetrics()),
    search: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(({ input }) => db.globalSearch(input.query)),
  }),

  // ============================================
  // AUDIT LOGS
  // ============================================
  auditLogs: router({
    list: adminProcedure
      .input(z.object({
        companyId: z.number().optional(),
        entityType: z.string().optional(),
        entityId: z.number().optional(),
        userId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getAuditLogs(input)),
  }),

  // ============================================
  // NOTIFICATIONS
  // ============================================
  notifications: router({
    list: protectedProcedure
      .input(z.object({
        unreadOnly: z.boolean().optional(),
        type: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ ctx, input }) => db.getUserNotifications(ctx.user.id, input)),
    unreadCount: protectedProcedure.query(({ ctx }) => db.getUnreadNotificationCount(ctx.user.id)),
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.markNotificationAsRead(input.id, ctx.user.id)),
    markAllRead: protectedProcedure.mutation(({ ctx }) => db.markAllNotificationsAsRead(ctx.user.id)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => db.deleteNotification(input.id, ctx.user.id)),
    getPreferences: protectedProcedure.query(({ ctx }) => db.getUserNotificationPreferences(ctx.user.id)),
    updatePreferences: protectedProcedure
      .input(z.object({
        notificationType: z.string(),
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
        push: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => db.updateNotificationPreference(
        ctx.user.id,
        input.notificationType,
        { inApp: input.inApp, email: input.email, push: input.push }
      )),
  }),

  // ============================================
  // INTEGRATIONS
  // ============================================
  integrations: router({
    list: adminProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getIntegrationConfigs(input?.companyId)),
    create: adminProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['quickbooks', 'shopify', 'stripe', 'slack', 'email', 'webhook']),
        name: z.string().min(1),
        config: z.any().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createIntegrationConfig(input);
        await createAuditLog(ctx.user.id, 'create', 'integration', result.id, input.name);
        return result;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        config: z.any().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateIntegrationConfig(id, data);
        await createAuditLog(ctx.user.id, 'update', 'integration', id);
        return { success: true };
      }),
    
    // Get all integration statuses
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const sendgridConfigured = isEmailConfigured();
      const shopifyStores = await db.getShopifyStores();
      const activeShopifyStores = shopifyStores.filter(s => s.isEnabled);
      const syncHistory = await db.getSyncHistory(10);
      
      // Check Google OAuth connection
      const googleToken = await db.getGoogleOAuthToken(ctx.user.id);
      const googleConnected = googleToken && (!googleToken.expiresAt || new Date(googleToken.expiresAt) > new Date());
      
      // Check QuickBooks OAuth connection
      const quickbooksToken = await db.getQuickBooksOAuthToken(ctx.user.id);
      const quickbooksConnected = quickbooksToken && (!quickbooksToken.expiresAt || new Date(quickbooksToken.expiresAt) > new Date());
      
      return {
        sendgrid: {
          configured: sendgridConfigured,
          status: sendgridConfigured ? 'connected' : 'not_configured',
        },
        shopify: {
          configured: activeShopifyStores.length > 0,
          status: activeShopifyStores.length > 0 ? 'connected' : 'not_configured',
          storeCount: activeShopifyStores.length,
          stores: shopifyStores,
        },
        google: {
          configured: googleConnected,
          status: googleConnected ? 'connected' : 'not_configured',
          email: googleToken?.googleEmail,
        },
        gmail: {
          configured: googleConnected,
          status: googleConnected ? 'connected' : 'not_configured',
          email: googleToken?.googleEmail,
        },
        googleWorkspace: {
          configured: googleConnected,
          status: googleConnected ? 'connected' : 'not_configured',
          email: googleToken?.googleEmail,
        },
        quickbooks: {
          configured: quickbooksConnected,
          status: quickbooksConnected ? 'connected' : 'not_configured',
          realmId: quickbooksToken?.realmId,
        },
        syncHistory,
      };
    }),

    // Test SendGrid connection
    testSendgrid: adminProcedure
      .input(z.object({ testEmail: z.string().email() }))
      .mutation(async ({ input }) => {
        if (!isEmailConfigured()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'SendGrid is not configured. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in Settings → Secrets.' });
        }
        
        const result = await sendEmail({
          to: input.testEmail,
          subject: 'ERP System - SendGrid Test',
          html: formatEmailHtml('SendGrid Connection Test\n\nThis is a test email to verify your SendGrid integration is working correctly.\n\nSent from your AI-Native ERP System'),
        });
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send test email' });
        }
        
        await db.createSyncLog({
          integration: 'sendgrid',
          action: 'test_email',
          status: 'success',
          details: `Test email sent to ${input.testEmail}`,
        });
        
        return { success: true, message: `Test email sent to ${input.testEmail}` };
      }),

    // Sync history
    getSyncHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getSyncHistory(input.limit || 50);
      }),

    // Clear sync history
    clearSyncHistory: adminProcedure.mutation(async () => {
      await db.clearSyncHistory();
      return { success: true };
    }),
  }),

  // ============================================
  // TRANSACTIONAL EMAIL SYSTEM (SendGrid)
  // ============================================
  transactionalEmail: router({
    // Get email service status
    getStatus: protectedProcedure.query(() => {
      return emailService.getStatus();
    }),

    // Get email message stats
    getStats: protectedProcedure.query(async () => {
      return db.getEmailMessageStats();
    }),

    // Template management
    templates: router({
      list: protectedProcedure.query(() => db.getTransactionalEmailTemplates()),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getTransactionalEmailTemplateById(input.id)),

      getByName: protectedProcedure
        .input(z.object({ name: z.string() }))
        .query(({ input }) => db.getTransactionalEmailTemplateByName(input.name)),

      create: adminProcedure
        .input(z.object({
          name: z.enum(['QUOTE', 'PO', 'SHIPMENT', 'ALERT', 'RFQ', 'INVOICE', 'PAYMENT_REMINDER', 'WELCOME', 'GENERAL']),
          providerTemplateId: z.string().min(1),
          description: z.string().optional(),
          variablesSchema: z.any().optional(),
          defaultSubject: z.string().optional(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createTransactionalEmailTemplate({
            ...input,
            name: input.name as any,
            createdBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'transactional_email_template', result.id, input.name);
          return result;
        }),

      update: adminProcedure
        .input(z.object({
          id: z.number(),
          providerTemplateId: z.string().optional(),
          description: z.string().optional(),
          variablesSchema: z.any().optional(),
          defaultSubject: z.string().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateTransactionalEmailTemplate(id, {
            ...data,
            updatedBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'update', 'transactional_email_template', id);
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteTransactionalEmailTemplate(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'transactional_email_template', input.id);
          return { success: true };
        }),
    }),

    // Email messages (logs)
    messages: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          templateName: z.string().optional(),
          toEmail: z.string().optional(),
          relatedEntityType: z.string().optional(),
          relatedEntityId: z.number().optional(),
          fromDate: z.date().optional(),
          toDate: z.date().optional(),
          limit: z.number().default(100),
          offset: z.number().default(0),
        }).optional())
        .query(({ input }) => db.getEmailMessages(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const message = await db.getEmailMessageById(input.id);
          if (!message) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Email message not found' });
          }
          const events = await db.getEmailEventsByMessageId(input.id);
          return { message, events };
        }),

      getByProvider: protectedProcedure
        .input(z.object({ providerMessageId: z.string() }))
        .query(({ input }) => db.getEmailMessageByProviderMessageId(input.providerMessageId)),

      retry: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const message = await db.getEmailMessageById(input.id);
          if (!message) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Email message not found' });
          }
          if (message.status !== 'failed') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only retry failed emails' });
          }

          // Reset status to queued for retry
          await db.updateEmailMessage(input.id, {
            status: 'queued' as any,
            retryCount: 0,
            nextRetryAt: null,
            errorJson: null,
          });

          await createAuditLog(ctx.user.id, 'update', 'email_message', input.id, undefined, undefined, { action: 'retry' });
          return { success: true };
        }),
    }),

    // Events (webhook events)
    events: router({
      list: protectedProcedure
        .input(z.object({
          emailMessageId: z.number().optional(),
          providerMessageId: z.string().optional(),
          limit: z.number().default(100),
        }).optional())
        .query(async ({ input }) => {
          if (input?.emailMessageId) {
            return db.getEmailEventsByMessageId(input.emailMessageId);
          }
          if (input?.providerMessageId) {
            return db.getEmailEventsByProviderMessageId(input.providerMessageId);
          }
          return db.getRecentEmailEvents(input?.limit);
        }),
    }),

    // Queue and send emails
    queueEmail: protectedProcedure
      .input(z.object({
        templateName: z.enum(['QUOTE', 'PO', 'SHIPMENT', 'ALERT', 'RFQ', 'INVOICE', 'PAYMENT_REMINDER', 'WELCOME', 'GENERAL']),
        toEmail: z.string().email(),
        toName: z.string().optional(),
        subject: z.string(),
        payload: z.record(z.any()),
        idempotencyKey: z.string().optional(),
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.number().optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.queueEmail({
          templateName: input.templateName,
          to: { email: input.toEmail, name: input.toName },
          subject: input.subject,
          payload: input.payload,
          idempotencyKey: input.idempotencyKey,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
          triggeredBy: ctx.user.id,
          scheduledAt: input.scheduledAt,
        });

        if (result.success && result.emailMessageId && !result.isDuplicate) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, input.subject, undefined, {
            templateName: input.templateName,
            toEmail: input.toEmail,
          });
        }

        return result;
      }),

    // Send entity-specific emails
    sendQuoteEmail: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendQuoteEmail(input.quoteId, {
          triggeredBy: ctx.user.id,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'Quote Email', undefined, {
            quoteId: input.quoteId,
          });
        }

        return result;
      }),

    sendPOEmail: protectedProcedure
      .input(z.object({
        poId: z.number(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.any()).optional(),
        pdfUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendPOEmail(input.poId, {
          triggeredBy: ctx.user.id,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
          pdfUrl: input.pdfUrl,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'PO Email', undefined, {
            poId: input.poId,
          });
        }

        return result;
      }),

    sendShipmentEmail: protectedProcedure
      .input(z.object({
        shipmentId: z.number(),
        recipientEmail: z.string().email().optional(),
        recipientName: z.string().optional(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendShipmentEmail(input.shipmentId, {
          triggeredBy: ctx.user.id,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'Shipment Email', undefined, {
            shipmentId: input.shipmentId,
          });
        }

        return result;
      }),

    sendAlertEmail: protectedProcedure
      .input(z.object({
        alertId: z.number(),
        recipientEmail: z.string().email().optional(),
        recipientName: z.string().optional(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendAlertEmail(input.alertId, {
          triggeredBy: ctx.user.id,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'Alert Email', undefined, {
            alertId: input.alertId,
          });
        }

        return result;
      }),

    sendRFQEmail: protectedProcedure
      .input(z.object({
        rfqId: z.number(),
        vendorId: z.number(),
        customSubject: z.string().optional(),
        customPayload: z.record(z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await emailService.sendRFQEmail(input.rfqId, input.vendorId, {
          triggeredBy: ctx.user.id,
          customSubject: input.customSubject,
          customPayload: input.customPayload,
        });

        if (result.success && result.emailMessageId) {
          await createAuditLog(ctx.user.id, 'create', 'email_message', result.emailMessageId, 'RFQ Email', undefined, {
            rfqId: input.rfqId,
            vendorId: input.vendorId,
          });
        }

        return result;
      }),

    // Manually trigger sending of queued emails (admin only)
    processQueue: adminProcedure
      .input(z.object({ limit: z.number().default(10) }).optional())
      .mutation(async ({ input }) => {
        const queued = await db.getQueuedEmailMessages(input?.limit || 10);
        const results: { id: number; success: boolean; error?: string }[] = [];

        for (const message of queued) {
          const result = await emailService.sendQueuedEmail(message.id);
          results.push({
            id: message.id,
            success: result.success,
            error: result.error,
          });
        }

        return {
          processed: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
        };
      }),
  }),

  // ============================================
  // GOOGLE SHEETS IMPORT (OAuth + Drive API)
  // ============================================
  sheetsImport: router({
    // Check if user has connected Google account
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getGoogleOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, email: null };
      }
      // Check if token is expired
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      return { 
        connected: !isExpired, 
        email: token.googleEmail,
        needsRefresh: isExpired 
      };
    }),
    
    // Get Google OAuth URL for connecting account
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return { url: null, error: 'Google OAuth not configured' };
      }
      
      const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/google/callback`;
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly');
      const state = ctx.user.id.toString();
      
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
      
      return { url, error: null };
    }),
    
    // Disconnect Google account
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteGoogleOAuthToken(ctx.user.id);
      return { success: true };
    }),
    
    // List spreadsheets from Google Drive
    listSpreadsheets: protectedProcedure
      .input(z.object({ pageToken: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google account not connected' });
        }
        
        // Check if we need to refresh the token
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          // Refresh the token
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        const url = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name,modifiedTime,owners)&orderBy=modifiedTime desc&pageSize=50${input?.pageToken ? `&pageToken=${input.pageToken}` : ''}`;
        
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google token expired. Please reconnect your account.' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list spreadsheets' });
        }
        
        const data = await response.json();
        return {
          spreadsheets: data.files || [],
          nextPageToken: data.nextPageToken,
        };
      }),
    
    // Fetch sheet data using OAuth token
    fetchSheet: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string().min(1),
        sheetName: z.string().optional(),
        range: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { spreadsheetId, sheetName, range } = input;
        
        // Try OAuth token first
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        let accessToken = token?.accessToken;
        
        // If no OAuth token, fall back to API key
        const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
        
        if (!accessToken && !apiKey) {
          throw new TRPCError({ 
            code: 'PRECONDITION_FAILED', 
            message: 'Please connect your Google account or configure an API key.' 
          });
        }
        
        // Refresh token if needed
        if (token && token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        // Build the range string
        const rangeStr = sheetName ? `${sheetName}${range ? `!${range}` : ''}` : (range || 'A:ZZ');
        
        // Build URL with either OAuth or API key
        let url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}`;
        if (!accessToken) {
          url += `?key=${apiKey}`;
        }
        
        try {
          const fetchOptions: RequestInit = {};
          if (accessToken) {
            fetchOptions.headers = { Authorization: `Bearer ${accessToken}` };
          }
          
          const response = await fetch(url, fetchOptions);
          if (!response.ok) {
            const error = await response.json();
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: error.error?.message || 'Failed to fetch sheet data' 
            });
          }
          
          const data = await response.json();
          const rows = data.values || [];
          
          if (rows.length === 0) {
            return { headers: [], rows: [], totalRows: 0 };
          }
          
          const headers = rows[0] as string[];
          const dataRows = rows.slice(1).map((row: string[]) => {
            const obj: Record<string, string> = {};
            headers.forEach((header, index) => {
              obj[header] = row[index] || '';
            });
            return obj;
          });
          
          return {
            headers,
            rows: dataRows,
            totalRows: dataRows.length,
          };
        } catch (error: any) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Failed to fetch sheet: ${error.message}` 
          });
        }
      }),
    
    // Get list of sheets in a spreadsheet
    getSheetNames: protectedProcedure
      .input(z.object({ spreadsheetId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        // Try OAuth token first
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        let accessToken = token?.accessToken;
        const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
        
        if (!accessToken && !apiKey) {
          throw new TRPCError({ 
            code: 'PRECONDITION_FAILED', 
            message: 'Please connect your Google account or configure an API key.' 
          });
        }
        
        let url = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}?fields=sheets.properties.title`;
        if (!accessToken) {
          url += `&key=${apiKey}`;
        }
        
        try {
          const fetchOptions: RequestInit = {};
          if (accessToken) {
            fetchOptions.headers = { Authorization: `Bearer ${accessToken}` };
          }
          
          const response = await fetch(url, fetchOptions);
          if (!response.ok) {
            const error = await response.json();
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: error.error?.message || 'Failed to fetch spreadsheet info' 
            });
          }
          
          const data = await response.json();
          const sheets = data.sheets?.map((s: any) => s.properties.title) || [];
          
          return { sheets };
        } catch (error: any) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Failed to fetch spreadsheet: ${error.message}` 
          });
        }
      }),
    
    // Import data into a specific module
    importData: adminProcedure
      .input(z.object({
        targetModule: z.enum(['customers', 'vendors', 'products', 'invoices', 'employees', 'contracts', 'projects']),
        data: z.array(z.record(z.string(), z.string())),
        columnMapping: z.record(z.string(), z.string()), // Maps sheet column to ERP field
      }))
      .mutation(async ({ input, ctx }) => {
        const { targetModule, data, columnMapping } = input;
        const results = { imported: 0, failed: 0, errors: [] as string[] };
        
        for (const row of data) {
          try {
            // Map the row data to the target fields
            const mappedData: Record<string, any> = {};
            for (const [sheetCol, erpField] of Object.entries(columnMapping)) {
              if (row[sheetCol] !== undefined && row[sheetCol] !== '') {
                mappedData[erpField] = row[sheetCol];
              }
            }
            
            // Import based on target module
            switch (targetModule) {
              case 'customers':
                if (!mappedData.name) {
                  results.errors.push(`Row missing required field: name`);
                  results.failed++;
                  continue;
                }
                await db.createCustomer({ 
                  name: mappedData.name,
                  email: mappedData.email || null,
                  phone: mappedData.phone || null,
                  address: mappedData.address || null,
                  city: mappedData.city || null,
                  state: mappedData.state || null,
                  country: mappedData.country || null,
                  postalCode: mappedData.postalCode || null,
                  notes: mappedData.notes || null,
                });
                break;
                
              case 'vendors':
                if (!mappedData.name) {
                  results.errors.push(`Row missing required field: name`);
                  results.failed++;
                  continue;
                }
                await db.createVendor({ 
                  name: mappedData.name,
                  email: mappedData.email || null,
                  phone: mappedData.phone || null,
                  address: mappedData.address || null,
                  city: mappedData.city || null,
                  state: mappedData.state || null,
                  country: mappedData.country || null,
                  postalCode: mappedData.postalCode || null,
                  paymentTerms: mappedData.paymentTerms ? parseInt(mappedData.paymentTerms) : null,
                  notes: mappedData.notes || null,
                });
                break;
                
              case 'products':
                if (!mappedData.name) {
                  results.errors.push(`Row missing required field: name`);
                  results.failed++;
                  continue;
                }
                const sku = mappedData.sku || generateNumber('PROD');
                await db.createProduct({ 
                  name: mappedData.name,
                  sku,
                  unitPrice: mappedData.price || mappedData.unitPrice || '0',
                  description: mappedData.description || null,
                  category: mappedData.category || null,
                  costPrice: mappedData.cost || mappedData.costPrice || null,
                });
                break;
                
              case 'employees':
                if (!mappedData.firstName || !mappedData.lastName) {
                  results.errors.push(`Row missing required fields: firstName, lastName`);
                  results.failed++;
                  continue;
                }
                const employeeNumber = generateNumber('EMP');
                await db.createEmployee({ 
                  ...mappedData, 
                  employeeNumber,
                  firstName: mappedData.firstName,
                  lastName: mappedData.lastName,
                });
                break;
                
              case 'invoices':
                if (!mappedData.customerId || !mappedData.amount) {
                  results.errors.push(`Row missing required fields: customerId, amount`);
                  results.failed++;
                  continue;
                }
                const invoiceNumber = generateNumber('INV');
                const amount = mappedData.amount || '0';
                await db.createInvoice({ 
                  ...mappedData, 
                  invoiceNumber,
                  customerId: parseInt(mappedData.customerId) || 0,
                  issueDate: new Date(),
                  dueDate: mappedData.dueDate ? new Date(mappedData.dueDate) : new Date(),
                  subtotal: amount,
                  totalAmount: amount,
                });
                break;
                
              case 'contracts':
                if (!mappedData.title) {
                  results.errors.push(`Row missing required field: title`);
                  results.failed++;
                  continue;
                }
                const contractNumber = generateNumber('CON');
                await db.createContract({ 
                  ...mappedData, 
                  contractNumber,
                  title: mappedData.title,
                  type: (mappedData.type as any) || 'service',
                });
                break;
                
              case 'projects':
                if (!mappedData.name) {
                  results.errors.push(`Row missing required field: name`);
                  results.failed++;
                  continue;
                }
                const projectNumber = generateNumber('PROJ');
                await db.createProject({ 
                  ...mappedData, 
                  projectNumber,
                  name: mappedData.name,
                });
                break;
            }
            
            results.imported++;
          } catch (error: any) {
            results.errors.push(`Import error: ${error.message}`);
            results.failed++;
          }
        }
        
        // Create audit log for the import
        await createAuditLog(ctx.user.id, 'create', `${targetModule}_import`, 0, `Imported ${results.imported} records`);
        
        return results;
      }),
  }),

  // ============================================
  // GMAIL INTEGRATION
  // ============================================
  gmail: router({
    // Get connection status
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getGoogleOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, email: null };
      }
      // Check if token is expired
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      
      // Get Gmail profile if connected
      if (!isExpired) {
        const profileResult = await getGmailProfile(token.accessToken);
        return { 
          connected: true, 
          email: profileResult.profile?.emailAddress || token.googleEmail,
          messagesTotal: profileResult.profile?.messagesTotal,
          threadsTotal: profileResult.profile?.threadsTotal,
        };
      }
      
      return { 
        connected: false, 
        email: token.googleEmail,
        needsRefresh: isExpired 
      };
    }),
    
    // Get full access OAuth URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return { url: null, error: 'Google OAuth not configured' };
      }
      
      const url = getGoogleFullAccessAuthUrl(ctx.user.id);
      return { url, error: null };
    }),
    
    // Send email via Gmail
    sendEmail: protectedProcedure
      .input(z.object({
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        cc: z.union([z.string(), z.array(z.string())]).optional(),
        bcc: z.union([z.string(), z.array(z.string())]).optional(),
        replyTo: z.string().optional(),
        html: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await sendGmailMessage(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send email' });
        }
        
        // Create audit log
        await createAuditLog(ctx.user.id, 'create', 'gmail_message', 0, `Sent email to ${Array.isArray(input.to) ? input.to.join(', ') : input.to}`);
        
        return { success: true, messageId: result.messageId };
      }),
    
    // Create draft
    createDraft: protectedProcedure
      .input(z.object({
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        cc: z.union([z.string(), z.array(z.string())]).optional(),
        bcc: z.union([z.string(), z.array(z.string())]).optional(),
        replyTo: z.string().optional(),
        html: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await createGmailDraft(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create draft' });
        }
        
        return { success: true, draftId: result.draftId };
      }),
    
    // List emails
    listMessages: protectedProcedure
      .input(z.object({
        maxResults: z.number().optional(),
        pageToken: z.string().optional(),
        labelIds: z.array(z.string()).optional(),
        q: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await listGmailMessages(accessToken, input || {});
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to list messages' });
        }
        
        return result.result;
      }),
    
    // Get message
    getMessage: protectedProcedure
      .input(z.object({ messageId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await getGmailMessage(accessToken, input.messageId);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to get message' });
        }
        
        return result.message;
      }),
    
    // Reply to message
    replyToMessage: protectedProcedure
      .input(z.object({
        threadId: z.string(),
        messageId: z.string(),
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        cc: z.union([z.string(), z.array(z.string())]).optional(),
        html: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const { threadId, messageId, ...emailOptions } = input;
        const result = await replyToGmailMessage(accessToken, threadId, messageId, emailOptions);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send reply' });
        }
        
        return { success: true, messageId: result.messageId };
      }),
  }),

  // ============================================
  // GOOGLE WORKSPACE (DOCS & SHEETS)
  // ============================================
  googleWorkspace: router({
    // Get connection status (shared with Gmail)
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getGoogleOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, email: null };
      }
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      return { 
        connected: !isExpired, 
        email: token.googleEmail,
        needsRefresh: isExpired 
      };
    }),
    
    // Get full access OAuth URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return { url: null, error: 'Google OAuth not configured' };
      }
      
      const url = getGoogleFullAccessAuthUrl(ctx.user.id);
      return { url, error: null };
    }),
    
    // Create Google Doc
    createDoc: protectedProcedure
      .input(z.object({
        title: z.string(),
        content: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await createGoogleDoc(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create document' });
        }
        
        // Get shareable link
        const linkResult = await getFileShareableLink(accessToken, result.document!.documentId);
        
        // Create audit log
        await createAuditLog(ctx.user.id, 'create', 'google_doc', 0, input.title);
        
        return { 
          ...result.document,
          webViewLink: linkResult.webViewLink 
        };
      }),
    
    // Create Google Sheet
    createSheet: protectedProcedure
      .input(z.object({
        title: z.string(),
        sheets: z.array(z.object({
          title: z.string(),
          rowCount: z.number().optional(),
          columnCount: z.number().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await createGoogleSheet(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create spreadsheet' });
        }
        
        // Create audit log
        await createAuditLog(ctx.user.id, 'create', 'google_sheet', 0, input.title);
        
        return result.spreadsheet;
      }),
    
    // Update Google Sheet values
    updateSheetValues: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string(),
        range: z.string(),
        values: z.array(z.array(z.any())),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await updateGoogleSheet(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to update spreadsheet' });
        }
        
        return { success: true, updatedCells: result.updatedCells };
      }),
    
    // Append to Google Sheet
    appendToSheet: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string(),
        range: z.string(),
        values: z.array(z.array(z.any())),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await appendToGoogleSheet(accessToken, input.spreadsheetId, input.range, input.values);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to append to spreadsheet' });
        }
        
        return { success: true, updatedCells: result.updatedCells };
      }),
    
    // Get Sheet values
    getSheetValues: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string(),
        range: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await getGoogleSheetValues(accessToken, input.spreadsheetId, input.range);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to get values' });
        }
        
        return result.values;
      }),
    
    // Share file
    shareFile: protectedProcedure
      .input(z.object({
        fileId: z.string(),
        role: z.enum(['reader', 'writer', 'commenter', 'owner']),
        type: z.enum(['user', 'group', 'domain', 'anyone']),
        emailAddress: z.string().optional(),
        domain: z.string().optional(),
        sendNotificationEmail: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }
        
        const result = await shareGoogleFile(accessToken, input);
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to share file' });
        }
        
        return { success: true, permissionId: result.permissionId };
      }),
  }),

  // ============================================
  // QUICKBOOKS INTEGRATION
  // ============================================
  quickbooks: router({
    // Get QuickBooks OAuth URL
    getAuthUrl: protectedProcedure.query(({ ctx }) => {
      return getQuickBooksAuthUrl(ctx.user.id);
    }),

    // Get connection status
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getQuickBooksOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, realmId: null };
      }
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      return { 
        connected: !isExpired, 
        realmId: token.realmId,
        needsRefresh: isExpired 
      };
    }),

    // Disconnect QuickBooks
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteQuickBooksOAuthToken(ctx.user.id);
      await db.createSyncLog({
        integration: 'quickbooks',
        action: 'disconnect',
        status: 'success',
        details: 'QuickBooks disconnected',
      });
      return { success: true };
    }),

    // Test connection
    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
      const token = await db.getQuickBooksOAuthToken(ctx.user.id);
      if (!token || !token.realmId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected' });
      }

      // Check if token is expired
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      let accessToken = token.accessToken;

      if (isExpired && token.refreshToken) {
        // Try to refresh the token
        const refreshResult = await refreshQuickBooksToken(token.refreshToken);
        if (refreshResult.error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Token expired and refresh failed' });
        }
        
        // Update token in database
        // QuickBooks always returns a new refresh token on token refresh
        await db.upsertQuickBooksOAuthToken({
          userId: ctx.user.id,
          accessToken: refreshResult.access_token!,
          refreshToken: refreshResult.refresh_token!, // QuickBooks always provides a new refresh token
          expiresAt: new Date(Date.now() + (refreshResult.expires_in! * 1000)),
          realmId: token.realmId,
        });
        
        accessToken = refreshResult.access_token!;
      }

      // Test the connection by fetching company info
      const result = await getCompanyInfo(accessToken, token.realmId);
      
      if (result.error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
      }

      return { 
        success: true, 
        message: 'QuickBooks connection is working',
        companyName: result.data?.CompanyInfo?.CompanyName 
      };
    }),
  }),

  // ============================================
  // AI ASSISTANT
  // ============================================
  ai: router({
    conversations: protectedProcedure.query(({ ctx }) => db.getAiConversations(ctx.user.id)),
    getConversation: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const conversation = await db.getAiConversationById(input.id);
        if (!conversation) return null;
        const messages = await db.getAiMessages(input.id);
        return { ...conversation, messages };
      }),
    createConversation: protectedProcedure
      .input(z.object({ title: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createAiConversation({ userId: ctx.user.id, title: input.title || 'New Conversation' });
        return result;
      }),
    chat: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        message: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Save user message
        await db.createAiMessage({
          conversationId: input.conversationId,
          role: 'user',
          content: input.message,
        });

        // Get dashboard metrics for context
        const metrics = await db.getDashboardMetrics();
        
        // Build system prompt with ERP context
        const systemPrompt = `You are an AI assistant for an ERP system. You have access to the following real-time business metrics:

Current Business Metrics:
- Active Customers: ${metrics?.customers || 0}
- Active Vendors: ${metrics?.vendors || 0}
- Products: ${metrics?.products || 0}
- Active Employees: ${metrics?.activeEmployees || 0}
- Active Projects: ${metrics?.activeProjects || 0}
- Active Contracts: ${metrics?.activeContracts || 0}
- Revenue This Month: $${metrics?.revenueThisMonth || 0}
- Invoices Paid: $${metrics?.invoicesPaid || 0}
- Pending Invoices: ${metrics?.pendingInvoices || 0}
- Pending Purchase Orders: ${metrics?.pendingPurchaseOrders || 0}
- Open Disputes: ${metrics?.openDisputes || 0}

You can help users with:
1. Answering questions about business metrics and KPIs
2. Providing insights on financial health, cash flow, and revenue
3. Summarizing operations status and inventory levels
4. Identifying risks and anomalies
5. Drafting invoices, contracts, reports, and memos
6. Explaining workflows and processes

Be concise, professional, and data-driven in your responses. When discussing financial figures, always format them properly with currency symbols.`;

        // Get conversation history
        const messages = await db.getAiMessages(input.conversationId);
        const chatHistory = messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        }));

        // Call LLM
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: input.message },
          ],
        });

        const rawContent = response.choices[0]?.message?.content;
const assistantMessage = typeof rawContent === 'string' ? rawContent : 'I apologize, but I was unable to generate a response.';

        // Save assistant message
        await db.createAiMessage({
          conversationId: input.conversationId,
          role: 'assistant',
          content: assistantMessage,
        });

        // Update conversation timestamp
        await db.updateAiConversation(input.conversationId, {});

        return { message: assistantMessage };
      }),
    query: protectedProcedure
      .input(z.object({ question: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        // Get all relevant data for context
        const [metrics, recentInvoices, recentOrders, recentPOs] = await Promise.all([
          db.getDashboardMetrics(),
          db.getInvoices(),
          db.getOrders(),
          db.getPurchaseOrders(),
        ]);

        const systemPrompt = `You are an AI assistant for an ERP system. Answer the user's question based on the following business data:

Dashboard Metrics:
${JSON.stringify(metrics, null, 2)}

Recent Invoices (last 10):
${JSON.stringify(recentInvoices.slice(0, 10), null, 2)}

Recent Orders (last 10):
${JSON.stringify(recentOrders.slice(0, 10), null, 2)}

Recent Purchase Orders (last 10):
${JSON.stringify(recentPOs.slice(0, 10), null, 2)}

Provide a concise, data-driven answer. If you need to calculate something, show your work. Format numbers and currency properly.`;

        const response = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input.question },
          ],
        });

        const rawAnswer = response.choices[0]?.message?.content;
        return {
          answer: typeof rawAnswer === 'string' ? rawAnswer : 'Unable to process your question.',
        };
      }),

    // Comprehensive AI Agent Chat - handles all ERP operations
    agentChat: protectedProcedure
      .input(z.object({
        message: z.string().min(1),
        conversationHistory: z.array(z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const agentContext: AIAgentContext = {
          userId: ctx.user.id,
          userName: ctx.user.name || 'User',
          userRole: ctx.user.role,
          companyId: ctx.user.companyId,
        };

        const result = await processAIAgentRequest(
          input.message,
          input.conversationHistory || [],
          agentContext
        );

        return result;
      }),

    // Quick analysis endpoint for data insights
    quickAnalysis: protectedProcedure
      .input(z.object({
        dataType: z.enum(['sales', 'inventory', 'vendors', 'customers', 'finances', 'orders', 'procurement', 'production']),
      }))
      .query(async ({ input, ctx }) => {
        const agentContext: AIAgentContext = {
          userId: ctx.user.id,
          userName: ctx.user.name || 'User',
          userRole: ctx.user.role,
          companyId: ctx.user.companyId,
        };

        return getQuickAnalysis(input.dataType, agentContext);
      }),

    // System overview for dashboard
    systemOverview: protectedProcedure.query(async ({ ctx }) => {
      const agentContext: AIAgentContext = {
        userId: ctx.user.id,
        userName: ctx.user.name || 'User',
        userRole: ctx.user.role,
        companyId: ctx.user.companyId,
      };

      return getSystemOverview(agentContext);
    }),

    // Pending actions that need attention
    pendingActions: protectedProcedure.query(async ({ ctx }) => {
      const agentContext: AIAgentContext = {
        userId: ctx.user.id,
        userName: ctx.user.name || 'User',
        userRole: ctx.user.role,
        companyId: ctx.user.companyId,
      };

      return getPendingActions(agentContext);
    }),

    // Get suggested actions based on current system state
    suggestedActions: protectedProcedure.query(async ({ ctx }) => {
      // Get system state
      const metrics = await db.getDashboardMetrics();
      const pendingTasks = await db.getPendingApprovalTasks();

      const suggestions: { type: string; title: string; description: string; priority: string }[] = [];

      // Check for low inventory
      if (metrics?.lowStockItems && metrics.lowStockItems > 0) {
        suggestions.push({
          type: 'inventory',
          title: 'Low Stock Alert',
          description: `${metrics.lowStockItems} items are running low on stock`,
          priority: 'high',
        });
      }

      // Check for pending POs
      if (metrics?.pendingPurchaseOrders && metrics.pendingPurchaseOrders > 0) {
        suggestions.push({
          type: 'procurement',
          title: 'Pending Purchase Orders',
          description: `${metrics.pendingPurchaseOrders} purchase orders need attention`,
          priority: 'medium',
        });
      }

      // Check for pending approvals
      if (pendingTasks.length > 0) {
        suggestions.push({
          type: 'approvals',
          title: 'Pending Approvals',
          description: `${pendingTasks.length} AI tasks waiting for approval`,
          priority: 'high',
        });
      }

      // Check for overdue invoices
      if (metrics?.overdueInvoices && metrics.overdueInvoices > 0) {
        suggestions.push({
          type: 'finance',
          title: 'Overdue Invoices',
          description: `${metrics.overdueInvoices} invoices are past due`,
          priority: 'high',
        });
      }

      return suggestions;
    }),
  }),

  // ============================================
  // AI AGENT SYSTEM
  // ============================================
  aiAgent: router({
    // Tasks
    tasks: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          taskType: z.string().optional(),
          priority: z.string().optional(),
        }).optional())
        .query(({ input }) => db.getAiAgentTasks(input)),
      
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getAiAgentTaskById(input.id)),
      
      pendingApprovals: protectedProcedure.query(() => db.getPendingApprovalTasks()),
      
      create: protectedProcedure
        .input(z.object({
          taskType: z.enum(['generate_po', 'send_rfq', 'send_quote_request', 'send_email', 'update_inventory', 'create_shipment', 'generate_invoice', 'reconcile_payment', 'reorder_materials', 'vendor_followup', 'create_work_order', 'query', 'reply_email', 'approve_po', 'approve_invoice', 'create_vendor', 'create_material', 'create_product', 'create_bom', 'create_customer']),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
          taskData: z.string(), // JSON string with task-specific data
          aiReasoning: z.string().optional(),
          aiConfidence: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const task = await db.createAiAgentTask({
            taskType: input.taskType,
            priority: input.priority,
            status: 'pending_approval',
            taskData: input.taskData,
            aiReasoning: input.aiReasoning || 'Manual task creation',
            aiConfidence: input.aiConfidence || '100.00',
          });
          
          await db.createAiAgentLog({
            taskId: task.id,
            action: 'task_created',
            status: 'info',
            message: `Task created by ${ctx.user.name}`,
            details: input.taskData,
          });
          
          return task;
        }),
      
      approve: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.updateAiAgentTask(input.id, {
            status: 'approved',
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          });
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_approved',
            status: 'success',
            message: `Task approved by ${ctx.user.name}`,
          });
          return { success: true };
        }),
      
      reject: adminProcedure
        .input(z.object({ id: z.number(), reason: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
          await db.updateAiAgentTask(input.id, {
            status: 'rejected',
            rejectedBy: ctx.user.id,
            rejectedAt: new Date(),
            rejectionReason: input.reason,
          });
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_rejected',
            status: 'warning',
            message: `Task rejected by ${ctx.user.name}: ${input.reason || 'No reason provided'}`,
          });
          return { success: true };
        }),
      
      update: adminProcedure
        .input(z.object({ 
          id: z.number(), 
          taskData: z.string(),
          aiReasoning: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const task = await db.getAiAgentTaskById(input.id);
          if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
          
          // Validate JSON format
          try {
            JSON.parse(input.taskData);
          } catch (e) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Invalid JSON format in taskData' 
            });
          }
          
          // Only allow updates on pending or approved tasks
          if (!['pending_approval', 'approved'].includes(task.status)) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Can only update pending or approved tasks' 
            });
          }
          
          await db.updateAiAgentTask(input.id, {
            taskData: input.taskData,
            aiReasoning: input.aiReasoning || task.aiReasoning || undefined,
          });
          
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_updated',
            status: 'info',
            message: `Task data updated by ${ctx.user.name}`,
            details: input.taskData,
          });
          
          return { success: true };
        }),
      
      execute: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const task = await db.getAiAgentTaskById(input.id);
          if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
          if (task.status !== 'approved') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task must be approved before execution' });
          }
          
          await db.updateAiAgentTask(input.id, { status: 'in_progress' });
          
          try {
            // Execute based on task type
            const taskData = JSON.parse(task.taskData);
            let result: any = {};
            
            switch (task.taskType) {
              case 'generate_po': {
                // Create PO with line items for raw materials
                const poNumber = generateNumber('PO');
                
                // Resolve material by ID or name
                let material = null;
                if (taskData.rawMaterialId) {
                  material = await db.getRawMaterialById(taskData.rawMaterialId);
                } else if (taskData.rawMaterialName) {
                  const allMaterials = await db.getRawMaterials();
                  material = allMaterials.find(m =>
                    m.name?.toLowerCase().includes(taskData.rawMaterialName.toLowerCase()) ||
                    m.sku?.toLowerCase() === taskData.rawMaterialName.toLowerCase()
                  ) || null;
                }
                
                // Resolve vendor - use provided ID, material's preferred vendor, or create draft without vendor
                let vendor = null;
                let vendorId = taskData.vendorId;
                
                if (vendorId) {
                  vendor = await db.getVendorById(vendorId);
                } else if (material?.preferredVendorId) {
                  vendor = await db.getVendorById(material.preferredVendorId);
                  vendorId = material.preferredVendorId;
                }
                
                // If no vendor found, return needs_vendor status
                if (!vendorId) {
                  await db.updateAiAgentTask(task.id, {
                    status: 'needs_vendor',
                    executedAt: new Date(),
                  });
                  await db.createAiAgentLog({
                    taskId: task.id,
                    action: 'execution_needs_input',
                    status: 'warning',
                    message: `PO generation requires vendor selection for ${material?.name || taskData.rawMaterialName || 'material'}`,
                    details: JSON.stringify({ materialId: material?.id, materialName: material?.name || taskData.rawMaterialName }),
                  });
                  return { success: false, status: 'needs_vendor', message: 'Please select a vendor for this PO' };
                }
                
                // Calculate expected date based on vendor lead time
                const leadDays = vendor?.defaultLeadTimeDays || material?.leadTimeDays || 14;
                const expectedDate = new Date();
                expectedDate.setDate(expectedDate.getDate() + leadDays);
                
                const unitCost = parseFloat(taskData.unitCost || material?.unitCost || '0');
                const quantity = parseFloat(taskData.quantity || '0');
                const subtotal = unitCost * quantity;
                const totalAmount = subtotal; // Could add tax/shipping later
                
                const po = await db.createPurchaseOrder({
                  poNumber,
                  vendorId: vendorId,
                  orderDate: new Date(),
                  expectedDate,
                  notes: taskData.notes || `AI-generated PO for ${material?.name || 'materials'}`,
                  subtotal: subtotal.toFixed(2),
                  totalAmount: totalAmount.toFixed(2),
                  status: 'draft',
                });
                
                // Create PO line item for the raw material
                if (material) {
                  await db.createPurchaseOrderItem({
                    purchaseOrderId: po.id,
                    description: material.name,
                    quantity: quantity.toString(),
                    unitPrice: unitCost.toFixed(2),
                    totalAmount: subtotal.toFixed(2),
                  });
                  
                  // Update raw material with on-order quantity
                  await db.updateRawMaterial(material.id, {
                    quantityOnOrder: ((parseFloat(material.quantityOnOrder?.toString() || '0')) + quantity).toString(),
                    receivingStatus: 'ordered',
                    expectedDeliveryDate: expectedDate,
                    lastPoId: po.id,
                  });
                }
                
                result = { purchaseOrderId: po.id, poNumber, expectedDate: expectedDate.toISOString(), totalAmount: totalAmount.toFixed(2) };
                break;
              }
              
              case 'send_rfq': {
                // Create RFQ and send emails to vendors
                const material = taskData.rawMaterialId ? await db.getRawMaterialById(taskData.rawMaterialId) : null;
                const vendorIds = taskData.vendorIds || [];
                const emailsSent: string[] = [];
                
                for (const vendorId of vendorIds) {
                  const vendor = await db.getVendorById(vendorId);
                  if (vendor && vendor.email) {
                    const emailResult = await sendEmail({
                      to: vendor.email,
                      subject: `Request for Quote: ${material?.name || 'Materials'}`,
                      html: `
                        <p>Dear ${vendor.contactName || vendor.name},</p>
                        <p>We are requesting a quote for the following:</p>
                        <ul>
                          <li><strong>Material:</strong> ${material?.name || 'Various materials'}</li>
                          <li><strong>SKU:</strong> ${material?.sku || 'N/A'}</li>
                          <li><strong>Quantity:</strong> ${taskData.quantity} ${material?.unit || 'units'}</li>
                          <li><strong>Required By:</strong> ${taskData.requiredDate || 'ASAP'}</li>
                        </ul>
                        <p>Please reply with your best price and lead time.</p>
                        <p>Best regards,<br/>Procurement Team</p>
                      `,
                    });
                    if (emailResult.success) {
                      emailsSent.push(vendor.email);
                    }
                  }
                }
                
                result = { rfqSent: true, vendorCount: vendorIds.length, emailsSent };
                break;
              }
              
              case 'send_email': {
                // Send general email
                const emailResult = await sendEmail({
                  to: taskData.to,
                  subject: taskData.subject,
                  html: taskData.body || taskData.content,
                });
                result = { emailSent: emailResult.success, messageId: emailResult.messageId };
                break;
              }
              
              case 'vendor_followup': {
                // Send follow-up email to vendor
                const vendor = await db.getVendorById(taskData.vendorId);
                if (vendor && vendor.email) {
                  const emailResult = await sendEmail({
                    to: vendor.email,
                    subject: taskData.subject || `Follow-up: ${taskData.poNumber || 'Order Status'}`,
                    html: taskData.body || `
                      <p>Dear ${vendor.contactName || vendor.name},</p>
                      <p>We are following up on ${taskData.poNumber ? `PO ${taskData.poNumber}` : 'our recent order'}.</p>
                      <p>Could you please provide an update on the status and expected delivery date?</p>
                      <p>Best regards,<br/>Procurement Team</p>
                    `,
                  });
                  result = { emailSent: emailResult.success, vendorEmail: vendor.email };
                } else {
                  result = { emailSent: false, error: 'Vendor email not found' };
                }
                break;
              }
              
              case 'reorder_materials': {
                // Create work order from BOM (reorder_materials type handles work orders)
                const bom = taskData.bomId ? await db.getBomById(taskData.bomId) : null;
                if (!bom) throw new Error('BOM not found');
                
                const workOrder = await db.createWorkOrder({
                  bomId: bom.id,
                  productId: bom.productId,
                  quantity: taskData.quantity?.toString() || '1',
                  status: 'draft',
                  priority: taskData.priority || 'medium',
                  notes: taskData.notes || `AI-generated work order for ${bom.name}`,
                });
                
                // Create work order materials from BOM components
                const components = await db.getBomComponents(bom.id);
                for (const comp of components) {
                  const requiredQty = parseFloat(comp.quantity?.toString() || '0') * parseFloat(taskData.quantity || '1');
                  await db.createWorkOrderMaterial({
                    workOrderId: workOrder.id,
                    rawMaterialId: comp.rawMaterialId || undefined,
                    productId: comp.productId || undefined,
                    name: comp.name,
                    requiredQuantity: requiredQty.toString(),
                    unit: comp.unit || 'EA',
                    status: 'pending',
                  });
                }
                
                result = { workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber, materialsCount: components.length };
                break;
              }
              
              case 'update_inventory': {
                // Update inventory levels
                if (taskData.rawMaterialId) {
                  await db.upsertRawMaterialInventory(taskData.rawMaterialId, taskData.warehouseId || 1, {
                    quantity: taskData.quantity?.toString(),
                  });
                }
                result = { updated: true };
                break;
              }
              
              case 'reply_email': {
                // AI-generated email reply with LLM
                if (taskData.generateWithAI !== false) {
                  // Use AI to generate the reply
                  const emailReplyResult = await processEmailReply({
                    originalEmail: {
                      from: taskData.to, // The recipient is who we're replying to
                      subject: taskData.originalSubject || 'Your inquiry',
                      body: taskData.originalBody || '',
                      emailId: taskData.emailId,
                    },
                    autoSend: true,
                    companyName: taskData.companyName || 'Our Company',
                    senderName: taskData.senderName || ctx.user.name,
                    senderTitle: taskData.senderTitle,
                  });
                  result = {
                    emailSent: emailReplyResult.emailSent,
                    messageId: emailReplyResult.messageId,
                    to: taskData.to,
                    generatedReply: emailReplyResult.generatedReply,
                    aiGenerated: true,
                  };
                } else {
                  // Send pre-written reply
                  const replyResult = await sendEmail({
                    to: taskData.to,
                    subject: taskData.subject || `Re: ${taskData.originalSubject || 'Your inquiry'}`,
                    html: formatEmailHtml(taskData.body || taskData.content || ''),
                  });
                  result = { emailSent: replyResult.success, messageId: replyResult.messageId, to: taskData.to, aiGenerated: false };
                }
                break;
              }
              
              case 'approve_po': {
                // Auto-approve PO
                const po = await db.getPurchaseOrderById(taskData.purchaseOrderId);
                if (!po) throw new Error('Purchase order not found');
                await db.updatePurchaseOrder(taskData.purchaseOrderId, {
                  status: 'confirmed',
                });
                result = { approved: true, poId: taskData.purchaseOrderId, poNumber: po.poNumber };
                break;
              }
              
              case 'approve_invoice': {
                // Auto-approve invoice
                const invoice = await db.getInvoiceById(taskData.invoiceId);
                if (!invoice) throw new Error('Invoice not found');
                await db.updateInvoice(taskData.invoiceId, {
                  status: 'sent',
                });
                result = { approved: true, invoiceId: taskData.invoiceId, invoiceNumber: invoice.invoiceNumber };
                break;
              }
              
              case 'create_vendor': {
                // Create new vendor
                const vendor = await db.createVendor({
                  name: taskData.name,
                  email: taskData.email || undefined,
                  phone: taskData.phone || undefined,
                  address: taskData.address || undefined,
                  defaultLeadTimeDays: taskData.leadTimeDays || undefined,
                  status: 'active',
                });
                result = { created: true, vendorId: vendor.id, vendorName: taskData.name };
                break;
              }
              
              case 'create_material': {
                // Create new raw material
                const material = await db.createRawMaterial({
                  name: taskData.name,
                  sku: taskData.sku || undefined,
                  unit: taskData.unit || 'units',
                  category: taskData.category || undefined,
                  unitCost: taskData.unitCost || undefined,
                  description: taskData.description || undefined,
                });
                result = { created: true, materialId: material.id, materialName: taskData.name };
                break;
              }
              
              case 'create_product': {
                // Create new product
                const product = await db.createProduct({
                  name: taskData.name,
                  sku: taskData.sku || undefined,
                  category: taskData.category || undefined,
                  unitPrice: taskData.price || taskData.unitPrice || undefined,
                  description: taskData.description || undefined,
                });
                result = { created: true, productId: product.id, productName: taskData.name };
                break;
              }
              
              case 'create_bom': {
                // Create new BOM
                const bom = await db.createBom({
                  productId: taskData.productId,
                  name: taskData.name,
                  batchSize: taskData.batchSize || undefined,
                  batchUnit: taskData.batchUnit || undefined,
                  notes: taskData.notes || undefined,
                });
                result = { created: true, bomId: bom.id, bomName: taskData.name };
                break;
              }
              
              case 'create_customer': {
                // Create new customer
                const customer = await db.createCustomer({
                  name: taskData.name,
                  email: taskData.email || undefined,
                  phone: taskData.phone || undefined,
                  address: taskData.address || undefined,
                  type: taskData.type || 'business',
                });
                result = { created: true, customerId: customer.id, customerName: taskData.name };
                break;
              }
              
              case 'create_work_order': {
                // Create work order from BOM
                const bom = taskData.bomId ? await db.getBomById(taskData.bomId) : null;
                if (!bom) throw new Error('BOM not found');
                
                const workOrder = await db.createWorkOrder({
                  bomId: bom.id,
                  productId: bom.productId,
                  quantity: taskData.quantity?.toString() || '1',
                  status: 'draft',
                  priority: taskData.priority || 'medium',
                  notes: taskData.notes || `AI-generated work order for ${bom.name}`,
                });
                
                result = { created: true, workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber };
                break;
              }
              
              default:
                result = { executed: true, taskType: task.taskType };
            }
            
            await db.updateAiAgentTask(input.id, {
              status: 'completed',
              executedAt: new Date(),
              executionResult: JSON.stringify(result),
            });
            
            await db.createAiAgentLog({
              taskId: input.id,
              action: 'task_executed',
              status: 'success',
              message: `Task executed successfully`,
              details: JSON.stringify(result),
            });
            
            return { success: true, result };
          } catch (error: any) {
            await db.updateAiAgentTask(input.id, {
              status: 'failed',
              errorMessage: error.message,
              retryCount: (task.retryCount || 0) + 1,
            });
            
            await db.createAiAgentLog({
              taskId: input.id,
              action: 'task_failed',
              status: 'error',
              message: `Task execution failed: ${error.message}`,
            });
            
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
          }
        }),
    }),
    
    // Rules
    rules: router({
      list: protectedProcedure
        .input(z.object({ ruleType: z.string().optional(), isActive: z.boolean().optional() }).optional())
        .query(({ input }) => db.getAiAgentRules(input)),
      
      create: adminProcedure
        .input(z.object({
          name: z.string(),
          description: z.string().optional(),
          ruleType: z.enum(['inventory_reorder', 'po_auto_generate', 'rfq_auto_send', 'vendor_followup', 'payment_reminder', 'shipment_tracking', 'price_alert', 'quality_check']),
          triggerCondition: z.string(),
          actionConfig: z.string(),
          requiresApproval: z.boolean().default(true),
          autoApproveThreshold: z.string().optional(),
          notifyUsers: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          return db.createAiAgentRule({ ...input, createdBy: ctx.user.id });
        }),
      
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          triggerCondition: z.string().optional(),
          actionConfig: z.string().optional(),
          requiresApproval: z.boolean().optional(),
          autoApproveThreshold: z.string().optional(),
          notifyUsers: z.string().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateAiAgentRule(id, data);
          return { success: true };
        }),
    }),
    
    // Logs
    logs: router({
      list: protectedProcedure
        .input(z.object({
          taskId: z.number().optional(),
          ruleId: z.number().optional(),
          status: z.string().optional(),
          limit: z.number().default(100),
        }).optional())
        .query(({ input }) => db.getAiAgentLogs(input, input?.limit)),
    }),
    
    // Email Templates
    emailTemplates: router({
      list: protectedProcedure
        .input(z.object({ templateType: z.string().optional(), isActive: z.boolean().optional() }).optional())
        .query(({ input }) => db.getEmailTemplates(input)),
      
      create: adminProcedure
        .input(z.object({
          name: z.string(),
          templateType: z.enum(['po_to_vendor', 'rfq_request', 'quote_request', 'shipment_confirmation', 'payment_reminder', 'vendor_followup', 'quality_issue', 'general']),
          subject: z.string(),
          bodyTemplate: z.string(),
          isDefault: z.boolean().default(false),
        }))
        .mutation(async ({ input, ctx }) => {
          return db.createEmailTemplate({ ...input, createdBy: ctx.user.id });
        }),
      
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          subject: z.string().optional(),
          bodyTemplate: z.string().optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateEmailTemplate(id, data);
          return { success: true };
        }),
    }),
    
    // AI-driven automation triggers
    generatePoSuggestion: adminProcedure
      .input(z.object({
        rawMaterialId: z.number(),
        quantity: z.string(),
        vendorId: z.number().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Get material and vendor info
        const material = await db.getRawMaterialById(input.rawMaterialId);
        if (!material) throw new TRPCError({ code: 'NOT_FOUND', message: 'Material not found' });
        
        const vendorId = input.vendorId || material.preferredVendorId;
        if (!vendorId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No vendor specified' });
        
        const vendor = await db.getVendorById(vendorId);
        if (!vendor) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
        
        // Calculate expected date based on lead time
        const leadDays = vendor.defaultLeadTimeDays || 14;
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() + leadDays);
        
        // Calculate total amount
        const unitCost = parseFloat(material.unitCost?.toString() || '0');
        const qty = parseFloat(input.quantity);
        const totalAmount = (unitCost * qty).toFixed(2);
        
        // Create AI task for PO generation
        const task = await db.createAiAgentTask({
          taskType: 'generate_po',
          priority: 'medium',
          taskData: JSON.stringify({
            vendorId,
            vendorName: vendor.name,
            rawMaterialId: input.rawMaterialId,
            materialName: material.name,
            quantity: input.quantity,
            unitCost: material.unitCost,
            totalAmount,
            expectedDate: expectedDate.toISOString(),
            notes: input.reason || `Auto-generated PO for ${material.name}`,
          }),
          aiReasoning: input.reason || `Material ${material.name} needs reorder. Current stock is low.`,
          aiConfidence: '85.00',
          relatedEntityType: 'rawMaterial',
          relatedEntityId: input.rawMaterialId,
          requiresApproval: true,
        });
        
        await db.createAiAgentLog({
          taskId: task.id,
          action: 'po_suggestion_created',
          status: 'info',
          message: `PO suggestion created for ${material.name} from ${vendor.name}`,
          details: JSON.stringify({ quantity: input.quantity, totalAmount }),
        });
        
        return task;
      }),
    
    generateRfqSuggestion: adminProcedure
      .input(z.object({
        rawMaterialId: z.number(),
        quantity: z.string(),
        vendorIds: z.array(z.number()),
        dueDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const material = await db.getRawMaterialById(input.rawMaterialId);
        if (!material) throw new TRPCError({ code: 'NOT_FOUND', message: 'Material not found' });
        
        const task = await db.createAiAgentTask({
          taskType: 'send_rfq',
          priority: 'medium',
          taskData: JSON.stringify({
            rawMaterialId: input.rawMaterialId,
            materialName: material.name,
            quantity: input.quantity,
            vendorIds: input.vendorIds,
            dueDate: input.dueDate?.toISOString(),
          }),
          aiReasoning: `RFQ needed for ${material.name} to compare vendor pricing`,
          aiConfidence: '90.00',
          relatedEntityType: 'rawMaterial',
          relatedEntityId: input.rawMaterialId,
          requiresApproval: true,
        });
        
        return task;
      }),
    
    // AI Email Reply Generation
    analyzeEmail: protectedProcedure
      .input(z.object({
        from: z.string(),
        subject: z.string(),
        body: z.string(),
      }))
      .mutation(async ({ input }) => {
        return analyzeEmail(input);
      }),
    
    generateEmailReply: protectedProcedure
      .input(z.object({
        originalEmail: z.object({
          from: z.string(),
          subject: z.string(),
          body: z.string(),
          emailId: z.number().optional(),
        }),
        companyName: z.string().optional(),
        senderName: z.string().optional(),
        senderTitle: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return generateEmailReply({
          originalEmail: input.originalEmail,
          companyContext: {
            companyName: input.companyName || 'Our Company',
            senderName: input.senderName || ctx.user.name || 'Customer Service',
            senderTitle: input.senderTitle,
          },
        });
      }),
    
    sendEmailReply: protectedProcedure
      .input(z.object({
        originalEmail: z.object({
          from: z.string(),
          subject: z.string(),
          body: z.string(),
          emailId: z.number().optional(),
        }),
        autoSend: z.boolean().default(false),
        companyName: z.string().optional(),
        senderName: z.string().optional(),
        senderTitle: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return processEmailReply({
          originalEmail: input.originalEmail,
          autoSend: input.autoSend,
          companyName: input.companyName,
          senderName: input.senderName || ctx.user.name || 'Customer Service',
          senderTitle: input.senderTitle,
        });
      }),
    
    // Create email reply task for approval queue
    createEmailReplyTask: protectedProcedure
      .input(z.object({
        to: z.string(),
        originalSubject: z.string(),
        originalBody: z.string(),
        emailId: z.number().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
        companyName: z.string().optional(),
        senderName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // First generate a preview of the reply
        const preview = await generateEmailReply({
          originalEmail: {
            from: input.to,
            subject: input.originalSubject,
            body: input.originalBody,
          },
          companyContext: {
            companyName: input.companyName || 'Our Company',
            senderName: input.senderName || ctx.user.name || 'Customer Service',
          },
        });
        
        // Create task with the generated reply for approval
        const task = await db.createAiAgentTask({
          taskType: 'reply_email',
          priority: input.priority,
          taskData: JSON.stringify({
            to: input.to,
            originalSubject: input.originalSubject,
            originalBody: input.originalBody,
            emailId: input.emailId,
            generatedSubject: preview.subject,
            generatedBody: preview.body,
            tone: preview.tone,
            suggestedActions: preview.suggestedActions,
            companyName: input.companyName,
            senderName: input.senderName || ctx.user.name || 'Customer Service',
            generateWithAI: true,
          }),
          aiReasoning: `AI-generated reply to email from ${input.to}. Tone: ${preview.tone}. Confidence: ${preview.confidence}%`,
          aiConfidence: preview.confidence.toFixed(2),
          relatedEntityType: 'email',
          relatedEntityId: input.emailId || 0,
          requiresApproval: true,
        });
        
        await db.createAiAgentLog({
          taskId: task.id,
          action: 'email_reply_generated',
          status: 'info',
          message: `Email reply generated for ${input.to}`,
          details: JSON.stringify({ subject: preview.subject, tone: preview.tone }),
        });
        
        return { task, preview };
      }),
  }),

  // ============================================
  // FREIGHT MANAGEMENT
  // ============================================
  freight: router({
    // Dashboard stats
    dashboardStats: protectedProcedure.query(() => db.getFreightDashboardStats()),
    
    // Carriers
    carriers: router({
      list: protectedProcedure
        .input(z.object({ type: z.string().optional(), isActive: z.boolean().optional() }).optional())
        .query(({ input }) => db.getFreightCarriers(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightCarrierById(input.id)),
      create: opsProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(['ocean', 'air', 'ground', 'rail', 'multimodal']),
          contactName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          country: z.string().optional(),
          website: z.string().optional(),
          notes: z.string().optional(),
          isPreferred: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createFreightCarrier(input);
          await createAuditLog(ctx.user.id, 'create', 'freight_carrier', result.id, input.name);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          type: z.enum(['ocean', 'air', 'ground', 'rail', 'multimodal']).optional(),
          contactName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          country: z.string().optional(),
          website: z.string().optional(),
          notes: z.string().optional(),
          isPreferred: z.boolean().optional(),
          isActive: z.boolean().optional(),
          rating: z.number().min(1).max(5).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightCarrier(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_carrier', id);
          return { success: true };
        }),
    }),
    
    // RFQs
    rfqs: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional() }).optional())
        .query(({ input }) => db.getFreightRfqs(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightRfqById(input.id)),
      create: opsProcedure
        .input(z.object({
          title: z.string().min(1),
          originCountry: z.string().optional(),
          originCity: z.string().optional(),
          originAddress: z.string().optional(),
          destinationCountry: z.string().optional(),
          destinationCity: z.string().optional(),
          destinationAddress: z.string().optional(),
          cargoDescription: z.string().optional(),
          cargoType: z.enum(['general', 'hazardous', 'refrigerated', 'oversized', 'fragile', 'liquid', 'bulk']).optional(),
          totalWeight: z.string().optional(),
          totalVolume: z.string().optional(),
          numberOfPackages: z.number().optional(),
          hsCode: z.string().optional(),
          declaredValue: z.string().optional(),
          currency: z.string().optional(),
          preferredMode: z.enum(['ocean_fcl', 'ocean_lcl', 'air', 'express', 'ground', 'rail', 'any']).optional(),
          incoterms: z.string().optional(),
          requiredPickupDate: z.date().optional(),
          requiredDeliveryDate: z.date().optional(),
          insuranceRequired: z.boolean().optional(),
          customsClearanceRequired: z.boolean().optional(),
          purchaseOrderId: z.number().optional(),
          vendorId: z.number().optional(),
          notes: z.string().optional(),
          quoteDueDate: z.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createFreightRfq({ ...input, createdById: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'freight_rfq', result.id, result.rfqNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().optional(),
          status: z.enum(['draft', 'sent', 'awaiting_quotes', 'quotes_received', 'awarded', 'cancelled']).optional(),
          originCountry: z.string().optional(),
          originCity: z.string().optional(),
          originAddress: z.string().optional(),
          destinationCountry: z.string().optional(),
          destinationCity: z.string().optional(),
          destinationAddress: z.string().optional(),
          cargoDescription: z.string().optional(),
          totalWeight: z.string().optional(),
          totalVolume: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightRfq(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_rfq', id);
          return { success: true };
        }),
      
      // Send RFQ to carriers via AI email
      sendToCarriers: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          carrierIds: z.array(z.number()),
          includeSupplierDocs: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getFreightRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });
          
          // Get supplier documents if PO is linked
          let supplierDocs: any[] = [];
          let freightInfo: any = null;
          if (rfq.purchaseOrderId && input.includeSupplierDocs) {
            supplierDocs = await db.getSupplierDocuments({ purchaseOrderId: rfq.purchaseOrderId });
            freightInfo = await db.getSupplierFreightInfo(rfq.purchaseOrderId);
          }
          
          const results = { sent: 0, failed: 0, emails: [] as any[] };
          
          for (const carrierId of input.carrierIds) {
            const carrier = await db.getFreightCarrierById(carrierId);
            if (!carrier || !carrier.email) {
              results.failed++;
              continue;
            }
            
            // Build supplier documentation info for email
            let supplierDocsInfo = '';
            if (freightInfo) {
              supplierDocsInfo = `\n\nSHIPMENT DETAILS FROM SUPPLIER:\n`;
              supplierDocsInfo += `Total Packages: ${freightInfo.totalPackages || 'TBD'}\n`;
              supplierDocsInfo += `Gross Weight: ${freightInfo.totalGrossWeight || 'TBD'} ${freightInfo.weightUnit || 'kg'}\n`;
              supplierDocsInfo += `Net Weight: ${freightInfo.totalNetWeight || 'TBD'} ${freightInfo.weightUnit || 'kg'}\n`;
              supplierDocsInfo += `Volume: ${freightInfo.totalVolume || 'TBD'} ${freightInfo.volumeUnit || 'CBM'}\n`;
              if (freightInfo.packageDimensions) {
                try {
                  const dims = JSON.parse(freightInfo.packageDimensions);
                  supplierDocsInfo += `Package Dimensions: ${dims.map((d: any) => `${d.length}x${d.width}x${d.height}cm (${d.quantity} pcs)`).join(', ')}\n`;
                } catch {}
              }
              if (freightInfo.hsCodes) {
                try {
                  const codes = JSON.parse(freightInfo.hsCodes);
                  supplierDocsInfo += `HS Codes: ${codes.map((c: any) => c.code).join(', ')}\n`;
                } catch {}
              }
              if (freightInfo.hasDangerousGoods) {
                supplierDocsInfo += `DANGEROUS GOODS: Class ${freightInfo.dangerousGoodsClass}, UN ${freightInfo.unNumber}\n`;
              }
              if (freightInfo.specialInstructions) {
                supplierDocsInfo += `Special Instructions: ${freightInfo.specialInstructions}\n`;
              }
            }
            
            let attachmentsInfo = '';
            if (supplierDocs.length > 0) {
              attachmentsInfo = `\n\nATTACHED DOCUMENTATION:\n`;
              supplierDocs.forEach((doc: any) => {
                attachmentsInfo += `- ${doc.documentType.replace(/_/g, ' ').toUpperCase()}: ${doc.fileName}\n`;
              });
            }
            
            // Generate AI email content
            const emailPrompt = `Generate a professional freight quote request email for the following shipment:

RFQ Number: ${rfq.rfqNumber}
Title: ${rfq.title}
Origin: ${rfq.originCity || ''}, ${rfq.originCountry || ''}
Destination: ${rfq.destinationCity || ''}, ${rfq.destinationCountry || ''}
Cargo: ${rfq.cargoDescription || 'General cargo'}
Weight: ${rfq.totalWeight || freightInfo?.totalGrossWeight || 'TBD'} ${freightInfo?.weightUnit || 'kg'}
Volume: ${rfq.totalVolume || freightInfo?.totalVolume || 'TBD'} ${freightInfo?.volumeUnit || 'CBM'}
Packages: ${rfq.numberOfPackages || freightInfo?.totalPackages || 'TBD'}
Preferred Mode: ${rfq.preferredMode || 'Any'}
Incoterms: ${rfq.incoterms || freightInfo?.incoterms || 'TBD'}
Required Pickup: ${rfq.requiredPickupDate ? new Date(rfq.requiredPickupDate).toLocaleDateString() : freightInfo?.preferredShipDate ? new Date(freightInfo.preferredShipDate).toLocaleDateString() : 'Flexible'}
Required Delivery: ${rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}
Insurance Required: ${rfq.insuranceRequired ? 'Yes' : 'No'}
Customs Clearance Required: ${rfq.customsClearanceRequired ? 'Yes' : 'No'}${supplierDocsInfo}${attachmentsInfo}

Please provide:
1. Freight cost breakdown
2. Transit time
3. Routing
4. Quote validity period

Format the email professionally and request a response by ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : '5 business days'}.`;

            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are a logistics coordinator drafting freight quote request emails. Be professional, clear, and include all relevant shipment details.' },
                { role: 'user', content: emailPrompt },
              ],
            });
            
            const rawEmailBody = response.choices[0]?.message?.content;
            const emailBody = typeof rawEmailBody === 'string' ? rawEmailBody : 'Unable to generate email content.';
            
            const emailSubject = `Request for Quote: ${rfq.rfqNumber} - ${rfq.title}`;
            let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
            let deliveryError: string | undefined;
            
            // Try to send via SendGrid if configured
            if (isEmailConfigured()) {
              const sendResult = await sendEmail({
                to: carrier.email,
                subject: emailSubject,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              
              if (sendResult.success) {
                emailStatus = 'sent';
              } else {
                emailStatus = 'failed';
                deliveryError = sendResult.error;
              }
            }
            
            // Save the email record
            const emailResult = await db.createFreightEmail({
              rfqId: input.rfqId,
              carrierId,
              direction: 'outbound',
              emailType: 'rfq_request',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'logistics@company.com',
              toEmail: carrier.email,
              subject: emailSubject,
              body: emailBody,
              aiGenerated: true,
              status: emailStatus,
            });
            
            if (emailStatus === 'sent') {
              results.sent++;
            } else {
              results.failed++;
            }
            results.emails.push({ 
              carrierId, 
              carrierName: carrier.name, 
              emailId: emailResult.id,
              status: emailStatus,
              error: deliveryError,
            });
          }
          
          // Update RFQ status
          await db.updateFreightRfq(input.rfqId, { status: 'sent' });
          const emailConfigured = isEmailConfigured();
          const auditMessage = emailConfigured 
            ? `Emails sent to ${results.sent} carriers` 
            : `Email drafts created for ${results.sent + results.failed} carriers (SendGrid not configured)`;
          await createAuditLog(ctx.user.id, 'update', 'freight_rfq', input.rfqId, auditMessage);
          
          return { ...results, emailConfigured };
        }),
    }),
    
    // Quotes
    quotes: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional() }).optional())
        .query(({ input }) => db.getFreightQuotes(input?.rfqId)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightQuoteById(input.id)),
      create: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          carrierId: z.number(),
          quoteNumber: z.string().optional(),
          freightCost: z.string().optional(),
          fuelSurcharge: z.string().optional(),
          originCharges: z.string().optional(),
          destinationCharges: z.string().optional(),
          customsFees: z.string().optional(),
          insuranceCost: z.string().optional(),
          otherCharges: z.string().optional(),
          totalCost: z.string().optional(),
          currency: z.string().optional(),
          transitDays: z.number().optional(),
          shippingMode: z.string().optional(),
          routeDescription: z.string().optional(),
          validUntil: z.date().optional(),
          notes: z.string().optional(),
          receivedVia: z.enum(['email', 'portal', 'phone', 'manual']).optional(),
          rawEmailContent: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createFreightQuote({ ...input, status: 'received' });
          await createAuditLog(ctx.user.id, 'create', 'freight_quote', result.id);
          
          // Update RFQ status
          await db.updateFreightRfq(input.rfqId, { status: 'quotes_received' });
          
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'received', 'under_review', 'accepted', 'rejected', 'expired']).optional(),
          aiScore: z.number().optional(),
          aiAnalysis: z.string().optional(),
          aiRecommendation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightQuote(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_quote', id);
          return { success: true };
        }),
      
      // AI analyze and compare quotes
      analyzeQuotes: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const quotes = await db.getFreightQuotes(input.rfqId);
          const rfq = await db.getFreightRfqById(input.rfqId);
          
          if (!quotes.length) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No quotes to analyze' });
          }
          
          // Get carrier details for each quote
          const quotesWithCarriers = await Promise.all(
            quotes.map(async (q) => {
              const carrier = await db.getFreightCarrierById(q.carrierId);
              return { ...q, carrierName: carrier?.name, carrierRating: carrier?.rating };
            })
          );
          
          const analysisPrompt = `Analyze and compare these freight quotes for the following shipment:

Shipment Details:
- Route: ${rfq?.originCity}, ${rfq?.originCountry} → ${rfq?.destinationCity}, ${rfq?.destinationCountry}
- Cargo: ${rfq?.cargoDescription}
- Weight: ${rfq?.totalWeight} kg
- Volume: ${rfq?.totalVolume} CBM
- Required Delivery: ${rfq?.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}

Quotes Received:
${quotesWithCarriers.map((q, i) => `
Quote ${i + 1} - ${q.carrierName} (Rating: ${q.carrierRating || 'N/A'}/5):
- Total Cost: ${q.currency || 'USD'} ${q.totalCost}
- Transit Days: ${q.transitDays || 'N/A'}
- Shipping Mode: ${q.shippingMode || 'N/A'}
- Route: ${q.routeDescription || 'N/A'}
- Valid Until: ${q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'N/A'}
- Breakdown: Freight: ${q.freightCost}, Fuel: ${q.fuelSurcharge}, Origin: ${q.originCharges}, Dest: ${q.destinationCharges}, Customs: ${q.customsFees}`).join('\n')}

Provide:
1. A score (1-100) for each quote based on cost, transit time, reliability, and value
2. Pros and cons for each quote
3. A clear recommendation with reasoning
4. Any red flags or concerns

Format your response as JSON with the structure:
{
  "quotes": [
    { "carrierId": number, "score": number, "pros": [string], "cons": [string] }
  ],
  "recommendation": { "carrierId": number, "reasoning": string },
  "summary": string
}`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a freight logistics expert analyzing shipping quotes. Provide detailed, data-driven analysis.' },
              { role: 'user', content: analysisPrompt },
            ],
          });
          
          const rawAnalysis = response.choices[0]?.message?.content;
          const analysisText = typeof rawAnalysis === 'string' ? rawAnalysis : '{}';
          
          // Try to parse JSON from the response
          let analysis;
          try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, analysisText];
            analysis = JSON.parse(jsonMatch[1] || analysisText);
          } catch {
            analysis = { summary: analysisText, quotes: [], recommendation: null };
          }
          
          // Update quotes with AI scores
          for (const quoteAnalysis of analysis.quotes || []) {
            if (quoteAnalysis.carrierId) {
              const quote = quotes.find(q => q.carrierId === quoteAnalysis.carrierId);
              if (quote) {
                await db.updateFreightQuote(quote.id, {
                  aiScore: quoteAnalysis.score,
                  aiAnalysis: JSON.stringify({ pros: quoteAnalysis.pros, cons: quoteAnalysis.cons }),
                  aiRecommendation: analysis.recommendation?.carrierId === quoteAnalysis.carrierId ? 'Recommended' : undefined,
                });
              }
            }
          }
          
          await createAuditLog(ctx.user.id, 'view', 'freight_quote_analysis', input.rfqId);
          
          return analysis;
        }),
      
      // Accept a quote and create booking
      accept: opsProcedure
        .input(z.object({ quoteId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getFreightQuoteById(input.quoteId);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          // Update quote status
          await db.updateFreightQuote(input.quoteId, { status: 'accepted' });
          
          // Reject other quotes for this RFQ
          const otherQuotes = await db.getFreightQuotes(quote.rfqId);
          for (const q of otherQuotes) {
            if (q.id !== input.quoteId && q.status !== 'rejected') {
              await db.updateFreightQuote(q.id, { status: 'rejected' });
            }
          }
          
          // Create booking
          const booking = await db.createFreightBooking({
            quoteId: input.quoteId,
            rfqId: quote.rfqId,
            carrierId: quote.carrierId,
            status: 'pending',
            agreedCost: quote.totalCost,
            currency: quote.currency || 'USD',
          });
          
          // Update RFQ status
          await db.updateFreightRfq(quote.rfqId, { status: 'awarded' });
          
          await createAuditLog(ctx.user.id, 'approve', 'freight_quote', input.quoteId, `Booking ${booking.bookingNumber} created`);
          
          return { booking };
        }),
    }),
    
    // Emails
    emails: router({
      list: protectedProcedure
        .input(z.object({
          rfqId: z.number().optional(),
          carrierId: z.number().optional(),
          direction: z.enum(['outbound', 'inbound']).optional(),
        }).optional())
        .query(({ input }) => db.getFreightEmails(input)),
      
      // Parse incoming email with AI
      parseIncoming: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          carrierId: z.number(),
          fromEmail: z.string(),
          subject: z.string(),
          body: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Use AI to extract quote data from email
          const parsePrompt = `Extract freight quote information from this email:

From: ${input.fromEmail}
Subject: ${input.subject}

Body:
${input.body}

Extract and return as JSON:
{
  "quoteNumber": string or null,
  "freightCost": number or null,
  "fuelSurcharge": number or null,
  "originCharges": number or null,
  "destinationCharges": number or null,
  "customsFees": number or null,
  "totalCost": number or null,
  "currency": string (default "USD"),
  "transitDays": number or null,
  "shippingMode": string or null,
  "routeDescription": string or null,
  "validUntil": string (ISO date) or null,
  "notes": string or null
}`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a logistics data extraction expert. Extract structured quote data from freight emails accurately.' },
              { role: 'user', content: parsePrompt },
            ],
          });
          
          const rawExtracted = response.choices[0]?.message?.content;
          const extractedText = typeof rawExtracted === 'string' ? rawExtracted : '{}';
          
          let extractedData;
          try {
            const jsonMatch = extractedText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, extractedText];
            extractedData = JSON.parse(jsonMatch[1] || extractedText);
          } catch {
            extractedData = {};
          }
          
          // Save the email
          const emailResult = await db.createFreightEmail({
            rfqId: input.rfqId,
            carrierId: input.carrierId,
            direction: 'inbound',
            emailType: 'quote_response',
            fromEmail: input.fromEmail,
            toEmail: 'logistics@company.com',
            subject: input.subject,
            body: input.body,
            aiParsed: true,
            aiExtractedData: JSON.stringify(extractedData),
            status: 'read',
          });
          
          // If we extracted valid quote data, create a quote
          if (extractedData.totalCost) {
            const quoteResult = await db.createFreightQuote({
              rfqId: input.rfqId,
              carrierId: input.carrierId,
              quoteNumber: extractedData.quoteNumber,
              freightCost: extractedData.freightCost?.toString(),
              fuelSurcharge: extractedData.fuelSurcharge?.toString(),
              originCharges: extractedData.originCharges?.toString(),
              destinationCharges: extractedData.destinationCharges?.toString(),
              customsFees: extractedData.customsFees?.toString(),
              totalCost: extractedData.totalCost?.toString(),
              currency: extractedData.currency || 'USD',
              transitDays: extractedData.transitDays,
              shippingMode: extractedData.shippingMode,
              routeDescription: extractedData.routeDescription,
              validUntil: extractedData.validUntil ? new Date(extractedData.validUntil) : undefined,
              notes: extractedData.notes,
              receivedVia: 'email',
              rawEmailContent: input.body,
              status: 'received',
            });
            
            return { email: emailResult, quote: quoteResult, extractedData };
          }
          
          return { email: emailResult, quote: null, extractedData };
        }),
    }),
    
    // Bookings
    bookings: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional() }).optional())
        .query(({ input }) => db.getFreightBookings(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getFreightBookingById(input.id)),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'confirmed', 'in_transit', 'arrived', 'delivered', 'cancelled']).optional(),
          trackingNumber: z.string().optional(),
          containerNumber: z.string().optional(),
          vesselName: z.string().optional(),
          voyageNumber: z.string().optional(),
          pickupDate: z.date().optional(),
          departureDate: z.date().optional(),
          arrivalDate: z.date().optional(),
          deliveryDate: z.date().optional(),
          actualCost: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateFreightBooking(id, data);
          await createAuditLog(ctx.user.id, 'update', 'freight_booking', id);
          return { success: true };
        }),
    }),
  }),
  
  // ============================================
  // CUSTOMS CLEARANCE
  // ============================================
  customs: router({
    clearances: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional(), type: z.enum(['import', 'export']).optional() }).optional())
        .query(({ input }) => db.getCustomsClearances(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCustomsClearanceById(input.id)),
      create: opsProcedure
        .input(z.object({
          shipmentId: z.number().optional(),
          rfqId: z.number().optional(),
          type: z.enum(['import', 'export']),
          customsOffice: z.string().optional(),
          portOfEntry: z.string().optional(),
          country: z.string().optional(),
          customsBrokerId: z.number().optional(),
          brokerReference: z.string().optional(),
          expectedClearanceDate: z.date().optional(),
          hsCode: z.string().optional(),
          countryOfOrigin: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createCustomsClearance(input);
          await createAuditLog(ctx.user.id, 'create', 'customs_clearance', result.id, result.clearanceNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending_documents', 'documents_submitted', 'under_review', 'additional_info_required', 'cleared', 'held', 'rejected']).optional(),
          submissionDate: z.date().optional(),
          expectedClearanceDate: z.date().optional(),
          actualClearanceDate: z.date().optional(),
          dutyAmount: z.string().optional(),
          taxAmount: z.string().optional(),
          otherFees: z.string().optional(),
          totalAmount: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateCustomsClearance(id, data);
          await createAuditLog(ctx.user.id, 'update', 'customs_clearance', id);
          return { success: true };
        }),
      
      // AI summary of clearance status
      getSummary: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const clearance = await db.getCustomsClearanceById(input.id);
          if (!clearance) return null;
          
          const documents = await db.getCustomsDocuments(input.id);
          
          const summaryPrompt = `Summarize the customs clearance status:

Clearance Number: ${clearance.clearanceNumber}
Type: ${clearance.type}
Status: ${clearance.status}
Port: ${clearance.portOfEntry || 'N/A'}
Country: ${clearance.country || 'N/A'}
HS Code: ${clearance.hsCode || 'N/A'}
Country of Origin: ${clearance.countryOfOrigin || 'N/A'}

Documents (${documents.length} total):
${documents.map(d => `- ${d.documentType}: ${d.status}`).join('\n')}

Duties/Taxes:
- Duty: ${clearance.dutyAmount || 'TBD'}
- Tax: ${clearance.taxAmount || 'TBD'}
- Other: ${clearance.otherFees || 'TBD'}
- Total: ${clearance.totalAmount || 'TBD'}

Provide a brief status summary, any missing documents, and next steps.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a customs clearance specialist. Provide clear, actionable status summaries.' },
              { role: 'user', content: summaryPrompt },
            ],
          });
          
          const rawSummary = response.choices[0]?.message?.content;
          return {
            clearance,
            documents,
            aiSummary: typeof rawSummary === 'string' ? rawSummary : 'Unable to generate summary.',
          };
        }),
    }),
    
    documents: router({
      list: protectedProcedure
        .input(z.object({ clearanceId: z.number() }))
        .query(({ input }) => db.getCustomsDocuments(input.clearanceId)),
      create: opsProcedure
        .input(z.object({
          clearanceId: z.number(),
          documentType: z.enum([
            'commercial_invoice', 'packing_list', 'bill_of_lading', 'airway_bill',
            'certificate_of_origin', 'customs_declaration', 'import_license', 'export_license',
            'insurance_certificate', 'inspection_certificate', 'phytosanitary_certificate',
            'fumigation_certificate', 'dangerous_goods_declaration', 'other'
          ]),
          name: z.string(),
          fileUrl: z.string().optional(),
          fileKey: z.string().optional(),
          mimeType: z.string().optional(),
          fileSize: z.number().optional(),
          expiryDate: z.date().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createCustomsDocument({ ...input, status: input.fileUrl ? 'uploaded' : 'pending' });
          await createAuditLog(ctx.user.id, 'create', 'customs_document', result.id, input.name);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'uploaded', 'verified', 'rejected', 'expired']).optional(),
          fileUrl: z.string().optional(),
          fileKey: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          if (data.status === 'verified') {
            (data as any).verifiedAt = new Date();
            (data as any).verifiedById = ctx.user.id;
          }
          await db.updateCustomsDocument(id, data);
          await createAuditLog(ctx.user.id, 'update', 'customs_document', id);
          return { success: true };
        }),
      
      // Upload document file
      upload: opsProcedure
        .input(z.object({
          clearanceId: z.number(),
          documentType: z.enum([
            'commercial_invoice', 'packing_list', 'bill_of_lading', 'airway_bill',
            'certificate_of_origin', 'customs_declaration', 'import_license', 'export_license',
            'insurance_certificate', 'inspection_certificate', 'phytosanitary_certificate',
            'fumigation_certificate', 'dangerous_goods_declaration', 'other'
          ]),
          name: z.string(),
          fileData: z.string(), // Base64 encoded
          mimeType: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const buffer = Buffer.from(input.fileData, 'base64');
          const fileKey = `customs/${input.clearanceId}/${nanoid()}-${input.name}`;
          
          const { url } = await storagePut(fileKey, buffer, input.mimeType);
          
          const result = await db.createCustomsDocument({
            clearanceId: input.clearanceId,
            documentType: input.documentType,
            name: input.name,
            fileUrl: url,
            fileKey,
            mimeType: input.mimeType,
            fileSize: buffer.length,
            status: 'uploaded',
          });
          
          await createAuditLog(ctx.user.id, 'create', 'customs_document', result.id, input.name);
          
          return { id: result.id, url };
        }),
     }),
  }),

  // Team Management
  team: router({
    // List all team members (admin only)
    list: adminProcedure.query(async () => {
      return db.getTeamMembers();
    }),

    // Get current user's permissions
    myPermissions: protectedProcedure.query(async ({ ctx }) => {
      const permissions = await db.getUserEffectivePermissions(ctx.user.id);
      return {
        role: ctx.user.role,
        permissions,
        linkedVendorId: ctx.user.linkedVendorId,
        linkedWarehouseId: ctx.user.linkedWarehouseId,
      };
    }),

    // Get a specific team member
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getTeamMemberById(input.id);
      }),

    // Update team member role and permissions
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        role: z.enum(['user', 'admin', 'finance', 'ops', 'legal', 'exec', 'copacker', 'vendor', 'contractor']).optional(),
        linkedVendorId: z.number().nullable().optional(),
        linkedWarehouseId: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateTeamMember(id, data);
        await createAuditLog(ctx.user.id, 'update', 'user', id);
        return { success: true };
      }),

    // Deactivate team member
    deactivate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deactivateTeamMember(input.id);
        await createAuditLog(ctx.user.id, 'update', 'user', input.id, undefined, { isActive: true }, { isActive: false });
        return { success: true };
      }),

    // Reactivate team member
    reactivate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.reactivateTeamMember(input.id);
        await createAuditLog(ctx.user.id, 'update', 'user', input.id, undefined, { isActive: false }, { isActive: true });
        return { success: true };
      }),

    // Set custom permissions for a user
    setPermissions: adminProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.array(z.string()),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.setUserPermissions(input.userId, input.permissions, ctx.user.id);
        await createAuditLog(ctx.user.id, 'update', 'user_permissions', input.userId);
        return { success: true };
      }),

    // Get user permissions
    getPermissions: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return db.getUserPermissions(input.userId);
      }),
  }),

  // Team Invitations
  invitations: router({
    // List all invitations (admin only)
    list: adminProcedure.query(async () => {
      return db.getTeamInvitations();
    }),

    // Create invitation
    create: adminProcedure
      .input(z.object({
        email: z.string().email(),
        role: z.enum(['user', 'admin', 'finance', 'ops', 'legal', 'exec', 'copacker', 'vendor', 'contractor']),
        linkedVendorId: z.number().nullable().optional(),
        linkedWarehouseId: z.number().nullable().optional(),
        customPermissions: z.array(z.string()).optional(),
        expiresInDays: z.number().min(1).max(30).default(7),
      }))
      .mutation(async ({ input, ctx }) => {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

        const result = await db.createTeamInvitation({
          email: input.email,
          role: input.role,
          invitedBy: ctx.user.id,
          linkedVendorId: input.linkedVendorId,
          linkedWarehouseId: input.linkedWarehouseId,
          customPermissions: input.customPermissions ? JSON.stringify(input.customPermissions) : null,
          expiresAt,
        });

        await createAuditLog(ctx.user.id, 'create', 'team_invitation', result?.id || 0, input.email);

        return result;
      }),

    // Accept invitation (public - user accepting their invite)
    accept: protectedProcedure
      .input(z.object({ inviteCode: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.acceptTeamInvitation(input.inviteCode, ctx.user.id);
        if (result.success) {
          await createAuditLog(ctx.user.id, 'update', 'team_invitation', 0, input.inviteCode);
        }
        return result;
      }),

    // Revoke invitation
    revoke: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.revokeTeamInvitation(input.id);
        await createAuditLog(ctx.user.id, 'update', 'team_invitation', input.id);
        return { success: true };
      }),

    // Check invitation by code (public)
    checkCode: publicProcedure
      .input(z.object({ inviteCode: z.string() }))
      .query(async ({ input }) => {
        const invitation = await db.getTeamInvitationByCode(input.inviteCode);
        if (!invitation) {
          return { valid: false, error: 'Invalid invitation code' };
        }
        if (invitation.status !== 'pending') {
          return { valid: false, error: 'Invitation is no longer valid' };
        }
        if (new Date(invitation.expiresAt) < new Date()) {
          return { valid: false, error: 'Invitation has expired' };
        }
        return {
          valid: true,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        };
      }),
  }),

  // Copacker Portal - restricted views for copackers
  copackerPortal: router({
    // Get inventory for copacker's assigned warehouse
    getInventory: copackerProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned to this account' });
      }
      
      const warehouseId = ctx.user.role === 'copacker' 
        ? ctx.user.linkedWarehouseId! 
        : null;
      
      if (warehouseId) {
        return db.getInventoryByWarehouse(warehouseId);
      }
      
      // Admin/ops can see all
      return db.getInventory();
    }),

    // Get copacker's assigned warehouse info
    getWarehouse: copackerProcedure.query(async ({ ctx }) => {
      if (!ctx.user.linkedWarehouseId) {
        return null;
      }
      return db.getWarehouseById(ctx.user.linkedWarehouseId);
    }),

    // Update inventory quantity (copacker can only update their warehouse)
    updateInventory: copackerProcedure
      .input(z.object({
        inventoryId: z.number(),
        quantity: z.number().min(0),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify copacker has access to this inventory item
        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId) {
          const inventoryItems = await db.getInventoryByWarehouse(ctx.user.linkedWarehouseId);
          const hasAccess = inventoryItems.some(item => item.inventory.id === input.inventoryId);
          if (!hasAccess) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this inventory item' });
          }
        }

        await db.updateInventoryQuantityById(input.inventoryId, input.quantity, ctx.user.id, input.notes);

        // Check if stock is low and trigger auto-purchase order if needed
        const autoPurchaseResult = await db.checkAndTriggerLowStockPurchaseOrder(input.inventoryId, ctx.user.id);

        return {
          success: true,
          autoPurchase: autoPurchaseResult
        };
      }),

    // Get shipments for copacker's warehouse (filter by PO vendor)
    getShipments: copackerProcedure.query(async ({ ctx }) => {
      const allShipments = await db.getShipments();
      // Copackers see all shipments - they can filter by their location in the UI
      return allShipments;
    }),

    // Upload shipment document (copacker can upload for their shipments)
    uploadShipmentDocument: copackerProcedure
      .input(z.object({
        shipmentId: z.number(),
        documentType: z.enum(['invoice', 'receipt', 'contract', 'legal', 'report', 'hr', 'other']),
        name: z.string(),
        fileData: z.string(), // Base64 encoded
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `shipments/${input.shipmentId}/${nanoid()}-${input.name}`;
        
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        const result = await db.createDocument({
          name: input.name,
          type: input.documentType,
          category: 'shipment',
          fileUrl: url,
          fileKey,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          referenceType: 'shipment',
          referenceId: input.shipmentId,
        });

        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);

        return { id: result.id, url };
      }),

    // --- Biweekly Inventory Updates ---

    // Get biweekly inventory update submissions
    getInventoryUpdates: copackerProcedure.query(async ({ ctx }) => {
      const warehouseId = ctx.user.role === 'copacker' ? ctx.user.linkedWarehouseId! : undefined;
      return db.getCopackerInventoryUpdates(warehouseId ?? undefined);
    }),

    // Get a single inventory update with its line items
    getInventoryUpdateDetail: copackerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const update = await db.getCopackerInventoryUpdateById(input.id);
        if (!update) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inventory update not found' });

        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId && update.warehouseId !== ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const items = await db.getCopackerInventoryUpdateItems(input.id);
        return { update, items };
      }),

    // Create a new biweekly inventory update (draft)
    createInventoryUpdate: copackerProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number(),
          previousQuantity: z.string().optional(),
          newQuantity: z.string(),
          quantityReceived: z.string().optional(),
          quantityShipped: z.string().optional(),
          quantityDamaged: z.string().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned' });
        }

        const warehouseId = ctx.user.linkedWarehouseId!;
        const { items, ...updateData } = input;

        const result = await db.createCopackerInventoryUpdate({
          warehouseId,
          submittedBy: ctx.user.id,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          status: 'draft',
          notes: updateData.notes,
        });

        for (const item of items) {
          await db.createCopackerInventoryUpdateItem({
            updateId: result.id,
            productId: item.productId,
            previousQuantity: item.previousQuantity,
            newQuantity: item.newQuantity,
            quantityReceived: item.quantityReceived || "0",
            quantityShipped: item.quantityShipped || "0",
            quantityDamaged: item.quantityDamaged || "0",
            notes: item.notes,
          });
        }

        await createAuditLog(ctx.user.id, 'create', 'copacker_inventory_update', result.id);
        return { id: result.id };
      }),

    // Submit a draft inventory update
    submitInventoryUpdate: copackerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const update = await db.getCopackerInventoryUpdateById(input.id);
        if (!update) throw new TRPCError({ code: 'NOT_FOUND' });
        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId && update.warehouseId !== ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        await db.updateCopackerInventoryUpdate(input.id, { status: 'submitted' });

        // Apply inventory quantities to actual inventory table
        const items = await db.getCopackerInventoryUpdateItems(input.id);
        for (const row of items) {
          const invItems = await db.getInventoryByWarehouse(update.warehouseId);
          const match = invItems.find(i => i.inventory.productId === row.item.productId);
          if (match) {
            await db.updateInventoryQuantityById(
              match.inventory.id,
              parseFloat(row.item.newQuantity),
              ctx.user.id,
              `Biweekly update #${input.id}`
            );
          }
        }

        await createAuditLog(ctx.user.id, 'update', 'copacker_inventory_update', input.id, undefined, undefined, { status: 'submitted' });
        return { success: true };
      }),

    // --- Copacker Invoices ---

    getInvoices: copackerProcedure.query(async ({ ctx }) => {
      const warehouseId = ctx.user.role === 'copacker' ? ctx.user.linkedWarehouseId! : undefined;
      return db.getCopackerInvoices(warehouseId ?? undefined);
    }),

    getInvoiceDetail: copackerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const invoice = await db.getCopackerInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId && invoice.warehouseId !== ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const items = await db.getCopackerInvoiceItems(input.id);
        return { invoice, items };
      }),

    createInvoice: copackerProcedure
      .input(z.object({
        invoiceNumber: z.string().min(1),
        invoiceDate: z.string(),
        dueDate: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          totalAmount: z.string(),
        })),
        // Optional file upload
        fileName: z.string().optional(),
        fileData: z.string().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned' });
        }

        const warehouseId = ctx.user.linkedWarehouseId!;
        const { items, fileName, fileData, mimeType, ...invoiceData } = input;

        // Calculate totals
        const subtotal = items.reduce((sum, i) => sum + parseFloat(i.totalAmount), 0);
        const totalAmount = subtotal;

        let fileUrl: string | undefined;
        let fileKey: string | undefined;

        if (fileData && fileName && mimeType) {
          const buffer = Buffer.from(fileData, 'base64');
          fileKey = `copacker-invoices/${warehouseId}/${nanoid()}-${fileName}`;
          const uploaded = await storagePut(fileKey, buffer, mimeType);
          fileUrl = uploaded.url;
        }

        const result = await db.createCopackerInvoice({
          warehouseId,
          submittedBy: ctx.user.id,
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: new Date(invoiceData.invoiceDate),
          dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
          description: invoiceData.description,
          subtotal: subtotal.toFixed(2),
          taxAmount: "0",
          totalAmount: totalAmount.toFixed(2),
          status: 'submitted',
          fileUrl,
          fileKey,
          fileName,
          mimeType,
          notes: invoiceData.notes,
        });

        for (const item of items) {
          await db.createCopackerInvoiceItem({
            invoiceId: result.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
          });
        }

        await createAuditLog(ctx.user.id, 'create', 'copacker_invoice', result.id, invoiceData.invoiceNumber);
        return { id: result.id };
      }),

    // --- Copacker Shipping Documents ---

    getShippingDocuments: copackerProcedure.query(async ({ ctx }) => {
      const warehouseId = ctx.user.role === 'copacker' ? ctx.user.linkedWarehouseId! : undefined;
      return db.getCopackerShippingDocuments(warehouseId ?? undefined);
    }),

    uploadShippingDocument: copackerProcedure
      .input(z.object({
        shipmentId: z.number().optional(),
        documentType: z.enum([
          'bill_of_lading', 'packing_list', 'commercial_invoice', 'proof_of_delivery',
          'weight_certificate', 'inspection_report', 'customs_declaration', 'other'
        ]),
        name: z.string(),
        description: z.string().optional(),
        fileData: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned' });
        }

        const warehouseId = ctx.user.linkedWarehouseId!;
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `copacker-shipping/${warehouseId}/${nanoid()}-${input.name}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        const result = await db.createCopackerShippingDocument({
          warehouseId,
          shipmentId: input.shipmentId,
          uploadedBy: ctx.user.id,
          documentType: input.documentType,
          name: input.name,
          description: input.description,
          fileUrl: url,
          fileKey,
          fileSize: buffer.length,
          mimeType: input.mimeType,
          status: 'uploaded',
        });

        await createAuditLog(ctx.user.id, 'create', 'copacker_shipping_document', result.id, input.name);
        return { id: result.id, url };
      }),

    // Get current biweekly period info
    getCurrentPeriod: copackerProcedure.query(async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const day = now.getDate();

      // Biweekly periods: 1st-15th and 16th-end of month
      let periodStart: Date;
      let periodEnd: Date;

      if (day <= 15) {
        periodStart = new Date(year, month, 1);
        periodEnd = new Date(year, month, 15, 23, 59, 59);
      } else {
        periodStart = new Date(year, month, 16);
        periodEnd = new Date(year, month + 1, 0, 23, 59, 59); // last day of month
      }

      const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isDue = daysLeft <= 3;

      return {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        daysLeft,
        isDue,
        periodLabel: day <= 15
          ? `${periodStart.toLocaleDateString('en-US', { month: 'short' })} 1-15, ${year}`
          : `${periodStart.toLocaleDateString('en-US', { month: 'short' })} 16-${periodEnd.getDate()}, ${year}`,
      };
    }),
  }),

  // Vendor Portal - restricted views for vendors
  vendorPortal: router({
    // Get purchase orders for vendor
    getPurchaseOrders: vendorProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
        const allPOs = await db.getPurchaseOrders();
        return allPOs.filter(po => po.vendorId === ctx.user.linkedVendorId);
      }
      return db.getPurchaseOrders();
    }),

    // Get vendor's own info
    getVendorInfo: vendorProcedure.query(async ({ ctx }) => {
      if (!ctx.user.linkedVendorId) {
        return null;
      }
      return db.getVendorById(ctx.user.linkedVendorId);
    }),

    // Update PO status (vendor can mark as confirmed, partial, received)
    updatePOStatus: vendorProcedure
      .input(z.object({
        poId: z.number(),
        status: z.enum(['confirmed', 'partial', 'received']),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify vendor has access to this PO
        if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
          const allPOs = await db.getPurchaseOrders();
          const po = allPOs.find(p => p.id === input.poId);
          if (!po || po.vendorId !== ctx.user.linkedVendorId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this purchase order' });
          }
        }

        await db.updatePurchaseOrder(input.poId, { 
          status: input.status,
          notes: input.notes,
        });
        await createAuditLog(ctx.user.id, 'update', 'purchase_order', input.poId);
        return { success: true };
      }),

    // Get shipments for vendor
    getShipments: vendorProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
        const allShipments = await db.getShipments();
        // Filter shipments related to vendor's POs
        const vendorPOs = await db.getPurchaseOrders();
        const vendorPOIds = vendorPOs
          .filter(po => po.vendorId === ctx.user.linkedVendorId)
          .map(po => po.id);
        return allShipments.filter(s => s.purchaseOrderId && vendorPOIds.includes(s.purchaseOrderId));
      }
      return db.getShipments();
    }),

    // Upload document for vendor's shipment/PO
    uploadDocument: vendorProcedure
      .input(z.object({
        relatedEntityType: z.enum(['purchase_order', 'shipment']),
        relatedEntityId: z.number(),
        documentType: z.enum(['invoice', 'receipt', 'contract', 'legal', 'report', 'hr', 'other']),
        name: z.string(),
        fileData: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify vendor has access
        if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
          if (input.relatedEntityType === 'purchase_order') {
            const allPOs = await db.getPurchaseOrders();
            const po = allPOs.find(p => p.id === input.relatedEntityId);
            if (!po || po.vendorId !== ctx.user.linkedVendorId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this purchase order' });
            }
          }
        }

        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `vendor/${ctx.user.linkedVendorId || 'unknown'}/${input.relatedEntityType}/${input.relatedEntityId}/${nanoid()}-${input.name}`;
        
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        const result = await db.createDocument({
          name: input.name,
          type: input.documentType,
          category: input.relatedEntityType === 'purchase_order' ? 'legal' : 'other',
          fileUrl: url,
          fileKey,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          referenceType: input.relatedEntityType,
          referenceId: input.relatedEntityId,
        });

        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);
        
        return { id: result.id, url };
      }),
  }),

  // ============================================
  // BILL OF MATERIALS (BOM) MODULE
  // ============================================
  bom: router({
    // List all BOMs
    list: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getBillOfMaterials(input);
      }),

    // Get single BOM with components
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const bom = await db.getBomById(input.id);
        if (!bom) return null;
        const components = await db.getBomComponents(input.id);
        const history = await db.getBomVersionHistory(input.id);
        // Get product info
        const product = await db.getProductById(bom.productId);
        return { ...bom, components, history, product };
      }),

    // Create new BOM
    create: protectedProcedure
      .input(z.object({
        productId: z.number(),
        name: z.string(),
        version: z.string().optional(),
        batchSize: z.string().optional(),
        batchUnit: z.string().optional(),
        laborCost: z.string().optional(),
        overheadCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createBom({
          ...input,
          createdBy: ctx.user.id,
          status: 'draft',
        });
        // Create version history entry
        await db.createBomVersionHistory({
          bomId: result.id,
          version: input.version || '1.0',
          changeType: 'created',
          changeDescription: 'Initial creation',
          changedBy: ctx.user.id,
        });
        return result;
      }),

    // Update BOM
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        version: z.string().optional(),
        status: z.enum(['draft', 'active', 'obsolete']).optional(),
        batchSize: z.string().optional(),
        batchUnit: z.string().optional(),
        laborCost: z.string().optional(),
        overheadCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const oldBom = await db.getBomById(id);
        await db.updateBom(id, data);
        
        // Track status changes
        if (input.status && oldBom?.status !== input.status) {
          await db.createBomVersionHistory({
            bomId: id,
            version: input.version || oldBom?.version || '1.0',
            changeType: input.status === 'active' ? 'activated' : input.status === 'obsolete' ? 'obsoleted' : 'updated',
            changeDescription: `Status changed from ${oldBom?.status} to ${input.status}`,
            changedBy: ctx.user.id,
          });
        }
        return { success: true };
      }),

    // Delete BOM
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteBom(input.id);
        return { success: true };
      }),

    // Calculate costs
    calculateCosts: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.calculateBomCosts(input.id);
      }),

    // Add component
    addComponent: protectedProcedure
      .input(z.object({
        bomId: z.number(),
        componentType: z.enum(['product', 'raw_material', 'packaging', 'labor']),
        productId: z.number().optional(),
        rawMaterialId: z.number().optional(),
        name: z.string(),
        sku: z.string().optional(),
        quantity: z.string(),
        unit: z.string(),
        wastagePercent: z.string().optional(),
        unitCost: z.string().optional(),
        leadTimeDays: z.number().optional(),
        isOptional: z.boolean().optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await db.createBomComponent(input);
        // Recalculate BOM costs
        await db.calculateBomCosts(input.bomId);
        return result;
      }),

    // Update component
    updateComponent: protectedProcedure
      .input(z.object({
        id: z.number(),
        bomId: z.number(),
        name: z.string().optional(),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        wastagePercent: z.string().optional(),
        unitCost: z.string().optional(),
        leadTimeDays: z.number().optional(),
        isOptional: z.boolean().optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, bomId, ...data } = input;
        await db.updateBomComponent(id, data);
        // Recalculate BOM costs
        await db.calculateBomCosts(bomId);
        return { success: true };
      }),

    // Delete component
    deleteComponent: protectedProcedure
      .input(z.object({ id: z.number(), bomId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteBomComponent(input.id);
        // Recalculate BOM costs
        await db.calculateBomCosts(input.bomId);
        return { success: true };
      }),
  }),

  // Raw Materials
  rawMaterials: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        category: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRawMaterials(input);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRawMaterialById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        sku: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string(),
        unitCost: z.string().optional(),
        currency: z.string().optional(),
        minOrderQty: z.string().optional(),
        leadTimeDays: z.number().optional(),
        preferredVendorId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.createRawMaterial(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        sku: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
        unitCost: z.string().optional(),
        currency: z.string().optional(),
        minOrderQty: z.string().optional(),
        leadTimeDays: z.number().optional(),
        preferredVendorId: z.number().optional(),
        status: z.enum(['active', 'inactive', 'discontinued']).optional(),
        receivingStatus: z.enum(['none', 'ordered', 'in_transit', 'received', 'inspected']).optional(),
        quantityOnOrder: z.string().optional(),
        quantityInTransit: z.string().optional(),
        quantityReceived: z.string().optional(),
        expectedDeliveryDate: z.date().optional(),
        lastReceivedDate: z.date().optional(),
        lastReceivedQty: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateRawMaterial(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteRawMaterial(input.id);
        return { success: true };
      }),

    // Get preferred vendor for a material based on PO history
    getPreferredVendor: protectedProcedure
      .input(z.object({ 
        materialName: z.string().optional(),
        materialId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        // First, find the material
        let material = null;
        if (input.materialId) {
          material = await db.getRawMaterialById(input.materialId);
        } else if (input.materialName) {
          const allMaterials = await db.getRawMaterials();
          material = allMaterials.find(m => 
            m.name?.toLowerCase().includes(input.materialName!.toLowerCase()) ||
            m.sku?.toLowerCase() === input.materialName!.toLowerCase()
          ) || null;
        }
        
        if (!material) {
          return { material: null, preferredVendor: null, recentPOs: [], suggestion: null };
        }
        
        // Check if material has a preferred vendor set
        let preferredVendor = null;
        if (material.preferredVendorId) {
          preferredVendor = await db.getVendorById(material.preferredVendorId);
        }
        
        // Get recent POs for this material to find most used vendor
        const allPOs = await db.getPurchaseOrders({});
        
        // Get all PO items by fetching items for each PO
        const allPOItems: Array<{
          id: number;
          purchaseOrderId: number;
          description: string;
          unitPrice: string;
          totalAmount: string;
        }> = [];
        
        for (const po of allPOs) {
          const items = await db.getPurchaseOrderItems(po.id);
          allPOItems.push(...items);
        }
        
        // Find PO items that reference this material (using purchaseOrderId and description)
        const materialPOItems = allPOItems.filter(item => 
          item.description?.toLowerCase().includes(material!.name?.toLowerCase() || '')
        );
        
        // Count vendors by frequency and recency
        const vendorStats: Record<number, { count: number; lastDate: Date | null; totalValue: number }> = {};
        
        for (const item of materialPOItems) {
          const po = allPOs.find(p => p.id === item.purchaseOrderId);
          if (po && po.vendorId) {
            if (!vendorStats[po.vendorId]) {
              vendorStats[po.vendorId] = { count: 0, lastDate: null, totalValue: 0 };
            }
            vendorStats[po.vendorId].count++;
            vendorStats[po.vendorId].totalValue += parseFloat(item.totalAmount || '0');
            const poDate = po.orderDate ? new Date(po.orderDate) : null;
            if (poDate && (!vendorStats[po.vendorId].lastDate || poDate > vendorStats[po.vendorId].lastDate!)) {
              vendorStats[po.vendorId].lastDate = poDate;
            }
          }
        }
        
        // Find the best vendor (most frequent, with recency as tiebreaker)
        let suggestedVendorId: number | null = null;
        let maxScore = 0;
        
        for (const [vendorId, stats] of Object.entries(vendorStats)) {
          // Score = count * 10 + recency bonus (up to 5 points for orders in last 90 days)
          const recencyBonus = stats.lastDate 
            ? Math.max(0, 5 - Math.floor((Date.now() - stats.lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30)))
            : 0;
          const score = stats.count * 10 + recencyBonus;
          
          if (score > maxScore) {
            maxScore = score;
            suggestedVendorId = parseInt(vendorId);
          }
        }
        
        // Get suggested vendor details
        let suggestedVendor = null;
        if (suggestedVendorId) {
          suggestedVendor = await db.getVendorById(suggestedVendorId);
        }
        
        // Get recent POs for context
        const recentPOs = allPOs
          .filter(po => materialPOItems.some(item => item.purchaseOrderId === po.id))
          .sort((a, b) => {
            const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
            const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
            return dateB - dateA;
          })
          .slice(0, 5);
        
        // Get last purchase price
        const lastPOItem = materialPOItems
          .sort((a, b) => {
            const poA = allPOs.find(p => p.id === a.purchaseOrderId);
            const poB = allPOs.find(p => p.id === b.purchaseOrderId);
            const dateA = poA?.orderDate ? new Date(poA.orderDate).getTime() : 0;
            const dateB = poB?.orderDate ? new Date(poB.orderDate).getTime() : 0;
            return dateB - dateA;
          })[0];
        
        return {
          material: {
            id: material.id,
            name: material.name,
            sku: material.sku,
            unit: material.unit,
            unitCost: material.unitCost,
          },
          preferredVendor: preferredVendor ? {
            id: preferredVendor.id,
            name: preferredVendor.name,
            email: preferredVendor.email,
          } : null,
          suggestedVendor: suggestedVendor ? {
            id: suggestedVendor.id,
            name: suggestedVendor.name,
            email: suggestedVendor.email,
            poCount: vendorStats[suggestedVendor.id]?.count || 0,
            lastOrderDate: vendorStats[suggestedVendor.id]?.lastDate || null,
          } : null,
          lastPurchasePrice: lastPOItem?.unitPrice || material.unitCost || null,
          recentPOCount: materialPOItems.length,
        };
      }),
  }),

  // Work Orders
  workOrders: router({
    list: protectedProcedure.query(async () => {
      return db.getWorkOrders();
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getWorkOrderById(input.id);
      }),
    create: protectedProcedure
      .input(z.object({
        bomId: z.number(),
        productId: z.number(),
        warehouseId: z.number().optional(),
        quantity: z.string(),
        unit: z.string().default('EA'),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
        scheduledStartDate: z.date().optional(),
        scheduledEndDate: z.date().optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWorkOrder({ ...input, createdBy: ctx.user?.id });
        // Auto-generate material requirements from BOM
        await db.generateWorkOrderMaterialsFromBom(result.id, input.bomId, parseFloat(input.quantity));
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
        quantity: z.string().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        scheduledStartDate: z.date().optional(),
        scheduledEndDate: z.date().optional(),
        actualStartDate: z.date().optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateWorkOrder(id, data);
        return { success: true };
      }),
    getMaterials: protectedProcedure
      .input(z.object({ workOrderId: z.number() }))
      .query(async ({ input }) => {
        return db.getWorkOrderMaterials(input.workOrderId);
      }),
    startProduction: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateWorkOrder(input.id, { status: 'in_progress', actualStartDate: new Date() });
        return { success: true };
      }),
    completeProduction: protectedProcedure
      .input(z.object({ 
        id: z.number(), 
        completedQuantity: z.string(),
        warehouseId: z.number().optional(),
        yieldPercent: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        // Get work order details
        const workOrder = await db.getWorkOrderById(input.id);
        if (!workOrder) throw new Error("Work order not found");
        
        // Consume materials
        await db.consumeWorkOrderMaterials(input.id, ctx.user?.id);
        
        // Create finished goods lot output
        const completedQty = parseFloat(input.completedQuantity);
        const plannedQty = parseFloat(workOrder.quantity);
        const yieldPercent = input.yieldPercent || (completedQty / plannedQty * 100);
        
        // Get BOM to find output product
        const bom = await db.getBomById(workOrder.bomId);
        if (bom && bom.productId) {
          const outputWarehouse = input.warehouseId || workOrder.warehouseId;
          if (outputWarehouse) {
            const { lotId, lotCode } = await db.createWorkOrderOutput(
              input.id,
              bom.productId,
              completedQty,
              outputWarehouse,
              yieldPercent,
              ctx.user?.id
            );
            
            // Create audit log
            await db.createAuditLog({
              entityType: 'work_order',
              entityId: input.id,
              action: 'update',
              newValues: { 
                event: 'production_completed',
                completedQuantity: input.completedQuantity, 
                yieldPercent, 
                outputLotId: lotId, 
                outputLotCode: lotCode 
              },
              userId: ctx.user?.id
            });
          }
        }
        
        // Update work order status
        await db.updateWorkOrder(input.id, { 
          completedQuantity: input.completedQuantity,
          status: 'completed',
          actualEndDate: new Date()
        });
        
        // Create notification for work order completion
        const allUsers = await db.getAllUsers();
        const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
        
        await db.notifyUsersOfEvent({
          type: 'work_order_completed',
          title: `Work Order ${workOrder.workOrderNumber} Completed`,
          message: `Work Order ${workOrder.workOrderNumber} completed with ${completedQty} units (${yieldPercent.toFixed(1)}% yield)`,
          entityType: 'work_order',
          entityId: input.id,
          severity: yieldPercent < 90 ? 'warning' : 'info',
          link: `/operations/work-orders`,
          metadata: { completedQuantity: completedQty, yieldPercent },
        }, opsUsers.map(u => u.id));
        
        return { success: true };
      }),
  }),

  // Raw Material Inventory
  rawMaterialInventory: router({
    list: protectedProcedure
      .input(z.object({
        rawMaterialId: z.number().optional(),
        warehouseId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRawMaterialInventory(input);
      }),
    getTransactions: protectedProcedure
      .input(z.object({ rawMaterialId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getRawMaterialTransactions(input.rawMaterialId, input.limit);
      }),
    adjust: protectedProcedure
      .input(z.object({
        rawMaterialId: z.number(),
        warehouseId: z.number(),
        quantity: z.number(),
        unit: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getRawMaterialInventoryByLocation(input.rawMaterialId, input.warehouseId);
        const currentQty = parseFloat(current?.quantity?.toString() || '0');
        const newQty = currentQty + input.quantity;
        
        await db.upsertRawMaterialInventory(input.rawMaterialId, input.warehouseId, {
          quantity: newQty.toFixed(4),
          availableQuantity: newQty.toFixed(4),
          unit: input.unit,
        });
        
        await db.createRawMaterialTransaction({
          rawMaterialId: input.rawMaterialId,
          warehouseId: input.warehouseId,
          transactionType: 'adjust',
          quantity: input.quantity.toFixed(4),
          previousQuantity: currentQty.toFixed(4),
          newQuantity: newQty.toFixed(4),
          unit: input.unit,
          notes: input.notes,
          performedBy: ctx.user?.id,
        });
        
        return { success: true };
      }),
  }),

  // PO Receiving
  poReceiving: router({
    getRecords: protectedProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(async ({ input }) => {
        return db.getPoReceivingRecords(input.purchaseOrderId);
      }),
    getItems: protectedProcedure
      .input(z.object({ receivingRecordId: z.number() }))
      .query(async ({ input }) => {
        return db.getPoReceivingItems(input.receivingRecordId);
      }),
    receive: protectedProcedure
      .input(z.object({
        purchaseOrderId: z.number(),
        warehouseId: z.number(),
        shipmentId: z.number().optional(),
        items: z.array(z.object({
          purchaseOrderItemId: z.number(),
          rawMaterialId: z.number().optional(),
          productId: z.number().optional(),
          quantity: z.number(),
          unit: z.string(),
          lotNumber: z.string().optional(),
          expirationDate: z.date().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.receivePurchaseOrderItems(
          input.purchaseOrderId,
          input.warehouseId,
          input.items,
          ctx.user?.id,
          input.shipmentId
        );
        return result;
      }),
  }),

  // ============================================
  // AI PRODUCTION FORECASTING
  // ============================================
  forecasting: router({
    // Get demand forecasts
    getForecasts: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getDemandForecasts(input);
      }),

    // Get single forecast
    getForecast: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getDemandForecastById(input.id);
      }),

    // Generate AI forecast for products
    generateForecast: protectedProcedure
      .input(z.object({
        productIds: z.array(z.number()).optional(), // If empty, forecast all products
        forecastMonths: z.number().default(3), // How many months ahead to forecast
        historyMonths: z.number().default(12), // How many months of history to analyze
      }))
      .mutation(async ({ input, ctx }) => {
        const { invokeLLM } = await import('./_core/llm');
        
        // Get products to forecast
        let productsToForecast = await db.getProducts();
        if (input.productIds && input.productIds.length > 0) {
          productsToForecast = productsToForecast.filter(p => input.productIds!.includes(p.id));
        }
        
        // Get historical sales data
        const historicalData = await db.getHistoricalSalesData(undefined, input.historyMonths);
        
        // Group by product and month
        const salesByProductMonth: Record<number, Record<string, number>> = {};
        for (const sale of historicalData) {
          if (!sale.productId) continue;
          if (!salesByProductMonth[sale.productId]) salesByProductMonth[sale.productId] = {};
          const monthKey = sale.orderDate ? new Date(sale.orderDate).toISOString().slice(0, 7) : 'unknown';
          salesByProductMonth[sale.productId][monthKey] = (salesByProductMonth[sale.productId][monthKey] || 0) + parseFloat(sale.quantity?.toString() || '0');
        }
        
        const forecasts = [];
        
        for (const product of productsToForecast) {
          const productSales = salesByProductMonth[product.id] || {};
          const salesHistory = Object.entries(productSales)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, qty]) => ({ month, quantity: qty }));
          
          // Use AI to analyze and forecast
          const prompt = `You are a demand forecasting AI for an ERP system. Analyze the following sales history for product "${product.name}" and predict demand for the next ${input.forecastMonths} months.

Historical Sales Data:
${salesHistory.length > 0 ? salesHistory.map(s => `${s.month}: ${s.quantity} units`).join('\n') : 'No historical data available - use reasonable estimates based on product type'}

Product Details:
- Name: ${product.name}
- SKU: ${product.sku || 'N/A'}
- Category: ${product.category || 'General'}
- Current Price: $${product.unitPrice || 0}

Provide your forecast in JSON format with the following structure:
{
  "forecastedQuantity": <total units for forecast period>,
  "confidenceLevel": <0-100 percentage>,
  "trendDirection": "up" | "down" | "stable",
  "analysis": "<brief explanation of your forecast reasoning>",
  "monthlyBreakdown": [{ "month": "YYYY-MM", "quantity": <number> }]
}`;

          try {
            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are an expert demand forecasting analyst. Always respond with valid JSON.' },
                { role: 'user', content: prompt }
              ],
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'demand_forecast',
                  strict: true,
                  schema: {
                    type: 'object',
                    properties: {
                      forecastedQuantity: { type: 'number' },
                      confidenceLevel: { type: 'number' },
                      trendDirection: { type: 'string', enum: ['up', 'down', 'stable'] },
                      analysis: { type: 'string' },
                      monthlyBreakdown: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            month: { type: 'string' },
                            quantity: { type: 'number' }
                          },
                          required: ['month', 'quantity'],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ['forecastedQuantity', 'confidenceLevel', 'trendDirection', 'analysis', 'monthlyBreakdown'],
                    additionalProperties: false
                  }
                }
              }
            });
            
            const content = response.choices[0]?.message?.content;
            const forecastData = typeof content === 'string' ? JSON.parse(content) : null;
            
            if (forecastData) {
              const now = new Date();
              const periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
              const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1 + input.forecastMonths, 0);
              
              const result = await db.createDemandForecast({
                productId: product.id,
                forecastDate: now,
                forecastPeriodStart: periodStart,
                forecastPeriodEnd: periodEnd,
                forecastedQuantity: forecastData.forecastedQuantity.toString(),
                confidenceLevel: forecastData.confidenceLevel.toString(),
                forecastMethod: 'ai_trend',
                dataPointsUsed: salesHistory.length,
                aiAnalysis: forecastData.analysis,
                trendDirection: forecastData.trendDirection,
                status: 'active',
                createdBy: ctx.user?.id,
              });
              
              forecasts.push({ productId: product.id, productName: product.name, ...result, ...forecastData });
            }
          } catch (error) {
            console.error(`Forecast error for product ${product.id}:`, error);
            // Create a basic forecast even if AI fails
            const avgSales = salesHistory.length > 0 
              ? salesHistory.reduce((sum, s) => sum + s.quantity, 0) / salesHistory.length 
              : 100;
            
            const now = new Date();
            const periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1 + input.forecastMonths, 0);
            
            const result = await db.createDemandForecast({
              productId: product.id,
              forecastDate: now,
              forecastPeriodStart: periodStart,
              forecastPeriodEnd: periodEnd,
              forecastedQuantity: (avgSales * input.forecastMonths).toFixed(0),
              confidenceLevel: '50',
              forecastMethod: 'historical_avg',
              dataPointsUsed: salesHistory.length,
              aiAnalysis: 'Forecast based on historical average (AI analysis unavailable)',
              trendDirection: 'stable',
              status: 'active',
              createdBy: ctx.user?.id,
            });
            
            forecasts.push({ productId: product.id, productName: product.name, ...result });
          }
        }
        
        return { forecasts, count: forecasts.length };
      }),

    // Get production plans
    getProductionPlans: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getProductionPlans(input);
      }),

    // Generate production plan from forecast
    generateProductionPlan: protectedProcedure
      .input(z.object({
        demandForecastId: z.number(),
        safetyStockPercent: z.number().default(20), // Add 20% safety stock
      }))
      .mutation(async ({ input, ctx }) => {
        const forecast = await db.getDemandForecastById(input.demandForecastId);
        if (!forecast) throw new Error('Forecast not found');
        
        const product = forecast.productId ? await db.getProductById(forecast.productId) : null;
        if (!product) throw new Error('Product not found');
        
        // Get current inventory
        const inventoryRecords = await db.getInventory({ productId: product.id });
        const currentInventory = inventoryRecords.reduce((sum, inv) => sum + parseFloat(inv.quantity?.toString() || '0'), 0);
        
        // Calculate production needed
        const forecastedQty = parseFloat(forecast.forecastedQuantity?.toString() || '0');
        const safetyStock = forecastedQty * (input.safetyStockPercent / 100);
        const plannedQuantity = Math.max(0, forecastedQty + safetyStock - currentInventory);
        
        // Get BOM for this product
        const boms = await db.getBillOfMaterials({ productId: product.id });
        const bom = boms[0];
        
        // Create production plan
        const plan = await db.createProductionPlan({
          demandForecastId: forecast.id,
          productId: product.id,
          bomId: bom?.id,
          plannedQuantity: plannedQuantity.toFixed(0),
          unit: 'EA',
          plannedStartDate: forecast.forecastPeriodStart || undefined,
          plannedEndDate: forecast.forecastPeriodEnd || undefined,
          currentInventory: currentInventory.toFixed(0),
          safetyStock: safetyStock.toFixed(0),
          status: 'draft',
          createdBy: ctx.user?.id,
        });
        
        // If we have a BOM, calculate material requirements
        if (bom) {
          const components = await db.getBomComponents(bom.id);
          
          for (const comp of components) {
            if (!comp.rawMaterialId) continue;
            
            const requiredQty = parseFloat(comp.quantity?.toString() || '0') * plannedQuantity;
            
            // Get current raw material inventory
            const rmInventory = await db.getRawMaterialInventory({ rawMaterialId: comp.rawMaterialId });
            const currentRmQty = rmInventory.reduce((sum, inv) => sum + parseFloat(inv.quantity?.toString() || '0'), 0);
            
            // Get pending orders
            const pendingOrders = await db.getPendingOrdersForMaterial(comp.rawMaterialId);
            const onOrderQty = pendingOrders.reduce((sum, po) => {
              const ordered = parseFloat(po.quantity?.toString() || '0');
              const received = parseFloat(po.receivedQuantity?.toString() || '0');
              return sum + (ordered - received);
            }, 0);
            
            const shortageQty = Math.max(0, requiredQty - currentRmQty - onOrderQty);
            
            // Get preferred vendor and estimated cost
            const vendor = await db.getPreferredVendorForMaterial(comp.rawMaterialId);
            const rawMaterial = await db.getRawMaterialById(comp.rawMaterialId);
            const unitCost = parseFloat(rawMaterial?.unitCost?.toString() || '0');
            
            await db.createMaterialRequirement({
              productionPlanId: plan.id,
              rawMaterialId: comp.rawMaterialId,
              requiredQuantity: requiredQty.toFixed(4),
              unit: comp.unit || 'KG',
              currentInventory: currentRmQty.toFixed(4),
              onOrderQuantity: onOrderQty.toFixed(4),
              shortageQuantity: shortageQty.toFixed(4),
              suggestedOrderQuantity: (shortageQty * 1.1).toFixed(4), // Add 10% buffer
              preferredVendorId: vendor?.id,
              estimatedUnitCost: unitCost.toFixed(4),
              estimatedTotalCost: (shortageQty * 1.1 * unitCost).toFixed(2),
              leadTimeDays: 14, // Default lead time
              status: 'pending',
            });
          }
        }
        
        return plan;
      }),

    // Get material requirements for a plan
    getMaterialRequirements: protectedProcedure
      .input(z.object({ productionPlanId: z.number() }))
      .query(async ({ input }) => {
        return db.getMaterialRequirements(input.productionPlanId);
      }),

    // Get suggested purchase orders
    getSuggestedPOs: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSuggestedPurchaseOrders(input);
      }),

    // Get suggested PO details
    getSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const po = await db.getSuggestedPurchaseOrderById(input.id);
        const items = await db.getSuggestedPoItems(input.id);
        return { ...po, items };
      }),

    // Generate suggested POs from production plan
    generateSuggestedPOs: protectedProcedure
      .input(z.object({ productionPlanId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const plan = await db.getProductionPlanById(input.productionPlanId);
        if (!plan) throw new Error('Production plan not found');
        
        const requirements = await db.getMaterialRequirements(input.productionPlanId);
        const shortages = requirements.filter(r => parseFloat(r.shortageQuantity?.toString() || '0') > 0);
        
        if (shortages.length === 0) {
          return { suggestedPOs: [], message: 'No material shortages - no POs needed' };
        }
        
        // Group by vendor
        const byVendor: Record<number, typeof shortages> = {};
        for (const shortage of shortages) {
          const vendorId = shortage.preferredVendorId || 0;
          if (!byVendor[vendorId]) byVendor[vendorId] = [];
          byVendor[vendorId].push(shortage);
        }
        
        const suggestedPOs = [];
        const now = new Date();
        const requiredByDate = plan.plannedStartDate ? new Date(plan.plannedStartDate) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
        
        for (const [vendorIdStr, items] of Object.entries(byVendor)) {
          const vendorId = parseInt(vendorIdStr);
          if (vendorId === 0) continue; // Skip items without vendor
          
          // Get vendor details including lead time
          const vendor = await db.getVendorById(vendorId);
          const vendorLeadTimeDays = vendor?.defaultLeadTimeDays || 14; // Default 14 days if not set
          
          // Calculate delivery dates based on lead time
          const estimatedDeliveryDate = new Date(now.getTime() + vendorLeadTimeDays * 24 * 60 * 60 * 1000);
          const daysUntilRequired = Math.ceil((requiredByDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          const isUrgent = vendorLeadTimeDays > daysUntilRequired;
          
          // Calculate latest order date (required date minus lead time)
          const latestOrderDate = new Date(requiredByDate.getTime() - vendorLeadTimeDays * 24 * 60 * 60 * 1000);
          const suggestedOrderDate = latestOrderDate < now ? now : latestOrderDate;
          
          const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.estimatedTotalCost?.toString() || '0'), 0);
          
          // Calculate priority based on lead time urgency and shortage severity
          const avgShortageRatio = items.reduce((sum, item) => {
            const required = parseFloat(item.requiredQuantity?.toString() || '1');
            const shortage = parseFloat(item.shortageQuantity?.toString() || '0');
            return sum + (shortage / required);
          }, 0) / items.length;
          
          // Boost priority if urgent (lead time exceeds available time)
          let priorityScore = Math.round(avgShortageRatio * 70); // Base score from shortage
          if (isUrgent) {
            priorityScore += 30; // Urgent boost
          } else if (daysUntilRequired - vendorLeadTimeDays < 7) {
            priorityScore += 15; // Near-urgent boost
          }
          priorityScore = Math.min(100, priorityScore);
          
          // Use AI to generate rationale including lead time info
          const { invokeLLM } = await import('./_core/llm');
          let aiRationale = '';
          try {
            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are an ERP procurement assistant. Provide brief, professional rationale for purchase orders.' },
                { role: 'user', content: `Generate a brief rationale (2-3 sentences) for this suggested purchase order:
- Vendor: ${vendor?.name || 'Unknown'}
- Vendor Lead Time: ${vendorLeadTimeDays} days
- Items: ${items.length} raw materials
- Total Amount: $${totalAmount.toFixed(2)}
- Required By: ${requiredByDate.toLocaleDateString()}
- Days Until Required: ${daysUntilRequired}
- Is Urgent: ${isUrgent ? 'YES - Lead time exceeds available time!' : 'No'}
- Estimated Delivery: ${estimatedDeliveryDate.toLocaleDateString()}
- Priority Score: ${priorityScore}/100
- Materials needed for production plan ${plan.planNumber}` }
              ]
            });
            aiRationale = typeof response.choices[0]?.message?.content === 'string' 
              ? response.choices[0].message.content 
              : 'Purchase order suggested based on production requirements and inventory analysis.';
          } catch {
            aiRationale = isUrgent 
              ? `URGENT: Lead time (${vendorLeadTimeDays} days) exceeds available time (${daysUntilRequired} days). Order immediately to minimize production delays.`
              : `Purchase order suggested based on production requirements. Vendor lead time: ${vendorLeadTimeDays} days. Order by ${latestOrderDate.toLocaleDateString()} for on-time delivery.`;
          }
          
          const suggestedPo = await db.createSuggestedPurchaseOrder({
            vendorId,
            productionPlanId: plan.id,
            totalAmount: totalAmount.toFixed(2),
            currency: 'USD',
            suggestedOrderDate,
            requiredByDate,
            estimatedDeliveryDate,
            vendorLeadTimeDays,
            daysUntilRequired,
            isUrgent,
            aiRationale,
            priorityScore,
            status: 'pending',
          });
          
          // Create line items and update material requirements with lead time info
          for (const item of items) {
            const rawMaterial = await db.getRawMaterialById(item.rawMaterialId);
            // Use material-specific lead time if available, otherwise vendor default
            const materialLeadTime = rawMaterial?.leadTimeDays || vendorLeadTimeDays;
            const materialDeliveryDate = new Date(now.getTime() + materialLeadTime * 24 * 60 * 60 * 1000);
            const materialLatestOrderDate = new Date(requiredByDate.getTime() - materialLeadTime * 24 * 60 * 60 * 1000);
            const materialIsUrgent = materialLeadTime > daysUntilRequired;
            
            // Update material requirement with lead time calculations
            await db.updateMaterialRequirement(item.id, {
              leadTimeDays: materialLeadTime,
              requiredByDate,
              latestOrderDate: materialLatestOrderDate,
              estimatedDeliveryDate: materialDeliveryDate,
              isUrgent: materialIsUrgent,
            });
            
            await db.createSuggestedPoItem({
              suggestedPoId: suggestedPo.id,
              materialRequirementId: item.id,
              rawMaterialId: item.rawMaterialId,
              description: rawMaterial?.name || 'Raw Material',
              quantity: item.suggestedOrderQuantity || '0',
              unit: item.unit || 'KG',
              unitPrice: item.estimatedUnitCost || '0',
              totalAmount: item.estimatedTotalCost || '0',
            });
          }
          
          suggestedPOs.push({
            ...suggestedPo,
            vendorName: vendor?.name,
            vendorLeadTimeDays,
            estimatedDeliveryDate,
            isUrgent,
            daysUntilRequired,
          });
        }
        
        return { suggestedPOs, count: suggestedPOs.length };
      }),

    // One-click approve suggested PO (convert to actual PO)
    approveSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.convertSuggestedPoToActualPo(input.id, ctx.user?.id || 0);
        return result;
      }),

    // Reject suggested PO
    rejectSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateSuggestedPurchaseOrder(input.id, {
          status: 'rejected',
          rejectedBy: ctx.user?.id,
          rejectedAt: new Date(),
          rejectionReason: input.reason,
        });
        return { success: true };
      }),

    // Get forecasting dashboard summary
    getDashboardSummary: protectedProcedure.query(async () => {
      const activeForecasts = await db.getDemandForecasts({ status: 'active' });
      const pendingPlans = await db.getProductionPlans({ status: 'draft' });
      const pendingSuggestedPOs = await db.getSuggestedPurchaseOrders({ status: 'pending' });
      
      const totalForecastedDemand = activeForecasts.reduce((sum, f) => sum + parseFloat(f.forecastedQuantity?.toString() || '0'), 0);
      const totalPendingPOValue = pendingSuggestedPOs.reduce((sum, po) => sum + parseFloat(po.totalAmount?.toString() || '0'), 0);
      
      return {
        activeForecasts: activeForecasts.length,
        pendingPlans: pendingPlans.length,
        pendingSuggestedPOs: pendingSuggestedPOs.length,
        totalForecastedDemand,
        totalPendingPOValue,
        forecasts: activeForecasts.slice(0, 5),
        suggestedPOs: pendingSuggestedPOs.slice(0, 5),
      };
    }),
  }),

  // ============================================
  // ALERT SYSTEM
  // ============================================
  alerts: router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(['low_stock', 'shortage', 'late_shipment', 'yield_variance', 'reconciliation_variance', 'expiring_lot', 'other']).optional(),
        status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAlerts(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getAlertById(input.id);
      }),
    acknowledge: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.acknowledgeAlert(input.id, ctx.user!.id);
        return { success: true };
      }),
    resolve: protectedProcedure
      .input(z.object({ id: z.number(), notes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.resolveAlert(input.id, ctx.user!.id, input.notes);
        return { success: true };
      }),
    dismiss: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateAlert(input.id, { status: 'dismissed' });
        return { success: true };
      }),
    generateLowStockAlerts: protectedProcedure
      .mutation(async () => {
        const alertIds = await db.generateLowStockAlerts();
        return { created: alertIds.length, alertIds };
      }),
    create: protectedProcedure
      .input(z.object({
        type: z.enum(['low_stock', 'shortage', 'late_shipment', 'yield_variance', 'reconciliation_variance', 'expiring_lot', 'quality_issue', 'po_overdue']),
        severity: z.enum(['info', 'warning', 'critical']),
        title: z.string(),
        description: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.number().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.createAlert(input);
      }),
  }),

  // Recommendations
  recommendations: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
        type: z.enum(['reorder', 'production', 'pricing', 'allocation', 'other']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecommendations(input);
      }),
    approve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.approveRecommendation(input.id, ctx.user!.id);
        return { success: true };
      }),
    reject: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.rejectRecommendation(input.id, ctx.user!.id, input.reason);
        return { success: true };
      }),
  }),

  // ============================================
  // VENDOR QUOTE MANAGEMENT (RFQ System)
  // ============================================
  vendorQuotes: router({
    // Dashboard stats
    dashboardStats: protectedProcedure.query(async () => {
      const rfqs = await db.getVendorRfqs();
      const quotes = await db.getVendorQuotes();
      return {
        totalRfqs: rfqs.length,
        activeRfqs: rfqs.filter(r => ['sent', 'partially_received'].includes(r.status)).length,
        totalQuotes: quotes.length,
        pendingQuotes: quotes.filter(q => q.status === 'pending').length,
        receivedQuotes: quotes.filter(q => q.status === 'received').length,
      };
    }),
    
    // RFQs
    rfqs: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional(), rawMaterialId: z.number().optional() }).optional())
        .query(({ input }) => db.getVendorRfqs(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getVendorRfqById(input.id)),
      create: opsProcedure
        .input(z.object({
          materialName: z.string().min(1),
          rawMaterialId: z.number().optional(),
          materialDescription: z.string().optional(),
          quantity: z.string(),
          unit: z.string(),
          specifications: z.string().optional(),
          requiredDeliveryDate: z.date().optional(),
          deliveryLocation: z.string().optional(),
          deliveryAddress: z.string().optional(),
          incoterms: z.string().optional(),
          quoteDueDate: z.date().optional(),
          validityPeriod: z.number().optional(),
          priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfqNumber = await db.generateVendorRfqNumber();
          const result = await db.createVendorRfq({ ...input, rfqNumber, createdById: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'vendor_rfq', result.id, rfqNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['draft', 'sent', 'partially_received', 'all_received', 'awarded', 'cancelled', 'expired']).optional(),
          materialName: z.string().optional(),
          materialDescription: z.string().optional(),
          quantity: z.string().optional(),
          specifications: z.string().optional(),
          requiredDeliveryDate: z.date().optional(),
          quoteDueDate: z.date().optional(),
          notes: z.string().optional(),
          internalNotes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateVendorRfq(id, data);
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', id);
          return { success: true };
        }),
      
      // Send RFQ to vendors via AI email
      sendToVendors: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          vendorIds: z.array(z.number()),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });
          
          const results = { sent: 0, failed: 0, emails: [] as any[] };
          
          for (const vendorId of input.vendorIds) {
            const vendor = await db.getVendorById(vendorId);
            if (!vendor || !vendor.email) {
              results.failed++;
              continue;
            }
            
            // Create invitation record
            await db.createVendorRfqInvitation({
              rfqId: input.rfqId,
              vendorId,
              status: 'pending',
              invitedAt: new Date(),
            });
            
            // Generate AI email content
            const emailPrompt = `Generate a professional Request for Quote (RFQ) email to a vendor for the following material:

RFQ Number: ${rfq.rfqNumber}
Material: ${rfq.materialName}
Description: ${rfq.materialDescription || 'N/A'}
Quantity Required: ${rfq.quantity} ${rfq.unit}
Specifications: ${rfq.specifications || 'Standard specifications'}
Required Delivery Date: ${rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}
Delivery Location: ${rfq.deliveryLocation || 'To be confirmed'}
Incoterms: ${rfq.incoterms || 'FOB'}
Priority: ${rfq.priority || 'Normal'}

Please request:
1. Unit price and total price
2. Lead time / delivery schedule
3. Minimum order quantity
4. Payment terms
5. Quote validity period

Request a response by ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : '5 business days'}.

Format the email professionally.`;

            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are a procurement specialist drafting RFQ emails to vendors. Be professional, clear, and include all relevant material details.' },
                { role: 'user', content: emailPrompt },
              ],
            });
            
            const rawEmailBody = response.choices[0]?.message?.content;
            const emailBody = typeof rawEmailBody === 'string' ? rawEmailBody : 'Unable to generate email content.';
            
            const emailSubject = `Request for Quote: ${rfq.rfqNumber} - ${rfq.materialName}`;
            let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
            let deliveryError: string | undefined;
            
            // Try to send via SendGrid if configured
            if (isEmailConfigured()) {
              const sendResult = await sendEmail({
                to: vendor.email,
                subject: emailSubject,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              
              if (sendResult.success) {
                emailStatus = 'sent';
                await db.updateVendorRfqInvitation(
                  (await db.getVendorRfqInvitations(input.rfqId)).find(i => i.vendorId === vendorId)?.id || 0,
                  { status: 'sent' }
                );
              } else {
                emailStatus = 'failed';
                deliveryError = sendResult.error;
              }
            }
            
            // Save the email record
            const emailResult = await db.createVendorRfqEmail({
              rfqId: input.rfqId,
              vendorId,
              direction: 'outbound',
              emailType: 'rfq_request',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
              toEmail: vendor.email,
              subject: emailSubject,
              body: emailBody,
              aiGenerated: true,
              sendStatus: emailStatus,
              sentAt: emailStatus === 'sent' ? new Date() : undefined,
            });
            
            if (emailStatus === 'sent') {
              results.sent++;
            } else {
              results.failed++;
            }
            results.emails.push({ 
              vendorId, 
              vendorName: vendor.name, 
              emailId: emailResult.id,
              status: emailStatus,
              error: deliveryError,
            });
          }
          
          // Update RFQ status
          await db.updateVendorRfq(input.rfqId, { status: 'sent' });
          const emailConfigured = isEmailConfigured();
          const auditMessage = emailConfigured 
            ? `RFQ emails sent to ${results.sent} vendors` 
            : `RFQ email drafts created for ${results.sent + results.failed} vendors (SendGrid not configured)`;
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', input.rfqId, auditMessage);
          
          return { ...results, emailConfigured };
        }),
      
      // Send follow-up reminder
      sendReminder: opsProcedure
        .input(z.object({ rfqId: z.number(), vendorId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });
          
          const vendor = await db.getVendorById(input.vendorId);
          if (!vendor || !vendor.email) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found or has no email' });
          
          const emailPrompt = `Generate a polite follow-up email for an RFQ that hasn't received a response:

RFQ Number: ${rfq.rfqNumber}
Material: ${rfq.materialName}
Quantity: ${rfq.quantity} ${rfq.unit}
Original Due Date: ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : 'N/A'}

Ask if they received the original request and if they can provide a quote.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a procurement specialist sending a polite follow-up email.' },
              { role: 'user', content: emailPrompt },
            ],
          });
          
          const emailBody = typeof response.choices[0]?.message?.content === 'string' 
            ? response.choices[0].message.content 
            : 'Unable to generate email content.';
          
          const emailSubject = `Follow-up: RFQ ${rfq.rfqNumber} - ${rfq.materialName}`;
          let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
          
          if (isEmailConfigured()) {
            const sendResult = await sendEmail({
              to: vendor.email,
              subject: emailSubject,
              text: emailBody,
              html: formatEmailHtml(emailBody),
            });
            emailStatus = sendResult.success ? 'sent' : 'failed';
          }
          
          await db.createVendorRfqEmail({
            rfqId: input.rfqId,
            vendorId: input.vendorId,
            direction: 'outbound',
            emailType: 'follow_up',
            fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
            toEmail: vendor.email,
            subject: emailSubject,
            body: emailBody,
            aiGenerated: true,
            sendStatus: emailStatus,
            sentAt: emailStatus === 'sent' ? new Date() : undefined,
          });
          
          // Update invitation reminder count
          const invitations = await db.getVendorRfqInvitations(input.rfqId);
          const invitation = invitations.find(i => i.vendorId === input.vendorId);
          if (invitation) {
            await db.updateVendorRfqInvitation(invitation.id, {
              reminderSentAt: new Date(),
              reminderCount: (invitation.reminderCount || 0) + 1,
            });
          }
          
          return { success: true, emailStatus };
        }),
      
      // Get invitations for an RFQ
      getInvitations: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getVendorRfqInvitations(input.rfqId)),
    }),
    
    // Quotes
    quotes: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional(), vendorId: z.number().optional(), status: z.string().optional() }).optional())
        .query(({ input }) => db.getVendorQuotes(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getVendorQuoteById(input.id)),
      getWithVendorInfo: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getVendorQuotesWithVendorInfo(input.rfqId)),
      create: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          vendorId: z.number(),
          quoteNumber: z.string().optional(),
          unitPrice: z.string().optional(),
          quantity: z.string().optional(),
          totalPrice: z.string().optional(),
          currency: z.string().optional(),
          shippingCost: z.string().optional(),
          handlingFee: z.string().optional(),
          taxAmount: z.string().optional(),
          otherCharges: z.string().optional(),
          totalWithCharges: z.string().optional(),
          leadTimeDays: z.number().optional(),
          estimatedDeliveryDate: z.date().optional(),
          minimumOrderQty: z.string().optional(),
          validUntil: z.date().optional(),
          paymentTerms: z.string().optional(),
          receivedVia: z.enum(['email', 'portal', 'phone', 'manual']).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createVendorQuote({ ...input, status: 'received' });
          
          // Update invitation status
          const invitations = await db.getVendorRfqInvitations(input.rfqId);
          const invitation = invitations.find(i => i.vendorId === input.vendorId);
          if (invitation) {
            await db.updateVendorRfqInvitation(invitation.id, { status: 'responded', respondedAt: new Date() });
          }
          
          // Check if all invited vendors have responded
          const updatedInvitations = await db.getVendorRfqInvitations(input.rfqId);
          const allResponded = updatedInvitations.every(i => ['responded', 'declined', 'no_response'].includes(i.status));
          if (allResponded && updatedInvitations.length > 0) {
            await db.updateVendorRfq(input.rfqId, { status: 'all_received' });
          } else {
            await db.updateVendorRfq(input.rfqId, { status: 'partially_received' });
          }
          
          // Rank quotes (simple ranking by price)
          const allQuotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          const sortedQuotes = allQuotes
            .filter(q => q.status === 'received')
            .sort((a, b) => parseFloat(a.totalPrice || '999999') - parseFloat(b.totalPrice || '999999'));
          for (let i = 0; i < sortedQuotes.length; i++) {
            await db.updateVendorQuote(sortedQuotes[i].id, { overallRank: i + 1 });
          }
          
          await createAuditLog(ctx.user.id, 'create', 'vendor_quote', result.id, `Quote from vendor ${input.vendorId}`);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'received', 'under_review', 'accepted', 'rejected', 'expired', 'converted_to_po']).optional(),
          unitPrice: z.string().optional(),
          quantity: z.string().optional(),
          totalPrice: z.string().optional(),
          leadTimeDays: z.number().optional(),
          validUntil: z.date().optional(),
          paymentTerms: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateVendorQuote(id, data);
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', id);
          return { success: true };
        }),
      
      // Accept quote and optionally convert to PO
      accept: opsProcedure
        .input(z.object({ id: z.number(), createPO: z.boolean().optional() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getVendorQuoteById(input.id);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          // Mark quote as accepted
          await db.updateVendorQuote(input.id, { status: 'accepted' });
          
          // Reject other quotes for this RFQ
          const otherQuotes = await db.getVendorQuotes({ rfqId: quote.rfqId });
          for (const q of otherQuotes) {
            if (q.id !== input.id && q.status === 'received') {
              await db.updateVendorQuote(q.id, { status: 'rejected' });
            }
          }
          
          // Update RFQ status
          await db.updateVendorRfq(quote.rfqId, { status: 'awarded' });
          
          // Send award notification email
          const vendor = await db.getVendorById(quote.vendorId);
          const rfq = await db.getVendorRfqById(quote.rfqId);
          if (vendor?.email && rfq && isEmailConfigured()) {
            const emailBody = `Dear ${vendor.name},\n\nWe are pleased to inform you that your quote for ${rfq.materialName} (RFQ: ${rfq.rfqNumber}) has been accepted.\n\nWe will be in touch shortly with a formal Purchase Order.\n\nThank you for your competitive pricing.\n\nBest regards`;
            await sendEmail({
              to: vendor.email,
              subject: `Quote Accepted: ${rfq.rfqNumber} - ${rfq.materialName}`,
              text: emailBody,
              html: formatEmailHtml(emailBody),
            });
            await db.createVendorRfqEmail({
              rfqId: quote.rfqId,
              vendorId: quote.vendorId,
              quoteId: input.id,
              direction: 'outbound',
              emailType: 'award_notification',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
              toEmail: vendor.email,
              subject: `Quote Accepted: ${rfq.rfqNumber}`,
              body: emailBody,
              aiGenerated: false,
              sendStatus: 'sent',
              sentAt: new Date(),
            });
          }
          
          let poId: number | undefined;
          
          // Create PO if requested
          if (input.createPO && rfq) {
            const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const poResult = await db.createPurchaseOrder({
              poNumber,
              vendorId: quote.vendorId,
              status: 'draft',
              orderDate: new Date(),
              subtotal: quote.totalPrice || '0',
              totalAmount: quote.totalWithCharges || quote.totalPrice || '0',
              notes: `Created from accepted quote ${quote.quoteNumber || quote.id} for RFQ ${rfq.rfqNumber}`,
            });
            poId = poResult.id;
            
            // Add line item if raw material is linked
            if (rfq.rawMaterialId) {
              await db.createPurchaseOrderItem({
                purchaseOrderId: poResult.id,
                productId: null,
                description: rfq.materialName,
                quantity: quote.quantity || rfq.quantity || '1',
                unitPrice: quote.unitPrice || '0',
                totalAmount: quote.totalPrice || '0',
              });
            }
            
            // Update quote with PO reference
            await db.updateVendorQuote(input.id, { 
              status: 'converted_to_po',
              convertedToPOId: poResult.id,
              convertedAt: new Date(),
            });
            
            await createAuditLog(ctx.user.id, 'create', 'purchase_order', poResult.id, `Created from vendor quote ${input.id}`);
          }
          
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', input.id, 'Quote accepted');
          return { success: true, poId };
        }),
      
      // Reject quote
      reject: opsProcedure
        .input(z.object({ id: z.number(), reason: z.string().optional(), sendNotification: z.boolean().optional() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getVendorQuoteById(input.id);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          await db.updateVendorQuote(input.id, { status: 'rejected', notes: input.reason });
          
          // Send rejection notification if requested
          if (input.sendNotification) {
            const vendor = await db.getVendorById(quote.vendorId);
            const rfq = await db.getVendorRfqById(quote.rfqId);
            if (vendor?.email && rfq && isEmailConfigured()) {
              const emailBody = `Dear ${vendor.name},\n\nThank you for submitting your quote for ${rfq.materialName} (RFQ: ${rfq.rfqNumber}).\n\nAfter careful consideration, we have decided to proceed with another supplier for this order.${input.reason ? `\n\nReason: ${input.reason}` : ''}\n\nWe appreciate your time and look forward to future opportunities.\n\nBest regards`;
              await sendEmail({
                to: vendor.email,
                subject: `Quote Update: ${rfq.rfqNumber} - ${rfq.materialName}`,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              await db.createVendorRfqEmail({
                rfqId: quote.rfqId,
                vendorId: quote.vendorId,
                quoteId: input.id,
                direction: 'outbound',
                emailType: 'rejection_notification',
                fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
                toEmail: vendor.email,
                subject: `Quote Update: ${rfq.rfqNumber}`,
                body: emailBody,
                aiGenerated: false,
                sendStatus: 'sent',
                sentAt: new Date(),
              });
            }
          }
          
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', input.id, 'Quote rejected');
          return { success: true };
        }),
      
      // Get best quote for an RFQ
      getBest: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getBestVendorQuote(input.rfqId)),
      
      // AI analyze and rank quotes
      analyzeAndRank: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          // Rank quotes by price
          const allQuotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          const sortedQuotes = allQuotes
            .filter(q => q.status === 'received')
            .sort((a, b) => parseFloat(a.totalPrice || '999999') - parseFloat(b.totalPrice || '999999'));
          for (let i = 0; i < sortedQuotes.length; i++) {
            await db.updateVendorQuote(sortedQuotes[i].id, { overallRank: i + 1 });
          }
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', input.rfqId, 'AI analyzed and ranked quotes');
          return { success: true };
        }),
    }),
    
    // Emails
    emails: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional(), vendorId: z.number().optional() }).optional())
        .query(({ input }) => db.getVendorRfqEmails(input)),
    }),
  }),

  // ============================================
  // SHOPIFY INTEGRATION
  // ============================================
  shopify: router({
    stores: router({
      list: protectedProcedure.query(async () => {
        return db.getShopifyStores();
      }),
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return db.getShopifyStoreById(input.id);
        }),
      create: protectedProcedure
        .input(z.object({
          storeName: z.string(),
          storeDomain: z.string(),
          apiKey: z.string().optional(),
          apiSecret: z.string().optional(),
          accessToken: z.string().optional(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return db.createShopifyStore(input);
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          storeName: z.string().optional(),
          isActive: z.boolean().optional(),
          lastSyncAt: z.date().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateShopifyStore(id, data);
          return { success: true };
        }),
    }),
    skuMappings: router({
      list: protectedProcedure
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
          return db.getShopifySkuMappings(input.storeId);
        }),
      create: protectedProcedure
        .input(z.object({
          storeId: z.number(),
          shopifyProductId: z.string(),
          shopifyVariantId: z.string(),
          productId: z.number(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return db.createShopifySkuMapping(input);
        }),
    }),
    locationMappings: router({
      list: protectedProcedure
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
          return db.getShopifyLocationMappings(input.storeId);
        }),
      create: protectedProcedure
        .input(z.object({
          storeId: z.number(),
          shopifyLocationId: z.string(),
          warehouseId: z.number(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return db.createShopifyLocationMapping(input);
        }),
    }),
    // Webhook handler (would be called by Shopify webhooks)
    handleWebhook: publicProcedure
      .input(z.object({
        topic: z.string(),
        shopDomain: z.string(),
        payload: z.any(),
        idempotencyKey: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Check idempotency
        const existing = await db.getWebhookEventByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          return { success: true, message: 'Already processed' };
        }
        
        // Get store
        const store = await db.getShopifyStoreByDomain(input.shopDomain);
        if (!store) {
          throw new Error('Unknown store');
        }
        
        // Create webhook event
        const { id: eventId } = await db.createWebhookEvent({
          source: 'shopify',
          topic: input.topic,
          payload: JSON.stringify(input.payload),
          idempotencyKey: input.idempotencyKey,
          status: 'received',
        });
        
        try {
          // Process based on topic
          if (input.topic === 'orders/create' || input.topic === 'orders/updated') {
            // Create/update sales order from Shopify order
            const shopifyOrder = input.payload;
            const existingOrder = await db.getSalesOrderByShopifyId(shopifyOrder.id.toString());
            
            if (existingOrder) {
              await db.updateSalesOrder(existingOrder.id, {
                status: mapShopifyOrderStatusToDb(shopifyOrder.financial_status, shopifyOrder.fulfillment_status),
                totalAmount: shopifyOrder.total_price,
              });
            } else {
              const { id: orderId } = await db.createSalesOrder({
                source: 'shopify',
                shopifyOrderId: shopifyOrder.id.toString(),
                customerId: undefined,
                status: mapShopifyOrderStatusToDb(shopifyOrder.financial_status, shopifyOrder.fulfillment_status),
                orderDate: new Date(shopifyOrder.created_at),
                totalAmount: shopifyOrder.total_price,
                currency: shopifyOrder.currency,
                shippingAddress: JSON.stringify(shopifyOrder.shipping_address),
              });
              
              // Create order lines
              for (const item of shopifyOrder.line_items || []) {
                const product = await db.getProductByShopifySku(store.id, item.variant_id?.toString());
                if (product) {
                  await db.createSalesOrderLine({
                    salesOrderId: orderId,
                    productId: product.id,
                    shopifyLineItemId: item.id?.toString(),
                    sku: item.sku,
                    quantity: item.quantity?.toString() || '0',
                    unitPrice: item.price || '0',
                    totalPrice: (parseFloat(item.price || '0') * (item.quantity || 0)).toString(),
                  });
                }
              }
            }
          }
          
          await db.updateWebhookEvent(eventId, { status: 'processed', processedAt: new Date() });
          return { success: true };
        } catch (error) {
          await db.updateWebhookEvent(eventId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }),
    // Sync operations
    sync: router({
      // Sync orders from Shopify store
      orders: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalImported = 0;
          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/orders.json?status=any&limit=50`, {
                headers: {
                  'X-Shopify-Access-Token': store.accessToken!,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const orders = data.orders || [];

              for (const order of orders) {
                const existingOrder = await db.getSalesOrderByShopifyId(order.id.toString());
                if (existingOrder) {
                  await db.updateSalesOrder(existingOrder.id, {
                    status: order.fulfillment_status === 'fulfilled' ? 'delivered' :
                            order.financial_status === 'paid' ? 'confirmed' : 'pending',
                    totalAmount: order.total_price,
                  });
                  totalUpdated++;
                } else {
                  // Find or create customer
                  let customerId: number | undefined;
                  if (order.customer?.email) {
                    const customer = await db.getCustomerByEmail(order.customer.email);
                    if (customer) {
                      customerId = customer.id;
                    }
                  }

                  await db.createSalesOrder({
                    shopifyOrderId: order.id.toString(),
                    source: 'shopify',
                    status: order.fulfillment_status === 'fulfilled' ? 'delivered' :
                            order.financial_status === 'paid' ? 'confirmed' : 'pending',
                    orderDate: new Date(order.created_at),
                    totalAmount: order.total_price,
                    customerId,
                    shippingAddress: JSON.stringify(order.shipping_address),
                    notes: `Shopify Order: ${order.name}`,
                  });
                  totalImported++;
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing orders from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_orders',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Imported ${totalImported}, Updated ${totalUpdated}`,
            recordsProcessed: totalImported + totalUpdated,
            recordsFailed: totalErrors,
          });

          return { imported: totalImported, updated: totalUpdated, errors: totalErrors };
        }),

      // Sync products from Shopify store
      products: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalImported = 0;
          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/products.json?limit=100`, {
                headers: {
                  'X-Shopify-Access-Token': store.accessToken!,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const products = data.products || [];

              for (const product of products) {
                const existingProduct = await db.getProductBySku(product.variants[0]?.sku || `SHOP-${product.id}`);
                if (existingProduct) {
                  await db.updateProduct(existingProduct.id, {
                    name: product.title,
                    price: product.variants[0]?.price || '0',
                    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
                    isActive: product.status === 'active',
                  });
                  totalUpdated++;
                } else {
                  await db.createProduct({
                    name: product.title,
                    sku: product.variants[0]?.sku || `SHOP-${product.id}`,
                    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
                    price: product.variants[0]?.price || '0',
                    isActive: product.status === 'active',
                    category: product.product_type || 'General',
                    source: 'shopify',
                  });
                  totalImported++;
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing products from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_products',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Imported ${totalImported}, Updated ${totalUpdated}`,
            recordsProcessed: totalImported + totalUpdated,
            recordsFailed: totalErrors,
          });

          return { imported: totalImported, updated: totalUpdated, errors: totalErrors };
        }),

      // Sync inventory from Shopify store
      inventory: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              // Get inventory levels from Shopify
              const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/inventory_levels.json?limit=100`, {
                headers: {
                  'X-Shopify-Access-Token': store.accessToken!,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const levels = data.inventory_levels || [];

              // Get SKU mappings for this store
              const mappings = await db.getShopifySkuMappings(store.id);

              for (const level of levels) {
                const mapping = mappings.find(m => m.shopifyVariantId === level.inventory_item_id.toString());
                if (mapping) {
                  // Update local inventory
                  const inventory = await db.getInventoryByProductId(mapping.productId);
                  if (inventory) {
                    await db.updateInventory(inventory.id, {
                      quantity: level.available?.toString() || '0',
                    });
                    totalUpdated++;
                  }
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing inventory from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_inventory',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Updated ${totalUpdated} inventory records`,
            recordsProcessed: totalUpdated,
            recordsFailed: totalErrors,
          });

          return { updated: totalUpdated, errors: totalErrors };
        }),

      // Sync customers from Shopify store
      customers: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalImported = 0;
          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/customers.json?limit=100`, {
                headers: {
                  'X-Shopify-Access-Token': store.accessToken!,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const customers = data.customers || [];

              for (const customer of customers) {
                const existingCustomer = await db.getCustomerByEmail(customer.email);
                if (existingCustomer) {
                  await db.updateCustomer(existingCustomer.id, {
                    name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || existingCustomer.name,
                    phone: customer.phone || existingCustomer.phone,
                    shopifyCustomerId: customer.id.toString(),
                  });
                  totalUpdated++;
                } else if (customer.email) {
                  await db.createCustomer({
                    name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Shopify Customer',
                    email: customer.email,
                    phone: customer.phone || '',
                    shopifyCustomerId: customer.id.toString(),
                    syncSource: 'shopify',
                  });
                  totalImported++;
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing customers from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_customers',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Imported ${totalImported}, Updated ${totalUpdated}`,
            recordsProcessed: totalImported + totalUpdated,
            recordsFailed: totalErrors,
          });

          return { imported: totalImported, updated: totalUpdated, errors: totalErrors };
        }),
    }),
  }),

  // ============================================
  // SALES ORDERS
  // ============================================
  salesOrders: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'confirmed', 'allocated', 'picking', 'shipped', 'delivered', 'cancelled']).optional(),
        source: z.enum(['shopify', 'amazon', 'manual', 'api']).optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSalesOrders(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const order = await db.getSalesOrderById(input.id);
        if (!order) return null;
        const lines = await db.getSalesOrderLines(input.id);
        const reservations = await db.getInventoryReservations(input.id);
        return { ...order, lines, reservations };
      }),
    create: protectedProcedure
      .input(z.object({
        customerId: z.number().optional(),
        source: z.enum(['shopify', 'manual', 'api', 'other']).default('manual'),
        orderDate: z.date().optional(),
        requestedShipDate: z.date().optional(),
        shippingAddress: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(z.object({
          productId: z.number(),
          quantity: z.string(),
          unitPrice: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const totalAmount = input.lines.reduce((sum, line) => {
          return sum + parseFloat(line.quantity) * parseFloat(line.unitPrice);
        }, 0);
        
        const { id: orderId, orderNumber } = await db.createSalesOrder({
          customerId: input.customerId,
          source: input.source,
          status: 'pending',
          orderDate: input.orderDate || new Date(),
          shippingAddress: input.shippingAddress,
          notes: input.notes,
          totalAmount: totalAmount.toString(),
        });
        
        for (const line of input.lines) {
          await db.createSalesOrderLine({
            salesOrderId: orderId,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice)).toString(),
          });
        }
        
        return { id: orderId, orderNumber };
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
      }))
      .mutation(async ({ input }) => {
        await db.updateSalesOrder(input.id, { status: input.status });
        return { success: true };
      }),
  }),

  // ============================================
  // INVENTORY LOTS
  // ============================================
  inventoryLots: router({
    list: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        status: z.enum(['active', 'hold', 'expired', 'depleted']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInventoryLots(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getInventoryLotById(input.id);
      }),
    getBalances: protectedProcedure
      .input(z.object({
        lotId: z.number().optional(),
        productId: z.number().optional(),
        warehouseId: z.number().optional(),
        status: z.enum(['available', 'reserved', 'hold', 'damaged']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInventoryBalances(input);
      }),
    getTransactionHistory: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        lotId: z.number().optional(),
        warehouseId: z.number().optional(),
        type: z.string().optional(),
        limit: z.number().default(100),
      }))
      .query(async ({ input }) => {
        return db.getInventoryTransactionHistory(input, input.limit);
      }),
    reserve: protectedProcedure
      .input(z.object({
        lotId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantity: z.number(),
        referenceType: z.string(),
        referenceId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.reserveInventory(
          input.lotId,
          input.productId,
          input.warehouseId,
          input.quantity,
          input.referenceType,
          input.referenceId,
          ctx.user?.id
        );
      }),
    release: protectedProcedure
      .input(z.object({
        lotId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantity: z.number(),
        referenceType: z.string(),
        referenceId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.releaseReservation(
          input.lotId,
          input.productId,
          input.warehouseId,
          input.quantity,
          input.referenceType,
          input.referenceId,
          ctx.user?.id
        );
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['active', 'expired', 'consumed', 'quarantine']),
      }))
      .mutation(async ({ input }) => {
        await db.updateInventoryLot(input.id, { status: input.status });
        return { success: true };
      }),
    getAvailableByProduct: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        return db.getAvailableInventoryByProduct(input.productId);
      }),
  }),

  // ============================================
  // INVENTORY RECONCILIATION
  // ============================================
  reconciliation: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        channel: z.enum(['shopify', 'amazon', 'all']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getReconciliationRuns(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const run = await db.getReconciliationRunById(input.id);
        if (!run) return null;
        const lines = await db.getReconciliationLines(input.id);
        return { ...run, lines };
      }),
    run: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'all']),
        storeId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.runInventoryReconciliation(input.channel, input.storeId, ctx.user?.id);
      }),
  }),

  // ============================================
  // INVENTORY ALLOCATIONS
  // ============================================
  allocations: router({
    list: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'wholesale', 'retail']).optional(),
        productId: z.number().optional(),
        storeId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInventoryAllocations(input);
      }),
    create: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'wholesale', 'retail']),
        productId: z.number(),
        warehouseId: z.number(),
        storeId: z.number().optional(),
        allocatedQuantity: z.string(),
        reservedQuantity: z.string().default('0'),
      }))
      .mutation(async ({ input }) => {
        return db.createInventoryAllocation({
          ...input,
          remainingQuantity: input.allocatedQuantity,
        });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        allocatedQuantity: z.string().optional(),
        reservedQuantity: z.string().optional(),
        remainingQuantity: z.string().optional(),
        channelReportedQuantity: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateInventoryAllocation(id, data);
        return { success: true };
      }),
  }),

  // ============================================
  // EMAIL SCANNING & DOCUMENT PARSING
  // ============================================
  emailScanning: router({
    // List inbound emails with category filtering
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        category: z.string().optional(),
        priority: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInboundEmails(input);
      }),

    // Get category statistics
    getCategoryStats: protectedProcedure
      .query(async () => {
        return db.getEmailCategoryStats();
      }),

    // Get single email with attachments and parsed documents
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const email = await db.getInboundEmailById(input.id);
        if (!email) return null;
        
        const attachments = await db.getEmailAttachments(input.id);
        const documents = await db.getParsedDocuments({ emailId: input.id });
        
        return { ...email, attachments, documents };
      }),

    // Submit email for parsing (manual forward)
    submitEmail: protectedProcedure
      .input(z.object({
        fromEmail: z.string().email(),
        fromName: z.string().optional(),
        subject: z.string(),
        bodyText: z.string(),
        bodyHtml: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { parseEmailContent } = await import("./_core/emailParser");
        
        // First, quick categorize for immediate feedback
        const { quickCategorize, categorizeEmail } = await import("./_core/emailParser");
        const quickCategory = quickCategorize(input.subject, input.fromEmail);
        
        // Create inbound email record with initial category
        const { id: emailId } = await db.createInboundEmail({
          messageId: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fromEmail: input.fromEmail,
          fromName: input.fromName || null,
          toEmail: "erp@system.local",
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml || null,
          receivedAt: new Date(),
          parsingStatus: "processing",
          category: quickCategory.category,
          categoryConfidence: quickCategory.confidence.toString(),
          categoryKeywords: quickCategory.keywords,
          suggestedAction: quickCategory.suggestedAction || null,
          priority: quickCategory.priority,
        });

        try {
          // Parse email content with AI (includes full categorization)
          const result = await parseEmailContent(
            input.subject,
            input.bodyText,
            input.fromEmail,
            input.fromName
          );

          if (!result.success) {
            await db.updateInboundEmailStatus(emailId, "failed", result.error);
            return { emailId, success: false, error: result.error, documents: [] };
          }

          // Create parsed document records
          const createdDocs = [];
          for (const doc of result.documents) {
            // Try to match vendor
            let vendorId: number | null = null;
            const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
            if (existingVendor) {
              vendorId = existingVendor.id;
            }

            // Try to match PO
            let purchaseOrderId: number | null = null;
            if (doc.documentNumber && (doc.documentType === "invoice" || doc.documentType === "receipt")) {
              const po = await db.findPurchaseOrderByNumber(doc.documentNumber);
              if (po) purchaseOrderId = po.id;
            }

            // Try to match shipment
            let shipmentId: number | null = null;
            if (doc.trackingNumber) {
              const shipment = await db.findShipmentByTracking(doc.trackingNumber);
              if (shipment) shipmentId = shipment.id;
            }

            const { id: docId } = await db.createParsedDocument({
              emailId,
              documentType: doc.documentType as any,
              confidence: doc.confidence?.toString() || "0",
              vendorName: doc.vendorName || null,
              vendorEmail: doc.vendorEmail || null,
              vendorId,
              documentNumber: doc.documentNumber || null,
              documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
              dueDate: doc.dueDate ? new Date(doc.dueDate) : null,
              subtotal: doc.subtotal?.toString() || null,
              taxAmount: doc.taxAmount?.toString() || null,
              shippingAmount: doc.shippingAmount?.toString() || null,
              totalAmount: doc.totalAmount?.toString() || null,
              currency: doc.currency || "USD",
              trackingNumber: doc.trackingNumber || null,
              carrierName: doc.carrierName || null,
              shipmentId,
              purchaseOrderId,
              lineItems: doc.lineItems || null,
              rawExtractedData: doc as any,
            });

            // Create line items if present
            if (doc.lineItems && doc.lineItems.length > 0) {
              for (let i = 0; i < doc.lineItems.length; i++) {
                const item = doc.lineItems[i];
                await db.createParsedDocumentLineItem({
                  documentId: docId,
                  lineNumber: i + 1,
                  description: item.description || null,
                  sku: item.sku || null,
                  quantity: item.quantity?.toString() || null,
                  unit: item.unit || null,
                  unitPrice: item.unitPrice?.toString() || null,
                  totalPrice: item.totalPrice?.toString() || null,
                });
              }
            }

            createdDocs.push({ id: docId, type: doc.documentType, vendorId, purchaseOrderId, shipmentId });
          }

          // Update with AI categorization if available (more accurate than quick categorize)
          if (result.categorization) {
            await db.updateEmailCategorization(emailId, {
              category: result.categorization.category,
              categoryConfidence: result.categorization.confidence.toString(),
              categoryKeywords: result.categorization.keywords,
              suggestedAction: result.categorization.suggestedAction || null,
              priority: result.categorization.priority,
              subcategory: result.categorization.subcategory || null,
            });
          }

          await db.updateInboundEmailStatus(emailId, "parsed");
          
          // Create audit log
          await db.createAuditLog({
            userId: ctx.user.id,
            action: "create",
            entityType: "inbound_email",
            entityId: emailId,
            newValues: { documentsFound: createdDocs.length, category: result.categorization?.category },
          });

          return { emailId, success: true, documents: createdDocs };
        } catch (error) {
          await db.updateInboundEmailStatus(emailId, "failed", error instanceof Error ? error.message : "Unknown error");
          return { emailId, success: false, error: "Parsing failed", documents: [] };
        }
      }),

    // Get parsed documents
    getDocuments: protectedProcedure
      .input(z.object({
        documentType: z.string().optional(),
        isReviewed: z.boolean().optional(),
        isApproved: z.boolean().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getParsedDocuments(input);
      }),

    // Get single parsed document with line items
    getDocument: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const doc = await db.getParsedDocumentById(input.id);
        if (!doc) return null;
        
        const lineItems = await db.getParsedDocumentLineItems(input.id);
        return { ...doc, lineItems };
      }),

    // Approve parsed document and optionally create records
    approveDocument: protectedProcedure
      .input(z.object({
        id: z.number(),
        createVendor: z.boolean().optional(),
        createTransaction: z.boolean().optional(),
        linkToPO: z.number().optional(),
        linkToShipment: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const doc = await db.getParsedDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

        // Create vendor if requested
        if (input.createVendor && doc.vendorName && !doc.vendorId) {
          const { id: vendorId } = await db.createVendor({
            name: doc.vendorName,
            email: doc.vendorEmail || undefined,
            status: "active",
          });
          await db.setCreatedVendor(input.id, vendorId);
        }

        // Create transaction if requested (for receipts/invoices)
        if (input.createTransaction && doc.totalAmount) {
          const { id: transactionId } = await db.createTransaction({
            type: "expense",
            totalAmount: doc.totalAmount,
            transactionNumber: `DOC-${Date.now()}`,
            description: `${doc.documentType} from ${doc.vendorName || "Unknown"} - ${doc.documentNumber || "No ref"}`,
            date: doc.documentDate || new Date(),
            status: "posted",
          });
          await db.setCreatedTransaction(input.id, transactionId);
        }

        // Link to PO if specified
        if (input.linkToPO) {
          await db.linkParsedDocumentToPO(input.id, input.linkToPO);
        }

        // Link to shipment if specified
        if (input.linkToShipment) {
          await db.linkParsedDocumentToShipment(input.id, input.linkToShipment);
        }

        // Approve the document
        await db.approveParsedDocument(input.id, ctx.user.id);

        // Create audit log
        await db.createAuditLog({
          userId: ctx.user.id,
          action: "approve",
          entityType: "parsed_document",
          entityId: input.id,
          newValues: { createVendor: input.createVendor, createTransaction: input.createTransaction },
        });

        return { success: true };
      }),

    // Reject parsed document
    rejectDocument: protectedProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.rejectParsedDocument(input.id, ctx.user.id, input.notes);
        return { success: true };
      }),

    // Get email scanning statistics
    getStats: protectedProcedure
      .query(async () => {
        return db.getEmailScanningStats();
      }),

    // Archive email
    archiveEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateInboundEmailStatus(input.id, "archived");
        return { success: true };
      }),

    // Delete email permanently
    deleteEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteInboundEmail(input.id);
        return { success: true };
      }),

    // Auto-reply rules
    getAutoReplyRules: protectedProcedure
      .input(z.object({
        isEnabled: z.boolean().optional(),
        category: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAutoReplyRules(input);
      }),

    getAutoReplyRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getAutoReplyRuleById(input.id);
      }),

    createAutoReplyRule: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        category: z.string(),
        replyTemplate: z.string().min(1),
        senderPattern: z.string().optional(),
        subjectPattern: z.string().optional(),
        bodyKeywords: z.array(z.string()).optional(),
        minConfidence: z.string().optional(),
        replySubjectPrefix: z.string().optional(),
        tone: z.enum(["professional", "friendly", "formal"]).optional(),
        includeOriginal: z.boolean().optional(),
        delayMinutes: z.number().optional(),
        autoSend: z.boolean().optional(),
        createTask: z.boolean().optional(),
        notifyOwner: z.boolean().optional(),
        priority: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createAutoReplyRule({ ...input, createdBy: ctx.user.id });
      }),

    updateAutoReplyRule: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        category: z.string().optional(),
        isEnabled: z.boolean().optional(),
        priority: z.number().optional(),
        senderPattern: z.string().optional(),
        subjectPattern: z.string().optional(),
        bodyKeywords: z.array(z.string()).optional(),
        minConfidence: z.string().optional(),
        replyTemplate: z.string().optional(),
        replySubjectPrefix: z.string().optional(),
        tone: z.enum(["professional", "friendly", "formal"]).optional(),
        includeOriginal: z.boolean().optional(),
        delayMinutes: z.number().optional(),
        autoSend: z.boolean().optional(),
        createTask: z.boolean().optional(),
        notifyOwner: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateAutoReplyRule(id, updates);
        return { success: true };
      }),

    deleteAutoReplyRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAutoReplyRule(input.id);
        return { success: true };
      }),

    // Sent emails tracking
    getSentEmails: protectedProcedure
      .input(z.object({
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSentEmails(input);
      }),

    getSentEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getSentEmailById(input.id);
      }),

    getEmailThread: protectedProcedure
      .input(z.object({ threadId: z.string() }))
      .query(async ({ input }) => {
        return db.getEmailThread(input.threadId);
      }),

    // Reparse email
    reparseEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const email = await db.getInboundEmailById(input.id);
        if (!email) throw new TRPCError({ code: "NOT_FOUND" });

        const { parseEmailContent } = await import("./_core/emailParser");
        
        await db.updateInboundEmailStatus(input.id, "processing");

        try {
          const result = await parseEmailContent(
            email.subject || "",
            email.bodyText || "",
            email.fromEmail,
            email.fromName || undefined
          );

          if (!result.success) {
            await db.updateInboundEmailStatus(input.id, "failed", result.error);
            return { success: false, error: result.error };
          }

          // Create new parsed documents
          for (const doc of result.documents) {
            let vendorId: number | null = null;
            const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
            if (existingVendor) vendorId = existingVendor.id;

            await db.createParsedDocument({
              emailId: input.id,
              documentType: doc.documentType as any,
              confidence: doc.confidence?.toString() || "0",
              vendorName: doc.vendorName || null,
              vendorEmail: doc.vendorEmail || null,
              vendorId,
              documentNumber: doc.documentNumber || null,
              documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
              totalAmount: doc.totalAmount?.toString() || null,
              currency: doc.currency || "USD",
              trackingNumber: doc.trackingNumber || null,
              carrierName: doc.carrierName || null,
              lineItems: doc.lineItems || null,
              rawExtractedData: doc as any,
            });
          }

          await db.updateInboundEmailStatus(input.id, "parsed");
          return { success: true, documentsFound: result.documents.length };
        } catch (error) {
          await db.updateInboundEmailStatus(input.id, "failed", error instanceof Error ? error.message : "Unknown error");
          return { success: false, error: "Reparse failed" };
        }
      }),

    // Process attachments with OCR
    processAttachments: protectedProcedure
      .input(z.object({ emailId: z.number() }))
      .mutation(async ({ input }) => {
        const email = await db.getInboundEmailById(input.emailId);
        if (!email) throw new TRPCError({ code: "NOT_FOUND" });

        const attachments = await db.getEmailAttachments(input.emailId);
        if (attachments.length === 0) {
          return { success: true, processed: 0, results: [] };
        }

        const { processEmailAttachments, categorizeByAttachments } = await import("./_core/attachmentOcr");
        
        const results = await processEmailAttachments(
          attachments.map(a => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            storageUrl: a.storageUrl,
          }))
        );

        // Update attachments with OCR results
        const processedResults: any[] = [];
        for (const [attachmentId, result] of Array.from(results.entries())) {
          await db.updateEmailAttachment(attachmentId, {
            extractedText: result.extractedText,
            metadata: { structuredData: result.structuredData, confidence: result.confidence },
            isProcessed: true,
          });

          // Create parsed document from attachment if high confidence
          if (result.confidence >= 0.7 && result.type !== 'unknown') {
            const data = result.structuredData;
            await db.createParsedDocument({
              emailId: input.emailId,
              attachmentId,
              documentType: result.type as any,
              confidence: result.confidence.toString(),
              vendorName: data.vendorName || null,
              vendorEmail: data.vendorEmail || null,
              documentNumber: data.documentNumber || data.invoiceNumber || null,
              documentDate: data.documentDate ? new Date(data.documentDate) : null,
              totalAmount: data.totalAmount?.toString() || null,
              currency: data.currency || 'USD',
              trackingNumber: data.trackingNumber || null,
              carrierName: data.carrier || null,
              lineItems: data.lineItems || null,
              rawExtractedData: result as any,
            });
          }

          processedResults.push({
            attachmentId,
            type: result.type,
            confidence: result.confidence,
            hasLineItems: (result.structuredData.lineItems?.length || 0) > 0,
          });
        }

        // Update email category based on attachments if not already categorized
        const attachmentCategory = categorizeByAttachments(Array.from(results.values()));
        if (attachmentCategory && (!email.category || email.category === 'general')) {
          await db.updateEmailCategory(input.emailId, {
            category: attachmentCategory.category as any,
            categoryConfidence: attachmentCategory.confidence.toString(),
          });
        }

        return {
          success: true,
          processed: results.size,
          results: processedResults,
        };
      }),

    // Check if IMAP inbox is configured
    isInboxConfigured: protectedProcedure
      .query(async () => {
        const { isImapConfigured, getImapConfig, IMAP_PRESETS } = await import("./_core/emailInboxScanner");
        return {
          configured: isImapConfigured(),
          presets: Object.keys(IMAP_PRESETS),
        };
      }),

    // Test IMAP connection
    testInboxConnection: protectedProcedure
      .input(z.object({
        host: z.string(),
        port: z.number().default(993),
        secure: z.boolean().default(true),
        user: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { testImapConnection } = await import("./_core/emailInboxScanner");
        return testImapConnection({
          host: input.host,
          port: input.port,
          secure: input.secure,
          auth: {
            user: input.user,
            pass: input.password,
          },
        });
      }),

    // Scan entire inbox and import emails
    scanInbox: protectedProcedure
      .input(z.object({
        host: z.string().optional(),
        port: z.number().optional(),
        secure: z.boolean().optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        folder: z.string().default("INBOX"),
        limit: z.number().default(50),
        unseenOnly: z.boolean().default(true),
        markAsSeen: z.boolean().default(false),
        fullAiParsing: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const { scanAndCategorizeInbox, getImapConfig } = await import("./_core/emailInboxScanner");
        
        // Get config from input or environment
        let config = getImapConfig();
        if (input.host && input.user && input.password) {
          config = {
            host: input.host,
            port: input.port || 993,
            secure: input.secure ?? true,
            auth: {
              user: input.user,
              pass: input.password,
            },
          };
        }
        
        if (!config) {
          return {
            success: false,
            error: "IMAP not configured. Please provide connection details or set environment variables.",
            imported: 0,
            skipped: 0,
            errors: [],
          };
        }

        // Scan the inbox
        const { scanResult, parsedResults } = await scanAndCategorizeInbox(config, {
          folder: input.folder,
          limit: input.limit,
          unseenOnly: input.unseenOnly,
          markAsSeen: input.markAsSeen,
          fullAiParsing: input.fullAiParsing,
        });

        if (!scanResult.success) {
          return {
            success: false,
            error: scanResult.errors.join("; "),
            imported: 0,
            skipped: 0,
            errors: scanResult.errors,
          };
        }

        // Import emails into the database
        let imported = 0;
        let skipped = 0;
        const importErrors: string[] = [];

        for (const { email, parseResult } of parsedResults) {
          try {
            // Check if email already exists by messageId
            const existing = await db.findInboundEmailByMessageId(email.messageId);
            if (existing) {
              skipped++;
              continue;
            }

            // Create inbound email record
            const { id: emailId } = await db.createInboundEmail({
              messageId: email.messageId,
              fromEmail: email.from.address,
              fromName: email.from.name || null,
              toEmail: email.to.join(", ") || "inbox",
              subject: email.subject,
              bodyText: email.bodyText,
              bodyHtml: email.bodyHtml || null,
              receivedAt: email.date,
              parsingStatus: parseResult ? "parsed" : "pending",
              category: email.categorization?.category || "general",
              categoryConfidence: email.categorization?.confidence?.toString() || null,
              categoryKeywords: email.categorization?.keywords || null,
              suggestedAction: email.categorization?.suggestedAction || null,
              priority: email.categorization?.priority || "medium",
              subcategory: email.categorization?.subcategory || null,
            });

            // If we have parsed documents, create them
            if (parseResult?.documents) {
              for (const doc of parseResult.documents) {
                let vendorId: number | null = null;
                const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
                if (existingVendor) vendorId = existingVendor.id;

                await db.createParsedDocument({
                  emailId,
                  documentType: doc.documentType as any,
                  confidence: doc.confidence?.toString() || "0",
                  vendorName: doc.vendorName || null,
                  vendorEmail: doc.vendorEmail || null,
                  vendorId,
                  documentNumber: doc.documentNumber || null,
                  documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
                  totalAmount: doc.totalAmount?.toString() || null,
                  currency: doc.currency || "USD",
                  trackingNumber: doc.trackingNumber || null,
                  carrierName: doc.carrierName || null,
                  lineItems: doc.lineItems || null,
                  rawExtractedData: doc as any,
                });
              }
            }

            // Create attachment records
            for (const attachment of email.attachments) {
              await db.createEmailAttachment({
                emailId,
                filename: attachment.filename,
                mimeType: attachment.contentType,
                size: attachment.size,
                storageUrl: null, // Attachments not downloaded in scan
              });
            }

            imported++;
          } catch (error: any) {
            importErrors.push(`Failed to import ${email.messageId}: ${error.message}`);
          }
        }

        return {
          success: true,
          totalInInbox: scanResult.totalEmails,
          scanned: scanResult.newEmails,
          imported,
          skipped,
          errors: [...scanResult.errors, ...importErrors],
        };
      }),

    // Bulk categorize all uncategorized emails
    bulkCategorize: protectedProcedure
      .input(z.object({
        useAi: z.boolean().default(false),
        limit: z.number().default(100),
      }))
      .mutation(async ({ input }) => {
        const { quickCategorize, categorizeEmail } = await import("./_core/emailParser");
        
        // Get uncategorized emails
        const emails = await db.getUncategorizedEmails(input.limit);
        
        let categorized = 0;
        const errors: string[] = [];

        for (const email of emails) {
          try {
            let categorization;
            
            if (input.useAi) {
              categorization = await categorizeEmail(
                email.subject || "",
                email.bodyText || "",
                email.fromEmail,
                email.fromName || undefined
              );
            } else {
              categorization = quickCategorize(
                email.subject || "",
                email.fromEmail
              );
            }

            await db.updateEmailCategorization(email.id, {
              category: categorization.category,
              categoryConfidence: categorization.confidence.toString(),
              categoryKeywords: categorization.keywords,
              suggestedAction: categorization.suggestedAction || null,
              priority: categorization.priority,
              subcategory: categorization.subcategory || null,
            });

            categorized++;
          } catch (error: any) {
            errors.push(`Failed to categorize email ${email.id}: ${error.message}`);
          }
        }

        return {
          success: true,
          total: emails.length,
          categorized,
          errors,
        };
      }),
  }),

  // ============================================
  // DATA ROOM
  // ============================================
  dataRoom: router({
    // List all data rooms for the current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getDataRooms(ctx.user.id);
    }),

    // Get a single data room by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const room = await db.getDataRoomById(input.id);
        if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
        if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        return room;
      }),

    // Create a new data room
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
        isPublic: z.boolean().default(false),
        password: z.string().optional(),
        requiresNda: z.boolean().default(false),
        ndaText: z.string().optional(),
        allowDownload: z.boolean().default(true),
        allowPrint: z.boolean().default(true),
        googleDriveFolderId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Check if slug is unique
        const existing = await db.getDataRoomBySlug(input.slug);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Slug already in use' });
        }

        // Hash password if provided
        let hashedPassword = null;
        if (input.password) {
          const crypto = await import('crypto');
          hashedPassword = crypto.createHash('sha256').update(input.password).digest('hex');
        }

        const { id } = await db.createDataRoom({
          ...input,
          password: hashedPassword,
          ownerId: ctx.user.id,
        });

        return { id, slug: input.slug };
      }),

    // Update a data room
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
        password: z.string().nullable().optional(),
        requiresNda: z.boolean().optional(),
        ndaText: z.string().optional(),
        allowDownload: z.boolean().optional(),
        allowPrint: z.boolean().optional(),
        welcomeMessage: z.string().optional(),
        status: z.enum(['active', 'archived', 'draft']).optional(),
        googleDriveFolderId: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const room = await db.getDataRoomById(input.id);
        if (!room) throw new TRPCError({ code: 'NOT_FOUND' });
        if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        const { id, password, ...updateData } = input;
        let hashedPassword = undefined;
        if (password !== undefined) {
          if (password === null) {
            hashedPassword = null;
          } else {
            const crypto = await import('crypto');
            hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
          }
        }

        await db.updateDataRoom(id, {
          ...updateData,
          ...(hashedPassword !== undefined && { password: hashedPassword }),
        });

        return { success: true };
      }),

    // Delete a data room
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const room = await db.getDataRoomById(input.id);
        if (!room) throw new TRPCError({ code: 'NOT_FOUND' });
        if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.deleteDataRoom(input.id);
        return { success: true };
      }),

    // Folder operations
    folders: router({
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number(), parentId: z.number().nullable().optional() }))
        .query(async ({ input }) => {
          return db.getDataRoomFolders(input.dataRoomId, input.parentId);
        }),

      create: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          parentId: z.number().nullable().optional(),
          name: z.string().min(1),
          description: z.string().optional(),
          googleDriveFolderId: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id } = await db.createDataRoomFolder(input);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          sortOrder: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateDataRoomFolder(id, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteDataRoomFolder(input.id);
          return { success: true };
        }),
    }),

    // Document operations
    documents: router({
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number(), folderId: z.number().nullable().optional() }))
        .query(async ({ input }) => {
          return db.getDataRoomDocuments(input.dataRoomId, input.folderId);
        }),

      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return db.getDataRoomDocumentById(input.id);
        }),

      create: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          folderId: z.number().nullable().optional(),
          name: z.string().min(1),
          description: z.string().optional(),
          fileType: z.string(),
          mimeType: z.string().optional(),
          fileSize: z.number().optional(),
          pageCount: z.number().optional(),
          storageType: z.enum(['s3', 'google_drive']).default('s3'),
          storageUrl: z.string().optional(),
          storageKey: z.string().optional(),
          googleDriveFileId: z.string().optional(),
          googleDriveWebViewLink: z.string().optional(),
          thumbnailUrl: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id } = await db.createDataRoomDocument({
            ...input,
            uploadedBy: ctx.user.id,
          });
          return { id };
        }),

      upload: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          folderId: z.number().nullable().optional(),
          name: z.string(),
          fileType: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
          base64Content: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Upload to S3
          const buffer = Buffer.from(input.base64Content, 'base64');
          const key = `dataroom/${input.dataRoomId}/${nanoid()}-${input.name}`;
          const { url } = await storagePut(key, buffer, input.mimeType);

          // Create document record
          const { id } = await db.createDataRoomDocument({
            dataRoomId: input.dataRoomId,
            folderId: input.folderId,
            name: input.name,
            fileType: input.fileType,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
            storageType: 's3',
            storageUrl: url,
            storageKey: key,
            uploadedBy: ctx.user.id,
          });

          return { id, url };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          sortOrder: z.number().optional(),
          isHidden: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateDataRoomDocument(id, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteDataRoomDocument(input.id);
          return { success: true };
        }),
    }),

    // Shareable links
    links: router({
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getDataRoomLinks(input.dataRoomId);
        }),

      create: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          name: z.string().optional(),
          password: z.string().optional(),
          expiresAt: z.date().optional(),
          maxViews: z.number().optional(),
          allowDownload: z.boolean().default(true),
          allowPrint: z.boolean().default(true),
          requireEmail: z.boolean().default(true),
          requireName: z.boolean().default(false),
          requireCompany: z.boolean().default(false),
          restrictedFolderIds: z.array(z.number()).optional(),
          restrictedDocumentIds: z.array(z.number()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const linkCode = nanoid(12);
          let hashedPassword = null;
          if (input.password) {
            const crypto = await import('crypto');
            hashedPassword = crypto.createHash('sha256').update(input.password).digest('hex');
          }

          const { id } = await db.createDataRoomLink({
            ...input,
            linkCode,
            password: hashedPassword,
            createdBy: ctx.user.id,
          });

          return { id, linkCode };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          isActive: z.boolean().optional(),
          expiresAt: z.date().nullable().optional(),
          maxViews: z.number().nullable().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateDataRoomLink(id, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteDataRoomLink(input.id);
          return { success: true };
        }),
    }),

    // Visitors and analytics
    visitors: router({
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getDataRoomVisitors(input.dataRoomId);
        }),

      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return db.getDataRoomVisitorById(input.id);
        }),

      getViews: protectedProcedure
        .input(z.object({ visitorId: z.number() }))
        .query(async ({ input }) => {
          return db.getVisitorDocumentViews(input.visitorId);
        }),

      getTimeline: protectedProcedure
        .input(z.object({ visitorId: z.number() }))
        .query(async ({ input }) => {
          return db.getVisitorTimeline(input.visitorId);
        }),

      block: protectedProcedure
        .input(z.object({
          id: z.number(),
          reason: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          await db.blockDataRoomVisitor(input.id, input.reason);
          return { success: true };
        }),

      unblock: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.unblockDataRoomVisitor(input.id);
          return { success: true };
        }),

      revoke: protectedProcedure
        .input(z.object({
          id: z.number(),
          reason: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          await db.revokeDataRoomVisitorAccess(input.id, input.reason);
          return { success: true };
        }),

      restore: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.restoreDataRoomVisitorAccess(input.id);
          return { success: true };
        }),
    }),

    // Analytics
    analytics: router({
      getOverview: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getDataRoomAnalytics(input.dataRoomId);
        }),

      getDocumentStats: protectedProcedure
        .input(z.object({ documentId: z.number() }))
        .query(async ({ input }) => {
          return db.getDocumentAnalytics(input.documentId);
        }),
    }),

    // Invitations
    invitations: router({
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getDataRoomInvitations(input.dataRoomId);
        }),

      create: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          email: z.string().email(),
          name: z.string().optional(),
          role: z.enum(['viewer', 'editor', 'admin']).default('viewer'),
          allowDownload: z.boolean().default(true),
          allowPrint: z.boolean().default(true),
          message: z.string().optional(),
          expiresAt: z.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const inviteCode = nanoid(16);
          const { id } = await db.createDataRoomInvitation({
            ...input,
            inviteCode,
            invitedBy: ctx.user.id,
          });

          // TODO: Send invitation email

          return { id, inviteCode };
        }),

      revoke: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.updateDataRoomInvitation(input.id, { status: 'expired' });
          return { success: true };
        }),

      updatePermissions: protectedProcedure
        .input(z.object({
          id: z.number(),
          allowedFolderIds: z.array(z.number()).nullable().optional(),
          allowedDocumentIds: z.array(z.number()).nullable().optional(),
          restrictedFolderIds: z.array(z.number()).nullable().optional(),
          restrictedDocumentIds: z.array(z.number()).nullable().optional(),
          allowDownload: z.boolean().optional(),
          allowPrint: z.boolean().optional(),
          role: z.enum(['viewer', 'editor', 'admin']).optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateDataRoomInvitationPermissions(id, data);
          return { success: true };
        }),

      resend: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          // TODO: Resend invitation email
          return { success: true };
        }),
    }),

    // Google Drive sync
    googleDrive: router({
      // List available Google Drive folders
      listFolders: protectedProcedure
        .input(z.object({ 
          parentFolderId: z.string().optional() 
        }))
        .query(async ({ ctx, input }) => {
          const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
          if (error) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
          }

          const result = await listDriveFolders(accessToken, input.parentFolderId);
          if (result.error) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
          }

          return { folders: result.folders };
        }),

      // Sync a Google Drive folder to a data room
      syncFolder: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          googleDriveFolderId: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          // Verify data room ownership
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }

          // Get valid Google OAuth token
          const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
          if (error) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
          }

          // Verify folder exists and get info
          const folderInfo = await getFolderInfo(accessToken, input.googleDriveFolderId);
          if (folderInfo.error || !folderInfo.folder) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: folderInfo.error || 'Folder not found' });
          }

          // Sync folder structure and files
          const syncResult = await syncDriveFolder(accessToken, input.googleDriveFolderId);
          if (!syncResult.success) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: syncResult.error || 'Sync failed' });
          }

          // Get existing folders and documents to avoid duplicates
          const existingFolders = await db.getDataRoomFolders(input.dataRoomId, null);
          const existingDocs = await db.getDataRoomDocuments(input.dataRoomId, null);
          const existingFoldersByDriveId = new Map(
            existingFolders
              .filter(f => f.googleDriveFolderId)
              .map(f => [f.googleDriveFolderId!, f.id])
          );
          const existingDocsByDriveId = new Map(
            existingDocs
              .filter(d => d.googleDriveFileId)
              .map(d => [d.googleDriveFileId!, d.id])
          );

          // Create folder hierarchy in data room
          const folderMap = new Map<string, number>(); // Google Drive folder ID -> data room folder ID
          
          // Sort folders by depth to ensure parents are created before children
          const sortedFolders = [...syncResult.folders].sort((a, b) => {
            const aDepth = a.parents?.length || 0;
            const bDepth = b.parents?.length || 0;
            return aDepth - bDepth;
          });
          
          // Process folders
          let foldersCreated = 0;
          for (const driveFolder of sortedFolders) {
            // Check if folder already exists
            if (existingFoldersByDriveId.has(driveFolder.id)) {
              folderMap.set(driveFolder.id, existingFoldersByDriveId.get(driveFolder.id)!);
              continue;
            }

            const parentDriveId = driveFolder.parents?.[0];
            const parentDataRoomId = parentDriveId && parentDriveId !== input.googleDriveFolderId 
              ? folderMap.get(parentDriveId) 
              : null;

            // Log warning if parent folder is missing
            if (parentDriveId && parentDriveId !== input.googleDriveFolderId && !parentDataRoomId) {
              console.warn(`[GoogleDrive Sync] Parent folder ${parentDriveId} not found for folder ${driveFolder.name}`);
            }

            const { id } = await db.createDataRoomFolder({
              dataRoomId: input.dataRoomId,
              parentId: parentDataRoomId,
              name: driveFolder.name,
              googleDriveFolderId: driveFolder.id,
            });

            folderMap.set(driveFolder.id, id);
            foldersCreated++;
          }

          // Process files
          let filesCreated = 0;
          for (const driveFile of syncResult.files) {
            // Check if file already exists
            if (existingDocsByDriveId.has(driveFile.id)) {
              continue;
            }

            const parentDriveId = driveFile.parents?.[0];
            let folderId: number | null = null;

            // Determine which folder this file belongs to
            if (parentDriveId === input.googleDriveFolderId) {
              // Root level file
              folderId = null;
            } else if (parentDriveId) {
              folderId = folderMap.get(parentDriveId) || existingFoldersByDriveId.get(parentDriveId) || null;
              
              // Log warning if parent folder is missing
              if (!folderId) {
                console.warn(`[GoogleDrive Sync] Parent folder ${parentDriveId} not found for file ${driveFile.name}`);
              }
            }

            const fileType = getSimpleFileType(driveFile.mimeType);
            const fileSize = driveFile.size && !isNaN(parseInt(driveFile.size)) 
              ? parseInt(driveFile.size) 
              : undefined;

            await db.createDataRoomDocument({
              dataRoomId: input.dataRoomId,
              folderId,
              name: driveFile.name,
              fileType,
              mimeType: driveFile.mimeType,
              fileSize,
              storageType: 'google_drive',
              googleDriveFileId: driveFile.id,
              googleDriveWebViewLink: driveFile.webViewLink,
              thumbnailUrl: driveFile.thumbnailLink,
              uploadedBy: ctx.user.id,
            });

            filesCreated++;
          }

          // Update data room with Google Drive folder ID and last sync time
          await db.updateDataRoom(input.dataRoomId, {
            googleDriveFolderId: input.googleDriveFolderId,
            lastSyncedAt: new Date(),
          });

          return {
            success: true,
            foldersCreated,
            filesCreated,
            totalFolders: syncResult.folders.length,
            totalFiles: syncResult.files.length,
          };
        }),
    }),

    // Public access endpoints (no auth required)
    public: router({
      // Access data room via link
      accessByLink: publicProcedure
        .input(z.object({
          linkCode: z.string(),
          password: z.string().optional(),
          visitorInfo: z.object({
            email: z.string().email().optional(),
            name: z.string().optional(),
            company: z.string().optional(),
          }).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const link = await db.getDataRoomLinkByCode(input.linkCode);
          if (!link) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid link' });
          }

          if (!link.isActive) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Link is no longer active' });
          }

          if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Link has expired' });
          }

          if (link.maxViews && link.viewCount >= link.maxViews) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Link view limit reached' });
          }

          // Check password
          if (link.password) {
            if (!input.password) {
              return { requiresPassword: true, dataRoomId: null, visitorId: null };
            }
            const crypto = await import('crypto');
            const hashedPassword = crypto.createHash('sha256').update(input.password).digest('hex');
            if (hashedPassword !== link.password) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' });
            }
          }

          // Check required info
          if (link.requireEmail && !input.visitorInfo?.email) {
            return { requiresInfo: true, requiredFields: ['email'], dataRoomId: null, visitorId: null };
          }
          if (link.requireName && !input.visitorInfo?.name) {
            return { requiresInfo: true, requiredFields: ['name'], dataRoomId: null, visitorId: null };
          }
          if (link.requireCompany && !input.visitorInfo?.company) {
            return { requiresInfo: true, requiredFields: ['company'], dataRoomId: null, visitorId: null };
          }

          // Create or update visitor
          let visitor = input.visitorInfo?.email 
            ? await db.getVisitorByEmail(link.dataRoomId, input.visitorInfo.email)
            : null;

          if (!visitor && input.visitorInfo?.email) {
            const { id } = await db.createDataRoomVisitor({
              dataRoomId: link.dataRoomId,
              linkId: link.id,
              email: input.visitorInfo.email,
              name: input.visitorInfo.name,
              company: input.visitorInfo.company,
              ipAddress: ctx.req.ip || null,
              userAgent: ctx.req.headers['user-agent'] || null,
            });
            visitor = await db.getDataRoomVisitors(link.dataRoomId).then(v => v.find(x => x.id === id) || null);
          }

          // Increment view count
          await db.incrementLinkViewCount(link.id);

          // Update visitor last viewed
          if (visitor) {
            await db.updateDataRoomVisitor(visitor.id, {
              lastViewedAt: new Date(),
              totalViews: (visitor.totalViews || 0) + 1,
            });
          }

          return {
            dataRoomId: link.dataRoomId,
            visitorId: visitor?.id || null,
            allowDownload: link.allowDownload,
            allowPrint: link.allowPrint,
            restrictedFolderIds: link.restrictedFolderIds as number[] | null,
            restrictedDocumentIds: link.restrictedDocumentIds as number[] | null,
          };
        }),

      // Get data room content (public access via valid link)
      getContent: publicProcedure
        .input(z.object({
          dataRoomId: z.number(),
          visitorId: z.number().optional(),
          visitorEmail: z.string().optional(),
          folderId: z.number().nullable().optional(),
        }))
        .query(async ({ input }) => {
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND' });

          // Check visitor access status if visitor ID provided
          let visitor = null;
          let invitation = null;
          if (input.visitorId) {
            visitor = await db.getDataRoomVisitorById(input.visitorId);
            if (visitor) {
              // Check if visitor is blocked or revoked
              if (visitor.accessStatus === 'blocked') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Your access has been blocked' });
              }
              if (visitor.accessStatus === 'revoked') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Your access has been revoked' });
              }
              // Get invitation for permission checks
              if (visitor.email) {
                invitation = await db.getDataRoomInvitationByEmail(input.dataRoomId, visitor.email);
              }
            }
          }

          // Check invitation-only mode
          if (room.invitationOnly && !room.isPublic) {
            const email = input.visitorEmail || visitor?.email;
            if (!email) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Email required for access' });
            }
            if (!invitation) {
              invitation = await db.getDataRoomInvitationByEmail(input.dataRoomId, email);
            }
            if (!invitation || invitation.status !== 'accepted') {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'You have not been invited to this data room' });
            }
          }

          let folders = await db.getDataRoomFolders(input.dataRoomId, input.folderId);
          let documents = await db.getDataRoomDocuments(input.dataRoomId, input.folderId);

          // Apply per-folder/document permissions if invitation has restrictions
          if (invitation) {
            const allowedFolders = invitation.allowedFolderIds as number[] | null;
            const allowedDocs = invitation.allowedDocumentIds as number[] | null;
            const restrictedFolders = invitation.restrictedFolderIds as number[] | null;
            const restrictedDocs = invitation.restrictedDocumentIds as number[] | null;

            // Filter folders
            if (allowedFolders && allowedFolders.length > 0) {
              folders = folders.filter(f => allowedFolders.includes(f.id));
            }
            if (restrictedFolders && restrictedFolders.length > 0) {
              folders = folders.filter(f => !restrictedFolders.includes(f.id));
            }

            // Filter documents
            if (allowedDocs && allowedDocs.length > 0) {
              documents = documents.filter(d => allowedDocs.includes(d.id));
            }
            if (restrictedDocs && restrictedDocs.length > 0) {
              documents = documents.filter(d => !restrictedDocs.includes(d.id));
            }
          }

          // Generate watermark data if enabled
          const visitorEmail = input.visitorEmail || visitor?.email || '';
          let watermarkData = null;
          if (room.watermarkEnabled && visitorEmail) {
            const { generateWatermarkData, generateWatermarkText } = await import('./_core/documentWatermark');
            const watermarkText = generateWatermarkText(
              visitorEmail,
              room.watermarkText || undefined,
              true // include timestamp
            );
            watermarkData = generateWatermarkData({
              text: watermarkText,
              position: 'tiled',
              opacity: 0.15,
              fontSize: 12,
            });
          }

          return {
            room: {
              name: room.name,
              description: room.description,
              welcomeMessage: room.welcomeMessage,
              logoUrl: room.logoUrl,
              brandColor: room.brandColor,
              requiresNda: room.requiresNda,
              ndaText: room.ndaText,
              invitationOnly: room.invitationOnly,
              watermarkEnabled: room.watermarkEnabled,
              watermarkText: room.watermarkText,
            },
            folders: folders.filter(f => !f.googleDriveFolderId || true),
            documents: documents.filter(d => !d.isHidden),
            visitorPermissions: invitation ? {
              allowDownload: invitation.allowDownload,
              allowPrint: invitation.allowPrint,
              role: invitation.role,
            } : null,
            watermark: watermarkData,
          };
        }),

      // Record document view
      recordView: publicProcedure
        .input(z.object({
          documentId: z.number(),
          visitorId: z.number(),
          linkId: z.number().optional(),
          duration: z.number().optional(),
          pagesViewed: z.array(z.number()).optional(),
          downloaded: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id } = await db.createDocumentView({
            documentId: input.documentId,
            visitorId: input.visitorId,
            linkId: input.linkId,
            duration: input.duration,
            pagesViewed: input.pagesViewed,
            downloaded: input.downloaded,
            deviceType: ctx.req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
          });
          return { id };
        }),
    }),
  }),

  // ============================================
  // IMAP CREDENTIALS
  // ============================================
  imapCredentials: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const credentials = await db.getImapCredentials(ctx.user.id);
      // Don't return encrypted passwords
      return credentials.map(c => ({ ...c, encryptedPassword: '********' }));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        host: z.string().min(1),
        port: z.number().default(993),
        secure: z.boolean().default(true),
        email: z.string().email(),
        password: z.string().min(1),
        folder: z.string().default('INBOX'),
        unseenOnly: z.boolean().default(true),
        markAsSeen: z.boolean().default(false),
        pollingEnabled: z.boolean().default(false),
        pollingIntervalMinutes: z.number().min(5).default(15),
      }))
      .mutation(async ({ input, ctx }) => {
        // Encrypt password
        const crypto = await import('crypto');
        const key = process.env.JWT_SECRET || 'default-key';
        const cipher = crypto.createCipheriv('aes-256-cbc', 
          crypto.createHash('sha256').update(key).digest().slice(0, 32),
          Buffer.alloc(16, 0)
        );
        let encrypted = cipher.update(input.password, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const { id } = await db.createImapCredential({
          ...input,
          userId: ctx.user.id,
          encryptedPassword: encrypted,
        });

        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        folder: z.string().optional(),
        unseenOnly: z.boolean().optional(),
        markAsSeen: z.boolean().optional(),
        pollingEnabled: z.boolean().optional(),
        pollingIntervalMinutes: z.number().min(5).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getImapCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const { id, ...data } = input;
        await db.updateImapCredential(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getImapCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        await db.deleteImapCredential(input.id);
        return { success: true };
      }),

    // Get decrypted credentials for scanning (internal use)
    getDecrypted: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const credential = await db.getImapCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Decrypt password
        const crypto = await import('crypto');
        const key = process.env.JWT_SECRET || 'default-key';
        const decipher = crypto.createDecipheriv('aes-256-cbc',
          crypto.createHash('sha256').update(key).digest().slice(0, 32),
          Buffer.alloc(16, 0)
        );
        let decrypted = decipher.update(credential.encryptedPassword, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return {
          ...credential,
          password: decrypted,
        };
      }),
  }),

  // ============================================
  // EMAIL CREDENTIALS & SCHEDULED SCANNING
  // ============================================
  emailCredentials: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const credentials = await db.getEmailCredentials(ctx.user.id);
      // Don't return passwords
      return credentials.map(c => ({ ...c, imapPassword: c.imapPassword ? '********' : null }));
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const credential = await db.getEmailCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { ...credential, imapPassword: credential.imapPassword ? '********' : null };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        provider: z.enum(['gmail', 'outlook', 'yahoo', 'icloud', 'custom']),
        email: z.string().email(),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        imapUsername: z.string().optional(),
        imapPassword: z.string().optional(),
        scanFolder: z.string().optional(),
        scanUnreadOnly: z.boolean().optional(),
        markAsRead: z.boolean().optional(),
        maxEmailsPerScan: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Encrypt password if provided
        let encryptedPassword = input.imapPassword;
        if (input.imapPassword) {
          const crypto = await import('crypto');
          const key = process.env.JWT_SECRET || 'default-key';
          const cipher = crypto.createCipheriv('aes-256-cbc',
            crypto.createHash('sha256').update(key).digest().slice(0, 32),
            Buffer.alloc(16, 0)
          );
          encryptedPassword = cipher.update(input.imapPassword, 'utf8', 'hex');
          encryptedPassword += cipher.final('hex');
        }

        const { id } = await db.createEmailCredential({
          ...input,
          userId: ctx.user.id,
          imapPassword: encryptedPassword,
        });

        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        imapUsername: z.string().optional(),
        imapPassword: z.string().optional(),
        scanFolder: z.string().optional(),
        scanUnreadOnly: z.boolean().optional(),
        markAsRead: z.boolean().optional(),
        maxEmailsPerScan: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getEmailCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const { id, imapPassword, ...data } = input;
        let updateData: any = data;

        // Encrypt new password if provided
        if (imapPassword) {
          const crypto = await import('crypto');
          const key = process.env.JWT_SECRET || 'default-key';
          const cipher = crypto.createCipheriv('aes-256-cbc',
            crypto.createHash('sha256').update(key).digest().slice(0, 32),
            Buffer.alloc(16, 0)
          );
          let encrypted = cipher.update(imapPassword, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          updateData.imapPassword = encrypted;
        }

        await db.updateEmailCredential(id, updateData);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getEmailCredentialById(input.id);
        if (!credential || credential.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        await db.deleteEmailCredential(input.id);
        return { success: true };
      }),

    testConnection: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        provider: z.enum(['gmail', 'outlook', 'yahoo', 'icloud', 'custom']),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        imapUsername: z.string().optional(),
        imapPassword: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        let config: any = input;

        // If ID provided, get stored credentials
        if (input.id) {
          const credential = await db.getEmailCredentialById(input.id);
          if (!credential || credential.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }

          // Decrypt password
          if (credential.imapPassword) {
            const crypto = await import('crypto');
            const key = process.env.JWT_SECRET || 'default-key';
            const decipher = crypto.createDecipheriv('aes-256-cbc',
              crypto.createHash('sha256').update(key).digest().slice(0, 32),
              Buffer.alloc(16, 0)
            );
            let decrypted = decipher.update(credential.imapPassword, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            config = { ...credential, imapPassword: decrypted };
          }
        }

        // Test connection using the inbox scanner
        const { testImapConnection } = await import('./_core/emailInboxScanner');
        const result = await testImapConnection({
          host: config.imapHost || '',
          port: config.imapPort || 993,
          secure: config.imapSecure ?? true,
          auth: {
            user: config.imapUsername || '',
            pass: config.imapPassword || '',
          },
        });

        return result;
      }),

    // Scheduled scans
    schedules: router({
      list: protectedProcedure
        .input(z.object({ credentialId: z.number().optional() }))
        .query(async ({ input, ctx }) => {
          // Get user's credentials first
          const credentials = await db.getEmailCredentials(ctx.user.id);
          const credentialIds = credentials.map(c => c.id);

          if (input.credentialId && !credentialIds.includes(input.credentialId)) {
            throw new TRPCError({ code: 'FORBIDDEN' });
          }

          return db.getScheduledScans(input.credentialId);
        }),

      create: protectedProcedure
        .input(z.object({
          credentialId: z.number(),
          intervalMinutes: z.number().min(5).default(15),
          isEnabled: z.boolean().default(true),
        }))
        .mutation(async ({ input, ctx }) => {
          const credential = await db.getEmailCredentialById(input.credentialId);
          if (!credential || credential.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }

          const { id } = await db.createScheduledScan(input);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          isEnabled: z.boolean().optional(),
          intervalMinutes: z.number().min(5).optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, intervalMinutes, ...data } = input;
          const updateData: any = { ...data };

          if (intervalMinutes) {
            updateData.intervalMinutes = intervalMinutes;
            updateData.nextRunAt = new Date(Date.now() + intervalMinutes * 60 * 1000);
          }

          await db.updateScheduledScan(id, updateData);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteScheduledScan(input.id);
          return { success: true };
        }),
    }),

    // Scan logs
    logs: router({
      list: protectedProcedure
        .input(z.object({ credentialId: z.number(), limit: z.number().optional() }))
        .query(async ({ input, ctx }) => {
          const credential = await db.getEmailCredentialById(input.credentialId);
          if (!credential || credential.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          return db.getScanLogs(input.credentialId, input.limit);
        }),
    }),
  }),

  // ============================================
  // NDA E-SIGNATURES
  // ============================================
  nda: router({
    // Get NDA documents for a data room
    documents: router({
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getNdaDocuments(input.dataRoomId);
        }),

      getActive: publicProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getActiveNdaDocument(input.dataRoomId);
        }),

      upload: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          name: z.string(),
          version: z.string().optional(),
          storageKey: z.string(),
          storageUrl: z.string(),
          mimeType: z.string().optional(),
          fileSize: z.number().optional(),
          pageCount: z.number().optional(),
          requiresSignature: z.boolean().optional(),
          allowTypedSignature: z.boolean().optional(),
          allowDrawnSignature: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id } = await db.createNdaDocument({
            ...input,
            uploadedBy: ctx.user.id,
          });
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          version: z.string().optional(),
          isActive: z.boolean().optional(),
          requiresSignature: z.boolean().optional(),
          allowTypedSignature: z.boolean().optional(),
          allowDrawnSignature: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateNdaDocument(id, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteNdaDocument(input.id);
          return { success: true };
        }),
    }),

    // Signatures
    signatures: router({
      list: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          status: z.string().optional(),
        }))
        .query(async ({ input }) => {
          return db.getNdaSignatures(input.dataRoomId, { status: input.status });
        }),

      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return db.getNdaSignatureById(input.id);
        }),

      // Check if visitor has signed NDA (public)
      checkSigned: publicProcedure
        .input(z.object({
          dataRoomId: z.number(),
          email: z.string().email(),
        }))
        .query(async ({ input }) => {
          const signature = await db.getVisitorNdaSignature(input.dataRoomId, input.email);
          return {
            signed: !!signature,
            signedAt: signature?.signedAt,
            signatureId: signature?.id,
          };
        }),

      // Sign NDA (public - for visitors)
      sign: publicProcedure
        .input(z.object({
          ndaDocumentId: z.number(),
          dataRoomId: z.number(),
          visitorId: z.number().optional(),
          linkId: z.number().optional(),
          signerName: z.string().min(1),
          signerEmail: z.string().email(),
          signerTitle: z.string().optional(),
          signerCompany: z.string().optional(),
          signatureType: z.enum(['typed', 'drawn']),
          signatureData: z.string(), // Base64 for drawn, typed name for typed
          consentCheckbox: z.boolean(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Get the NDA document
          const ndaDoc = await db.getNdaDocumentById(input.ndaDocumentId);
          if (!ndaDoc) throw new TRPCError({ code: 'NOT_FOUND', message: 'NDA document not found' });

          // Get IP address from request
          const ipAddress = ctx.req.headers['x-forwarded-for'] as string || ctx.req.socket.remoteAddress || 'unknown';
          const userAgent = ctx.req.headers['user-agent'] || '';

          // Store signature image if drawn
          let signatureImageUrl: string | undefined;
          if (input.signatureType === 'drawn' && input.signatureData.startsWith('data:image')) {
            const { storagePut } = await import('./storage');
            const base64Data = input.signatureData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const key = `signatures/${input.dataRoomId}/${Date.now()}-${input.signerEmail.replace('@', '_')}.png`;
            const { url } = await storagePut(key, buffer, 'image/png');
            signatureImageUrl = url;
          }

          // Create the signature record
          const { id } = await db.createNdaSignature({
            ndaDocumentId: input.ndaDocumentId,
            dataRoomId: input.dataRoomId,
            visitorId: input.visitorId,
            linkId: input.linkId,
            signerName: input.signerName,
            signerEmail: input.signerEmail,
            signerTitle: input.signerTitle,
            signerCompany: input.signerCompany,
            signatureType: input.signatureType,
            signatureData: input.signatureType === 'typed' ? input.signerName : input.signatureData,
            signatureImageUrl,
            ipAddress,
            userAgent,
            consentCheckbox: input.consentCheckbox,
          });

          // Create audit log
          await db.createNdaAuditLog({
            signatureId: id,
            action: 'completed_signature',
            ipAddress,
            userAgent,
            details: { signatureType: input.signatureType },
          });

          // Update visitor NDA status and link signature
          if (input.visitorId) {
            await db.updateDataRoomVisitor(input.visitorId, {
              ndaAcceptedAt: new Date(),
              ndaIpAddress: ipAddress,
            });
            // Link visitor to their NDA signature
            await db.linkVisitorToNdaSignature(input.visitorId, id);
          }

          // Send signed NDA copy to visitor via email
          try {
            const { sendEmail } = await import('./_core/email');
            const room = await db.getDataRoomById(input.dataRoomId);
            const roomName = room?.name || 'Data Room';
            
            await sendEmail({
              to: input.signerEmail,
              subject: `Your Signed NDA for ${roomName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>NDA Signed Successfully</h2>
                  <p>Dear ${input.signerName},</p>
                  <p>Thank you for signing the Non-Disclosure Agreement for <strong>${roomName}</strong>.</p>
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Signature Details</h3>
                    <p><strong>Document:</strong> ${ndaDoc.name}</p>
                    <p><strong>Signed By:</strong> ${input.signerName}</p>
                    ${input.signerTitle ? `<p><strong>Title:</strong> ${input.signerTitle}</p>` : ''}
                    ${input.signerCompany ? `<p><strong>Company:</strong> ${input.signerCompany}</p>` : ''}
                    <p><strong>Email:</strong> ${input.signerEmail}</p>
                    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>IP Address:</strong> ${ipAddress}</p>
                    <p><strong>Signature ID:</strong> ${id}</p>
                  </div>
                  ${signatureImageUrl ? `<p><strong>Your Signature:</strong></p><img src="${signatureImageUrl}" alt="Signature" style="max-width: 300px; border: 1px solid #ddd; padding: 10px;" />` : ''}
                  <p style="color: #666; font-size: 12px;">This email serves as your confirmation of signing. Please keep it for your records.</p>
                  <p style="color: #666; font-size: 12px;">If you have any questions, please contact the data room administrator.</p>
                </div>
              `,
            });
          } catch (emailError) {
            console.error('Failed to send NDA confirmation email:', emailError);
            // Don't fail the signature if email fails
          }

          return { id, success: true };
        }),

      // Revoke signature (admin only)
      revoke: protectedProcedure
        .input(z.object({
          id: z.number(),
          reason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          await db.updateNdaSignature(input.id, {
            status: 'revoked',
            revokedAt: new Date(),
            revokedReason: input.reason,
          });

          // Create audit log
          await db.createNdaAuditLog({
            signatureId: input.id,
            action: 'signature_revoked',
            details: { reason: input.reason, revokedBy: ctx.user.id },
          });

          return { success: true };
        }),

      // Get audit log for a signature
      auditLog: protectedProcedure
        .input(z.object({ signatureId: z.number() }))
        .query(async ({ input }) => {
          return db.getNdaAuditLogs(input.signatureId);
        }),
    }),

    // ============================================
    // GOOGLE DRIVE SYNC
    // ============================================
    driveSync: router({
      // Get sync configuration for a data room
      getConfig: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getDriveSyncConfig(input.dataRoomId);
        }),

      // Create or update sync configuration
      saveConfig: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          googleDriveFolderId: z.string(),
          googleDriveFolderName: z.string().optional(),
          googleDriveFolderUrl: z.string().optional(),
          syncEnabled: z.boolean().default(true),
          syncFrequencyMinutes: z.number().default(60),
          syncMode: z.enum(['one_way_import', 'one_way_export', 'bidirectional']).default('one_way_import'),
          syncSubfolders: z.boolean().default(true),
          includeFileTypes: z.array(z.string()).optional(),
          excludeFileTypes: z.array(z.string()).optional(),
          maxFileSizeMb: z.number().default(100),
        }))
        .mutation(async ({ input, ctx }) => {
          const existingConfig = await db.getDriveSyncConfig(input.dataRoomId);

          const configData = {
            dataRoomId: input.dataRoomId,
            googleDriveFolderId: input.googleDriveFolderId,
            googleDriveFolderName: input.googleDriveFolderName,
            googleDriveFolderUrl: input.googleDriveFolderUrl,
            syncEnabled: input.syncEnabled,
            syncFrequencyMinutes: input.syncFrequencyMinutes,
            syncMode: input.syncMode,
            syncSubfolders: input.syncSubfolders,
            includeFileTypes: input.includeFileTypes ? JSON.stringify(input.includeFileTypes) : null,
            excludeFileTypes: input.excludeFileTypes ? JSON.stringify(input.excludeFileTypes) : null,
            maxFileSizeMb: input.maxFileSizeMb,
            syncUserId: ctx.user.id,
          };

          if (existingConfig) {
            await db.updateDriveSyncConfig(existingConfig.id, configData);
            return { id: existingConfig.id, updated: true };
          } else {
            const id = await db.createDriveSyncConfig(configData as any);
            return { id, updated: false };
          }
        }),

      // Delete sync configuration
      deleteConfig: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteDriveSyncConfig(input.dataRoomId);
          return { success: true };
        }),

      // Get sync logs
      getLogs: protectedProcedure
        .input(z.object({ dataRoomId: z.number(), limit: z.number().default(50) }))
        .query(async ({ input }) => {
          return db.getDriveSyncLogs(input.dataRoomId, input.limit);
        }),

      // Trigger manual sync
      syncNow: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const config = await db.getDriveSyncConfig(input.dataRoomId);
          if (!config) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'No sync configuration found for this data room' });
          }

          // Create sync log entry
          const logId = await db.createDriveSyncLog({
            dataRoomId: input.dataRoomId,
            syncConfigId: config.id,
            syncType: 'manual',
            status: 'started',
            triggeredBy: ctx.user.id,
          });

          try {
            // Get user's Google OAuth token
            const token = await db.getGoogleOAuthTokenByUserId(ctx.user.id);
            if (!token) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google Drive not connected. Please connect your Google account first.' });
            }

            // Import Google Drive sync service
            const { syncGoogleDriveFolder } = await import('./googleDriveSyncService');

            const result = await syncGoogleDriveFolder({
              dataRoomId: input.dataRoomId,
              folderId: config.googleDriveFolderId,
              accessToken: token.accessToken,
              refreshToken: token.refreshToken || undefined,
              syncSubfolders: config.syncSubfolders,
              includeFileTypes: config.includeFileTypes ? JSON.parse(config.includeFileTypes) : undefined,
              excludeFileTypes: config.excludeFileTypes ? JSON.parse(config.excludeFileTypes) : undefined,
              maxFileSizeMb: config.maxFileSizeMb || 100,
            });

            // Update sync log with results
            await db.updateDriveSyncLog(logId, {
              status: 'completed',
              completedAt: new Date(),
              filesScanned: result.filesScanned,
              filesAdded: result.filesAdded,
              filesUpdated: result.filesUpdated,
              filesSkipped: result.filesSkipped,
              foldersCreated: result.foldersCreated,
              durationMs: result.durationMs,
              warnings: result.warnings?.length ? JSON.stringify(result.warnings) : null,
            });

            // Update config last sync status
            await db.updateDriveSyncConfig(config.id, {
              lastSyncAt: new Date(),
              lastSyncStatus: 'success',
              lastSyncFilesAdded: result.filesAdded,
              lastSyncFilesUpdated: result.filesUpdated,
            });

            return { success: true, ...result };
          } catch (error: any) {
            await db.updateDriveSyncLog(logId, {
              status: 'failed',
              completedAt: new Date(),
              errors: JSON.stringify([error.message]),
            });

            await db.updateDriveSyncConfig(config.id, {
              lastSyncStatus: 'failed',
              lastSyncError: error.message,
            });

            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
          }
        }),

      // List folders in Google Drive for selection
      listDriveFolders: protectedProcedure
        .input(z.object({ parentId: z.string().optional() }))
        .query(async ({ input, ctx }) => {
          const token = await db.getGoogleOAuthTokenByUserId(ctx.user.id);
          if (!token) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google Drive not connected' });
          }

          const { listGoogleDriveFolders } = await import('./googleDriveSyncService');
          return listGoogleDriveFolders(token.accessToken, input.parentId);
        }),
    }),

    // ============================================
    // PAGE-LEVEL TRACKING
    // ============================================
    pageTracking: router({
      // Record page view (public - for visitors)
      recordPageView: publicProcedure
        .input(z.object({
          documentId: z.number(),
          visitorId: z.number(),
          sessionId: z.number().optional(),
          linkId: z.number().optional(),
          pageNumber: z.number(),
          pageLabel: z.string().optional(),
          durationMs: z.number().optional(),
          scrollDepth: z.number().optional(),
          mouseMovements: z.number().optional(),
          clicks: z.number().optional(),
          zoomLevel: z.number().optional(),
          deviceType: z.string().optional(),
          screenWidth: z.number().optional(),
          screenHeight: z.number().optional(),
          viewportWidth: z.number().optional(),
          viewportHeight: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          const id = await db.createDocumentPageView({
            documentId: input.documentId,
            visitorId: input.visitorId,
            viewSessionId: input.sessionId,
            linkId: input.linkId,
            pageNumber: input.pageNumber,
            pageLabel: input.pageLabel,
            durationMs: input.durationMs || 0,
            scrollDepth: input.scrollDepth,
            mouseMovements: input.mouseMovements,
            clicks: input.clicks,
            zoomLevel: input.zoomLevel,
            deviceType: input.deviceType,
            screenWidth: input.screenWidth,
            screenHeight: input.screenHeight,
            viewportWidth: input.viewportWidth,
            viewportHeight: input.viewportHeight,
          });
          return { id };
        }),

      // Update page view (when visitor leaves page)
      updatePageView: publicProcedure
        .input(z.object({
          id: z.number(),
          durationMs: z.number(),
          scrollDepth: z.number().optional(),
          mouseMovements: z.number().optional(),
          clicks: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          await db.updateDocumentPageView(input.id, {
            exitTime: new Date(),
            durationMs: input.durationMs,
            scrollDepth: input.scrollDepth,
            mouseMovements: input.mouseMovements,
            clicks: input.clicks,
          });
          return { success: true };
        }),

      // Get page views for a document (admin)
      getForDocument: protectedProcedure
        .input(z.object({ documentId: z.number(), visitorId: z.number().optional() }))
        .query(async ({ input }) => {
          return db.getDocumentPageViews(input.documentId, input.visitorId);
        }),

      // Get page views by visitor (admin)
      getByVisitor: protectedProcedure
        .input(z.object({ visitorId: z.number() }))
        .query(async ({ input }) => {
          return db.getPageViewsByVisitor(input.visitorId);
        }),
    }),

    // ============================================
    // VISITOR SESSIONS
    // ============================================
    sessions: router({
      // Start a new session (public)
      start: publicProcedure
        .input(z.object({
          dataRoomId: z.number(),
          visitorId: z.number(),
          linkId: z.number().optional(),
          deviceType: z.string().optional(),
          browser: z.string().optional(),
          browserVersion: z.string().optional(),
          os: z.string().optional(),
          osVersion: z.string().optional(),
          screenResolution: z.string().optional(),
          referrer: z.string().optional(),
          utmSource: z.string().optional(),
          utmMedium: z.string().optional(),
          utmCampaign: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          const ipAddress = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0] || ctx.req.socket.remoteAddress || '';

          const id = await db.createVisitorSession({
            dataRoomId: input.dataRoomId,
            visitorId: input.visitorId,
            linkId: input.linkId,
            sessionToken,
            deviceType: input.deviceType,
            browser: input.browser,
            browserVersion: input.browserVersion,
            os: input.os,
            osVersion: input.osVersion,
            screenResolution: input.screenResolution,
            ipAddress,
            referrer: input.referrer,
            utmSource: input.utmSource,
            utmMedium: input.utmMedium,
            utmCampaign: input.utmCampaign,
          });

          return { id, sessionToken };
        }),

      // Update session activity (public)
      updateActivity: publicProcedure
        .input(z.object({
          sessionToken: z.string(),
          documentsViewed: z.number().optional(),
          pagesViewed: z.number().optional(),
          totalScrollDistance: z.number().optional(),
          totalClicks: z.number().optional(),
          downloadsCount: z.number().optional(),
          printsCount: z.number().optional(),
          activeDurationMs: z.number().optional(),
          idleDurationMs: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          const session = await db.getSessionByToken(input.sessionToken);
          if (!session) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
          }

          const { sessionToken, ...updateData } = input;
          await db.updateVisitorSession(session.id, {
            ...updateData,
            totalDurationMs: (updateData.activeDurationMs || 0) + (updateData.idleDurationMs || 0),
          });

          return { success: true };
        }),

      // End session (public)
      end: publicProcedure
        .input(z.object({
          sessionToken: z.string(),
          totalDurationMs: z.number(),
          activeDurationMs: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          const session = await db.getSessionByToken(input.sessionToken);
          if (!session) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
          }

          await db.updateVisitorSession(session.id, {
            sessionEndAt: new Date(),
            totalDurationMs: input.totalDurationMs,
            activeDurationMs: input.activeDurationMs,
            isActive: false,
          });

          return { success: true };
        }),

      // Get sessions for a data room (admin)
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number(), limit: z.number().default(100) }))
        .query(async ({ input }) => {
          return db.getDataRoomSessions(input.dataRoomId, input.limit);
        }),

      // Get sessions for a visitor (admin)
      getByVisitor: protectedProcedure
        .input(z.object({ visitorId: z.number() }))
        .query(async ({ input }) => {
          return db.getVisitorSessions(input.visitorId);
        }),
    }),

    // ============================================
    // EMAIL ACCESS RULES
    // ============================================
    emailRules: router({
      // List rules for a data room
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getEmailAccessRules(input.dataRoomId);
        }),

      // Create a new rule
      create: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          ruleType: z.enum(['allow_email', 'allow_domain', 'block_email', 'block_domain']),
          emailPattern: z.string(),
          allowDownload: z.boolean().default(true),
          allowPrint: z.boolean().default(true),
          maxViews: z.number().optional(),
          expiresAt: z.date().optional(),
          requireNdaSignature: z.boolean().default(true),
          autoApprove: z.boolean().default(false),
          notifyOnAccess: z.boolean().default(true),
          notifyEmail: z.string().optional(),
          priority: z.number().default(0),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createEmailAccessRule({
            ...input,
            createdBy: ctx.user.id,
          });
          return { id };
        }),

      // Update a rule
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          ruleType: z.enum(['allow_email', 'allow_domain', 'block_email', 'block_domain']).optional(),
          emailPattern: z.string().optional(),
          allowDownload: z.boolean().optional(),
          allowPrint: z.boolean().optional(),
          maxViews: z.number().optional(),
          expiresAt: z.date().optional(),
          requireNdaSignature: z.boolean().optional(),
          autoApprove: z.boolean().optional(),
          notifyOnAccess: z.boolean().optional(),
          notifyEmail: z.string().optional(),
          priority: z.number().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateEmailAccessRule(id, data);
          return { success: true };
        }),

      // Delete a rule
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteEmailAccessRule(input.id);
          return { success: true };
        }),

      // Check if an email has access (for public access flow)
      checkAccess: publicProcedure
        .input(z.object({ dataRoomId: z.number(), email: z.string() }))
        .query(async ({ input }) => {
          return db.checkEmailAccess(input.dataRoomId, input.email);
        }),
    }),

    // ============================================
    // DETAILED ANALYTICS
    // ============================================
    detailedAnalytics: router({
      // Get page-level analytics for a data room
      getPageAnalytics: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getPageViewAnalytics(input.dataRoomId);
        }),

      // Get detailed analytics for a specific visitor
      getVisitorDetails: protectedProcedure
        .input(z.object({ dataRoomId: z.number(), visitorId: z.number() }))
        .query(async ({ input }) => {
          return db.getDetailedVisitorAnalytics(input.dataRoomId, input.visitorId);
        }),

      // Get engagement report for a data room
      getEngagementReport: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        }))
        .query(async ({ input }) => {
          return db.getDataRoomEngagementReport(input.dataRoomId, input.startDate, input.endDate);
        }),

      // Get document-level heatmap data (which pages are most viewed)
      getDocumentHeatmap: protectedProcedure
        .input(z.object({ documentId: z.number() }))
        .query(async ({ input }) => {
          const pageViews = await db.getDocumentPageViews(input.documentId);

          // Aggregate by page number
          const pageStats: Record<number, { views: number; totalDuration: number; uniqueVisitors: Set<number> }> = {};

          pageViews.forEach(pv => {
            if (!pageStats[pv.pageNumber]) {
              pageStats[pv.pageNumber] = { views: 0, totalDuration: 0, uniqueVisitors: new Set() };
            }
            pageStats[pv.pageNumber].views++;
            pageStats[pv.pageNumber].totalDuration += pv.durationMs || 0;
            pageStats[pv.pageNumber].uniqueVisitors.add(pv.visitorId);
          });

          return Object.entries(pageStats).map(([page, stats]) => ({
            pageNumber: parseInt(page),
            views: stats.views,
            totalDurationMs: stats.totalDuration,
            avgDurationMs: stats.views > 0 ? stats.totalDuration / stats.views : 0,
            uniqueVisitors: stats.uniqueVisitors.size,
          })).sort((a, b) => a.pageNumber - b.pageNumber);
        }),

      // Export analytics as CSV
      exportCsv: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          type: z.enum(['visitors', 'documents', 'sessions', 'pageViews']),
        }))
        .mutation(async ({ input }) => {
          const report = await db.getDataRoomEngagementReport(input.dataRoomId);
          if (!report) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          }

          let csv = '';
          let filename = '';

          if (input.type === 'visitors') {
            filename = `visitors_${input.dataRoomId}_${Date.now()}.csv`;
            csv = 'Email,Name,Company,Status,Sessions,Total Time (min),Documents Viewed,Pages Viewed,NDA Signed,Last Activity\n';
            report.visitorEngagement.forEach(v => {
              csv += `"${v.email || ''}","${v.name || ''}","${v.company || ''}","${v.accessStatus}",${v.sessionsCount},${Math.round(v.totalTimeMs / 60000)},${v.documentsViewed},${v.pagesViewed},"${v.ndaAcceptedAt ? 'Yes' : 'No'}","${v.lastActivity || ''}"\n`;
            });
          } else if (input.type === 'documents') {
            filename = `documents_${input.dataRoomId}_${Date.now()}.csv`;
            csv = 'Document,Pages,Views,Unique Visitors,Total Time (min),Avg Time per Page (sec)\n';
            report.documentEngagement.forEach(d => {
              csv += `"${d.documentName}",${d.pageCount},${d.views},${d.uniqueVisitors},${Math.round(d.totalTimeMs / 60000)},${Math.round(d.avgTimePerPageMs / 1000)}\n`;
            });
          }

          return { csv, filename };
        }),
    }),
  }),

  // ============================================
  // RECURRING INVOICES
  // ============================================
  recurringInvoices: router({
    list: financeProcedure
      .input(z.object({
        customerId: z.number().optional(),
        isActive: z.boolean().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecurringInvoices(input);
      }),
    getById: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRecurringInvoiceWithItems(input.id);
      }),
    create: financeProcedure
      .input(z.object({
        customerId: z.number(),
        templateName: z.string(),
        description: z.string().optional(),
        frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annually']),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        startDate: z.date(),
        endDate: z.date().optional(),
        currency: z.string().default('USD'),
        autoSend: z.boolean().default(false),
        daysUntilDue: z.number().default(30),
        notes: z.string().optional(),
        terms: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...invoiceData } = input;
        
        // Calculate totals
        let subtotal = 0;
        let taxAmount = 0;
        const processedItems = items.map(item => {
          const qty = parseFloat(item.quantity) || 0;
          const price = parseFloat(item.unitPrice) || 0;
          const lineTotal = qty * price;
          const lineTax = item.taxRate ? lineTotal * (parseFloat(item.taxRate) / 100) : 0;
          subtotal += lineTotal;
          taxAmount += lineTax;
          return { ...item, totalAmount: (lineTotal + lineTax).toString(), taxAmount: lineTax.toString() };
        });
        
        const totalAmount = subtotal + taxAmount;
        
        // Calculate next generation date
        const nextGenerationDate = new Date(input.startDate);
        
        const result = await db.createRecurringInvoice({
          ...invoiceData,
          subtotal: subtotal.toString(),
          taxAmount: taxAmount.toString(),
          totalAmount: totalAmount.toString(),
          nextGenerationDate,
          createdBy: ctx.user.id,
        });
        
        // Create line items
        for (const item of processedItems) {
          await db.createRecurringInvoiceItem({
            recurringInvoiceId: result.id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          });
        }
        
        await createAuditLog(ctx.user.id, 'create', 'recurring_invoice', result.id, input.templateName);
        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        templateName: z.string().optional(),
        description: z.string().optional(),
        frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annually']).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        endDate: z.date().optional(),
        autoSend: z.boolean().optional(),
        daysUntilDue: z.number().optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateRecurringInvoice(id, data);
        await createAuditLog(ctx.user.id, 'update', 'recurring_invoice', id);
        return { success: true };
      }),
    generateNow: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const recurring = await db.getRecurringInvoiceWithItems(input.id);
        if (!recurring) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recurring invoice not found' });
        
        // Generate invoice number
        const invoiceNumber = `INV-${Date.now()}`;
        const issueDate = new Date();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (recurring.daysUntilDue || 30));
        
        // Create the invoice
        const invoiceResult = await db.createInvoice({
          companyId: recurring.companyId,
          customerId: recurring.customerId,
          invoiceNumber,
          type: 'invoice',
          status: 'draft',
          issueDate,
          dueDate,
          subtotal: recurring.subtotal,
          taxAmount: recurring.taxAmount,
          discountAmount: recurring.discountAmount,
          totalAmount: recurring.totalAmount,
          currency: recurring.currency,
          notes: recurring.notes,
          terms: recurring.terms,
          createdBy: ctx.user.id,
        });
        
        // Create invoice items
        for (const item of recurring.items || []) {
          await db.createInvoiceItem({
            invoiceId: invoiceResult.id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          });
        }
        
        // Update recurring invoice
        const nextDate = calculateNextGenerationDate(recurring.frequency, recurring.dayOfWeek, recurring.dayOfMonth);
        await db.updateRecurringInvoice(input.id, {
          lastGeneratedAt: new Date(),
          nextGenerationDate: nextDate,
          generationCount: (recurring.generationCount || 0) + 1,
        });
        
        // Record history
        await db.createRecurringInvoiceHistory({
          recurringInvoiceId: input.id,
          generatedInvoiceId: invoiceResult.id,
          scheduledFor: issueDate,
          status: 'generated',
        });
        
        await createAuditLog(ctx.user.id, 'create', 'invoice', invoiceResult.id, `Generated from recurring: ${recurring.templateName}`);
        
        return { invoiceId: invoiceResult.id, invoiceNumber };
      }),
    history: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRecurringInvoiceHistory(input.id);
      }),
    toggleActive: financeProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateRecurringInvoice(input.id, { isActive: input.isActive });
        await createAuditLog(ctx.user.id, 'update', 'recurring_invoice', input.id, input.isActive ? 'Activated' : 'Paused');
        return { success: true };
      }),
  }),

  // ============================================
  // SUPPLIER PORTAL (PUBLIC)
  // ============================================
  supplierPortal: router({
    getSession: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session) return null;
        if (new Date(session.expiresAt) < new Date()) {
          await db.updateSupplierPortalSession(session.id, { status: 'expired' });
          return null;
        }
        const po = await db.getPurchaseOrderWithItems(session.purchaseOrderId);
        return { ...session, purchaseOrder: po };
      }),
    getDocuments: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session) return [];
        return db.getSupplierDocuments({ portalSessionId: session.id });
      }),
    getFreightInfo: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session) return null;
        return db.getSupplierFreightInfo(session.purchaseOrderId);
      }),
    uploadDocument: publicProcedure
      .input(z.object({
        token: z.string(),
        documentType: z.string(),
        fileName: z.string(),
        fileData: z.string(), // base64
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        // Upload to S3
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `supplier-docs/${session.purchaseOrderId}/${input.documentType}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType || 'application/octet-stream');
        // Save to database
        return db.createSupplierDocument({
          portalSessionId: session.id,
          purchaseOrderId: session.purchaseOrderId,
          vendorId: session.vendorId,
          documentType: input.documentType,
          fileName: input.fileName,
          fileUrl: url,
          fileSize: buffer.length,
          mimeType: input.mimeType,
        });
      }),
    saveFreightInfo: publicProcedure
      .input(z.object({
        token: z.string(),
        totalPackages: z.number().optional(),
        totalGrossWeight: z.string().optional(),
        totalNetWeight: z.string().optional(),
        weightUnit: z.string().optional(),
        totalVolume: z.string().optional(),
        volumeUnit: z.string().optional(),
        packageDimensions: z.string().optional(),
        hsCodes: z.string().optional(),
        preferredShipDate: z.date().optional(),
        preferredCarrier: z.string().optional(),
        incoterms: z.string().optional(),
        specialInstructions: z.string().optional(),
        hasDangerousGoods: z.boolean().optional(),
        dangerousGoodsClass: z.string().optional(),
        unNumber: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        const { token, ...data } = input;
        const existing = await db.getSupplierFreightInfo(session.purchaseOrderId);
        if (existing) {
          await db.updateSupplierFreightInfo(existing.id, data);
          return { success: true, id: existing.id };
        } else {
          const result = await db.createSupplierFreightInfo({
            portalSessionId: session.id,
            purchaseOrderId: session.purchaseOrderId,
            vendorId: session.vendorId,
            ...data,
          });
          return { success: true, id: result.id };
        }
      }),
    completeSubmission: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        await db.updateSupplierPortalSession(session.id, { status: 'completed', completedAt: new Date() });
        // Update PO status
        await db.updatePurchaseOrder(session.purchaseOrderId, { status: 'confirmed' });
        return { success: true };
      }),
  }),

  // ============================================
  // DOCUMENT IMPORT
  // ============================================
  documentImport: router({
    // Parse uploaded document to extract data
    parse: protectedProcedure
      .input(z.object({
        fileData: z.string(), // base64 encoded file
        fileName: z.string(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Upload to S3 first
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `document-imports/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType || 'application/octet-stream');
        
        // Determine the mime type for LLM
        const mimeType = input.mimeType || 'application/pdf';
        
        // Parse the document using LLM with file_url
        const result = await parseUploadedDocument(url, input.fileName, undefined, mimeType);
        return { ...result, fileUrl: url };
      }),

    // Import a purchase order
    importPO: protectedProcedure
      .input(z.object({
        poData: z.object({
          poNumber: z.string(),
          vendorName: z.string(),
          vendorEmail: z.string().optional(),
          orderDate: z.string(),
          deliveryDate: z.string().optional(),
          subtotal: z.number(),
          totalAmount: z.number(),
          notes: z.string().optional(),
          status: z.string().optional(),
          lineItems: z.array(z.object({
            description: z.string(),
            sku: z.string().optional(),
            quantity: z.number(),
            unit: z.string().optional(),
            unitPrice: z.number(),
            totalPrice: z.number(),
          })),
        }),
        markAsReceived: z.boolean().default(false),
        updateInventory: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        return importPurchaseOrder(input.poData as any, ctx.user.id, input.markAsReceived);
      }),

    // Import a freight invoice
    importFreightInvoice: protectedProcedure
      .input(z.object({
        invoiceData: z.object({
          invoiceNumber: z.string(),
          carrierName: z.string(),
          carrierEmail: z.string().optional(),
          invoiceDate: z.string(),
          shipmentDate: z.string().optional(),
          deliveryDate: z.string().optional(),
          origin: z.string().optional(),
          destination: z.string().optional(),
          trackingNumber: z.string().optional(),
          weight: z.string().optional(),
          dimensions: z.string().optional(),
          freightCharges: z.number(),
          fuelSurcharge: z.number().optional(),
          accessorialCharges: z.number().optional(),
          totalAmount: z.number(),
          currency: z.string().optional(),
          relatedPoNumber: z.string().optional(),
          notes: z.string().optional(),
        }),
        linkToPO: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        return importFreightInvoice(input.invoiceData as any, ctx.user.id);
      }),

    // Import a vendor invoice
    importVendorInvoice: protectedProcedure
      .input(z.object({
        invoiceData: z.object({
          invoiceNumber: z.string(),
          vendorName: z.string(),
          vendorEmail: z.string().optional(),
          invoiceDate: z.string(),
          dueDate: z.string().optional(),
          lineItems: z.array(z.object({
            description: z.string(),
            sku: z.string().optional(),
            quantity: z.number(),
            unit: z.string().optional(),
            unitPrice: z.number(),
            totalPrice: z.number(),
          })),
          subtotal: z.number(),
          taxAmount: z.number().optional(),
          shippingAmount: z.number().optional(),
          totalAmount: z.number(),
          currency: z.string().optional(),
          relatedPoNumber: z.string().optional(),
          paymentTerms: z.string().optional(),
          notes: z.string().optional(),
        }),
        markAsReceived: z.boolean().default(false),
        updateInventory: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        return importVendorInvoice(input.invoiceData as any, ctx.user.id, input.markAsReceived);
      }),

    // Import a customs document
    importCustomsDocument: protectedProcedure
      .input(z.object({
        documentData: z.object({
          documentNumber: z.string(),
          documentType: z.enum(["bill_of_lading", "customs_entry", "commercial_invoice", "packing_list", "certificate_of_origin", "import_permit", "other"]),
          entryDate: z.string(),
          shipperName: z.string(),
          shipperCountry: z.string().optional(),
          consigneeName: z.string(),
          consigneeCountry: z.string().optional(),
          countryOfOrigin: z.string(),
          portOfEntry: z.string().optional(),
          portOfExit: z.string().optional(),
          vesselName: z.string().optional(),
          voyageNumber: z.string().optional(),
          containerNumber: z.string().optional(),
          lineItems: z.array(z.object({
            description: z.string(),
            hsCode: z.string().optional(),
            quantity: z.number(),
            unit: z.string().optional(),
            declaredValue: z.number(),
            dutyRate: z.number().optional(),
            dutyAmount: z.number().optional(),
            countryOfOrigin: z.string().optional(),
          })),
          totalDeclaredValue: z.number(),
          totalDuties: z.number().optional(),
          totalTaxes: z.number().optional(),
          totalCharges: z.number(),
          currency: z.string().optional(),
          brokerName: z.string().optional(),
          brokerReference: z.string().optional(),
          relatedPoNumber: z.string().optional(),
          trackingNumber: z.string().optional(),
          notes: z.string().optional(),
        }),
        linkToPO: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        return importCustomsDocument(input.documentData as any, ctx.user.id);
      }),

    // Get import history
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input }) => {
        return db.getDocumentImportLogs(input.limit);
      }),

    // Match line items to existing materials
    matchMaterials: protectedProcedure
      .input(z.object({
        lineItems: z.array(z.object({
          description: z.string(),
          sku: z.string().optional(),
          quantity: z.number(),
          unit: z.string().optional(),
          unitPrice: z.number(),
          totalPrice: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        return matchLineItemsToMaterials(input.lineItems);
      }),

    // List folders from Google Drive
    listDriveFolders: protectedProcedure
      .input(z.object({ 
        parentFolderId: z.string().optional(),
        pageToken: z.string().optional() 
      }).optional())
      .query(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          // Return empty result instead of throwing error
          return { folders: [], nextPageToken: undefined, notConnected: true };
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        // Build query for folders
        const parentQuery = input?.parentFolderId 
          ? `'${input.parentFolderId}' in parents` 
          : `'root' in parents`;
        const query = `mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
        
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=name&pageSize=100${input?.pageToken ? `&pageToken=${input.pageToken}` : ''}`;
        
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google token expired. Please reconnect your account.' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list folders' });
        }
        
        const data = await response.json();
        return {
          folders: data.files || [],
          nextPageToken: data.nextPageToken,
          notConnected: false,
        };
      }),

    // List files in a Google Drive folder (PDFs, Excel, CSV, images)
    listDriveFiles: protectedProcedure
      .input(z.object({ 
        folderId: z.string(),
        pageToken: z.string().optional() 
      }))
      .query(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          // Return empty result instead of throwing error
          return { files: [], nextPageToken: undefined, notConnected: true };
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        // Query for supported file types
        const mimeTypes = [
          "mimeType='application/pdf'",
          "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
          "mimeType='application/vnd.ms-excel'",
          "mimeType='text/csv'",
          "mimeType='image/jpeg'",
          "mimeType='image/png'",
        ].join(' or ');
        const query = `'${input.folderId}' in parents and (${mimeTypes}) and trashed=false`;
        
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=name&pageSize=100${input.pageToken ? `&pageToken=${input.pageToken}` : ''}`;
        
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google token expired. Please reconnect your account.' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list files' });
        }
        
        const data = await response.json();
        return {
          files: data.files || [],
          nextPageToken: data.nextPageToken,
          notConnected: false,
        };
      }),

    // Download and parse a file from Google Drive
    parseFromDrive: protectedProcedure
      .input(z.object({
        fileId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google account not connected. Please connect your Google account first.' });
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        // Download file content
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${input.fileId}?alt=media`;
        const response = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to download file from Google Drive' });
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Upload to S3
        const fileKey = `document-imports/gdrive-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        // Parse the document
        const result = await parseUploadedDocument(url, input.fileName);
        return { ...result, fileUrl: url, sourceFileId: input.fileId };
      }),

    // Batch parse multiple files from Google Drive
    batchParseFromDrive: protectedProcedure
      .input(z.object({
        files: z.array(z.object({
          fileId: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google account not connected. Please connect your Google account first.' });
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        const results: Array<{
          fileId: string;
          fileName: string;
          success: boolean;
          data?: any;
          error?: string;
        }> = [];
        
        for (const file of input.files) {
          try {
            // Download file content
            const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.fileId}?alt=media`;
            const response = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            
            if (!response.ok) {
              results.push({
                fileId: file.fileId,
                fileName: file.fileName,
                success: false,
                error: 'Failed to download file',
              });
              continue;
            }
            
            const buffer = Buffer.from(await response.arrayBuffer());
            
            // Upload to S3
            const fileKey = `document-imports/gdrive-${Date.now()}-${file.fileName}`;
            const { url } = await storagePut(fileKey, buffer, file.mimeType);
            
            // Parse the document
            const parseResult = await parseUploadedDocument(url, file.fileName);
            
            results.push({
              fileId: file.fileId,
              fileName: file.fileName,
              success: true,
              data: { ...parseResult, fileUrl: url },
            });
          } catch (error: any) {
            results.push({
              fileId: file.fileId,
              fileName: file.fileName,
              success: false,
              error: error.message || 'Unknown error',
            });
          }
        }
        
        return { results };
      }),
  }),

  // ============================================
  // CRM MODULE - Contacts, Messaging & Tracking
  // ============================================
  crm: router({
    // --- CONTACTS ---
    contacts: router({
      list: protectedProcedure
        .input(z.object({
          contactType: z.string().optional(),
          status: z.string().optional(),
          source: z.string().optional(),
          pipelineStage: z.string().optional(),
          assignedTo: z.number().optional(),
          search: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getCrmContacts(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCrmContactById(input.id)),

      getByEmail: protectedProcedure
        .input(z.object({ email: z.string() }))
        .query(({ input }) => db.getCrmContactByEmail(input.email)),

      create: protectedProcedure
        .input(z.object({
          firstName: z.string().min(1),
          lastName: z.string().optional(),
          fullName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          whatsappNumber: z.string().optional(),
          linkedinUrl: z.string().optional(),
          organization: z.string().optional(),
          jobTitle: z.string().optional(),
          department: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postalCode: z.string().optional(),
          contactType: z.enum(["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"]).optional(),
          source: z.enum(["iphone_bump", "whatsapp", "linkedin_scan", "business_card", "website", "referral", "event", "cold_outreach", "import", "manual"]).optional(),
          pipelineStage: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
          dealValue: z.string().optional(),
          notes: z.string().optional(),
          tags: z.string().optional(),
          assignedTo: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const fullName = input.fullName || `${input.firstName} ${input.lastName || ""}`.trim();
          const id = await db.createCrmContact({
            ...input,
            fullName,
            capturedBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'crm_contact', id, fullName);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          fullName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          whatsappNumber: z.string().optional(),
          linkedinUrl: z.string().optional(),
          organization: z.string().optional(),
          jobTitle: z.string().optional(),
          department: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postalCode: z.string().optional(),
          contactType: z.enum(["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"]).optional(),
          status: z.enum(["active", "inactive", "unsubscribed", "bounced"]).optional(),
          pipelineStage: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
          dealValue: z.string().optional(),
          notes: z.string().optional(),
          tags: z.string().optional(),
          assignedTo: z.number().optional(),
          nextFollowUpAt: z.date().optional(),
          preferredChannel: z.enum(["email", "whatsapp", "phone", "sms", "linkedin"]).optional(),
          optedOutEmail: z.boolean().optional(),
          optedOutSms: z.boolean().optional(),
          optedOutWhatsapp: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const existing = await db.getCrmContactById(id);
          await db.updateCrmContact(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_contact', id, existing?.fullName, existing, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const existing = await db.getCrmContactById(input.id);
          await db.deleteCrmContact(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'crm_contact', input.id, existing?.fullName);
          return { success: true };
        }),

      getStats: protectedProcedure.query(() => db.getCrmContactStats()),

      getTimeline: protectedProcedure
        .input(z.object({ contactId: z.number(), limit: z.number().optional() }))
        .query(({ input }) => db.getContactTimeline(input.contactId, input.limit)),

      getMessagingHistory: protectedProcedure
        .input(z.object({ contactId: z.number(), limit: z.number().optional() }))
        .query(({ input }) => db.getUnifiedMessagingHistory(input.contactId, input.limit)),
    }),

    // --- TAGS ---
    tags: router({
      list: protectedProcedure
        .input(z.object({ category: z.string().optional() }).optional())
        .query(({ input }) => db.getCrmTags(input?.category)),

      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          category: z.enum(["contact", "deal", "general"]).optional(),
        }))
        .mutation(async ({ input }) => {
          const id = await db.createCrmTag(input);
          return { id };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteCrmTag(input.id);
          return { success: true };
        }),

      addToContact: protectedProcedure
        .input(z.object({ contactId: z.number(), tagId: z.number() }))
        .mutation(async ({ input }) => {
          await db.addTagToContact(input.contactId, input.tagId);
          return { success: true };
        }),

      removeFromContact: protectedProcedure
        .input(z.object({ contactId: z.number(), tagId: z.number() }))
        .mutation(async ({ input }) => {
          await db.removeTagFromContact(input.contactId, input.tagId);
          return { success: true };
        }),

      getForContact: protectedProcedure
        .input(z.object({ contactId: z.number() }))
        .query(({ input }) => db.getContactTags(input.contactId)),
    }),

    // --- WHATSAPP ---
    whatsapp: router({
      messages: protectedProcedure
        .input(z.object({
          contactId: z.number().optional(),
          whatsappNumber: z.string().optional(),
          direction: z.string().optional(),
          conversationId: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getWhatsappMessages(input)),

      conversations: protectedProcedure
        .input(z.object({ limit: z.number().optional() }).optional())
        .query(({ input }) => db.getWhatsappConversations(input?.limit)),

      sendMessage: protectedProcedure
        .input(z.object({
          contactId: z.number().optional(),
          whatsappNumber: z.string(),
          contactName: z.string().optional(),
          content: z.string(),
          messageType: z.enum(["text", "image", "video", "audio", "document", "location", "contact", "template"]).optional(),
          templateName: z.string().optional(),
          templateParams: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Create message record (actual sending would be via WhatsApp Business API webhook)
          const id = await db.createWhatsappMessage({
            ...input,
            direction: "outbound",
            status: "pending",
            sentBy: ctx.user.id,
            conversationId: `wa_${input.whatsappNumber}_${Date.now()}`,
          });

          // Also create an interaction record
          if (input.contactId) {
            await db.createCrmInteraction({
              contactId: input.contactId,
              channel: "whatsapp",
              interactionType: "sent",
              content: input.content,
              whatsappMessageId: id,
              performedBy: ctx.user.id,
            });
          }

          return { id, status: "pending" };
        }),

      logInbound: protectedProcedure
        .input(z.object({
          whatsappNumber: z.string(),
          contactName: z.string().optional(),
          messageId: z.string().optional(),
          conversationId: z.string().optional(),
          content: z.string(),
          messageType: z.enum(["text", "image", "video", "audio", "document", "location", "contact", "template"]).optional(),
          mediaUrl: z.string().optional(),
          receivedAt: z.date().optional(),
        }))
        .mutation(async ({ input }) => {
          // Find contact by WhatsApp number
          const contacts = await db.getCrmContacts({ search: input.whatsappNumber, limit: 1 });
          const contact = contacts[0];

          const id = await db.createWhatsappMessage({
            ...input,
            contactId: contact?.id,
            direction: "inbound",
            status: "delivered",
            sentAt: input.receivedAt || new Date(),
          });

          // Create interaction if contact exists
          if (contact) {
            await db.createCrmInteraction({
              contactId: contact.id,
              channel: "whatsapp",
              interactionType: "received",
              content: input.content,
              whatsappMessageId: id,
            });

            // Update contact's last replied timestamp
            await db.updateCrmContact(contact.id, { lastRepliedAt: new Date() });
          }

          return { id, contactId: contact?.id };
        }),

      updateStatus: protectedProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(["pending", "sent", "delivered", "read", "failed"]),
        }))
        .mutation(async ({ input }) => {
          await db.updateWhatsappMessageStatus(input.id, input.status, new Date());
          return { success: true };
        }),
    }),

    // --- INTERACTIONS ---
    interactions: router({
      list: protectedProcedure
        .input(z.object({
          contactId: z.number().optional(),
          channel: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getCrmInteractions(input)),

      create: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          channel: z.enum(["email", "whatsapp", "sms", "phone", "meeting", "linkedin", "note", "task"]),
          interactionType: z.enum(["sent", "received", "call_made", "call_received", "meeting_scheduled", "meeting_completed", "note_added", "task_completed"]),
          subject: z.string().optional(),
          content: z.string().optional(),
          summary: z.string().optional(),
          callDuration: z.number().optional(),
          callOutcome: z.enum(["answered", "voicemail", "no_answer", "busy", "wrong_number"]).optional(),
          meetingStartTime: z.date().optional(),
          meetingEndTime: z.date().optional(),
          meetingLocation: z.string().optional(),
          meetingLink: z.string().optional(),
          relatedDealId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            ...input,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      logCall: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          direction: z.enum(["outbound", "inbound"]),
          duration: z.number().optional(),
          outcome: z.enum(["answered", "voicemail", "no_answer", "busy", "wrong_number"]),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            channel: "phone",
            interactionType: input.direction === "outbound" ? "call_made" : "call_received",
            callDuration: input.duration,
            callOutcome: input.outcome,
            content: input.notes,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      logMeeting: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          subject: z.string(),
          startTime: z.date(),
          endTime: z.date().optional(),
          location: z.string().optional(),
          meetingLink: z.string().optional(),
          notes: z.string().optional(),
          completed: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            channel: "meeting",
            interactionType: input.completed ? "meeting_completed" : "meeting_scheduled",
            subject: input.subject,
            meetingStartTime: input.startTime,
            meetingEndTime: input.endTime,
            meetingLocation: input.location,
            meetingLink: input.meetingLink,
            content: input.notes,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      addNote: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          content: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            channel: "note",
            interactionType: "note_added",
            content: input.content,
            performedBy: ctx.user.id,
          });
          return { id };
        }),
    }),

    // --- PIPELINES ---
    pipelines: router({
      list: protectedProcedure
        .input(z.object({ type: z.string().optional() }).optional())
        .query(({ input }) => db.getCrmPipelines(input?.type)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCrmPipelineById(input.id)),

      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(["sales", "fundraising", "partnerships", "other"]),
          stages: z.string(), // JSON array
          isDefault: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmPipeline(input);
          await createAuditLog(ctx.user.id, 'create', 'crm_pipeline', id, input.name);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          stages: z.string().optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateCrmPipeline(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_pipeline', id);
          return { success: true };
        }),
    }),

    // --- DEALS ---
    deals: router({
      list: protectedProcedure
        .input(z.object({
          pipelineId: z.number().optional(),
          contactId: z.number().optional(),
          stage: z.string().optional(),
          status: z.string().optional(),
          assignedTo: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getCrmDeals(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCrmDealById(input.id)),

      create: protectedProcedure
        .input(z.object({
          pipelineId: z.number(),
          contactId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
          stage: z.string(),
          amount: z.string().optional(),
          currency: z.string().optional(),
          probability: z.number().optional(),
          expectedCloseDate: z.date().optional(),
          source: z.string().optional(),
          campaign: z.string().optional(),
          notes: z.string().optional(),
          assignedTo: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmDeal({
            ...input,
            assignedTo: input.assignedTo || ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'crm_deal', id, input.name);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          stage: z.string().optional(),
          amount: z.string().optional(),
          probability: z.number().optional(),
          expectedCloseDate: z.date().optional(),
          status: z.enum(["open", "won", "lost", "stalled"]).optional(),
          lostReason: z.string().optional(),
          notes: z.string().optional(),
          assignedTo: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const existing = await db.getCrmDealById(id);
          await db.updateCrmDeal(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', id, existing?.name, existing, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const existing = await db.getCrmDealById(input.id);
          await db.deleteCrmDeal(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'crm_deal', input.id, existing?.name);
          return { success: true };
        }),

      getStats: protectedProcedure
        .input(z.object({ pipelineId: z.number().optional() }).optional())
        .query(({ input }) => db.getCrmDealStats(input?.pipelineId)),

      moveStage: protectedProcedure
        .input(z.object({
          id: z.number(),
          stage: z.string(),
          probability: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const existing = await db.getCrmDealById(input.id);
          await db.updateCrmDeal(input.id, {
            stage: input.stage,
            probability: input.probability,
          });
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', input.id, existing?.name, { stage: existing?.stage }, { stage: input.stage });
          return { success: true };
        }),
    }),

    // --- CONTACT CAPTURES ---
    captures: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          captureMethod: z.string().optional(),
          capturedBy: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getContactCaptures(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getContactCaptureById(input.id)),

      // iPhone bump / AirDrop / NFC vCard capture
      captureVCard: protectedProcedure
        .input(z.object({
          vcardData: z.string(),
          captureMethod: z.enum(["iphone_bump", "airdrop", "nfc", "qr_code"]),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          deviceType: z.string().optional(),
          deviceId: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Create capture record
          const captureId = await db.createContactCapture({
            captureMethod: input.captureMethod,
            rawData: input.vcardData,
            vcardData: input.vcardData,
            status: "pending",
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            deviceType: input.deviceType,
            deviceId: input.deviceId,
            notes: input.notes,
          });

          // Process the vCard and create/update contact
          const contactId = await db.processVCardCapture(captureId, input.vcardData, ctx.user.id);

          return { captureId, contactId };
        }),

      // LinkedIn profile scan
      captureLinkedIn: protectedProcedure
        .input(z.object({
          profileUrl: z.string(),
          name: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          headline: z.string().optional(),
          company: z.string().optional(),
          email: z.string().optional(),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const linkedinData = {
            profileUrl: input.profileUrl,
            name: input.name,
            firstName: input.firstName,
            lastName: input.lastName,
            headline: input.headline,
            company: input.company,
            email: input.email,
          };

          // Create capture record
          const captureId = await db.createContactCapture({
            captureMethod: "linkedin_scan",
            rawData: JSON.stringify(linkedinData),
            linkedinProfileUrl: input.profileUrl,
            linkedinProfileData: JSON.stringify(linkedinData),
            status: "pending",
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            notes: input.notes,
          });

          // Process LinkedIn data and create/update contact
          const contactId = await db.processLinkedInCapture(captureId, linkedinData, ctx.user.id);

          return { captureId, contactId };
        }),

      // WhatsApp contact scan
      captureWhatsApp: protectedProcedure
        .input(z.object({
          whatsappNumber: z.string(),
          name: z.string().optional(),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Check for existing contact
          const contacts = await db.getCrmContacts({ search: input.whatsappNumber, limit: 1 });
          const existing = contacts[0];

          if (existing) {
            // Update WhatsApp number if needed
            if (!existing.whatsappNumber) {
              await db.updateCrmContact(existing.id, { whatsappNumber: input.whatsappNumber });
            }
            return { contactId: existing.id, isNew: false };
          }

          // Create new contact
          const firstName = input.name?.split(" ")[0] || "WhatsApp";
          const lastName = input.name?.split(" ").slice(1).join(" ") || "Contact";
          const fullName = input.name || `WhatsApp ${input.whatsappNumber}`;

          const contactId = await db.createCrmContact({
            firstName,
            lastName,
            fullName,
            whatsappNumber: input.whatsappNumber,
            source: "whatsapp",
            capturedBy: ctx.user.id,
            notes: input.notes,
          });

          // Create capture record
          await db.createContactCapture({
            captureMethod: "whatsapp_scan",
            rawData: JSON.stringify({ whatsappNumber: input.whatsappNumber, name: input.name }),
            status: "contact_created",
            contactId,
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            notes: input.notes,
          });

          return { contactId, isNew: true };
        }),

      // Business card scan (with OCR)
      captureBusinessCard: protectedProcedure
        .input(z.object({
          imageUrl: z.string(),
          ocrText: z.string().optional(),
          parsedData: z.object({
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            fullName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            organization: z.string().optional(),
            jobTitle: z.string().optional(),
          }).optional(),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Create capture record
          const captureId = await db.createContactCapture({
            captureMethod: "business_card_scan",
            rawData: JSON.stringify({ ocrText: input.ocrText, parsedData: input.parsedData }),
            imageUrl: input.imageUrl,
            ocrText: input.ocrText,
            parsedData: input.parsedData ? JSON.stringify(input.parsedData) : undefined,
            status: input.parsedData ? "parsed" : "pending",
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            notes: input.notes,
          });

          // If we have parsed data, create the contact
          if (input.parsedData) {
            const firstName = input.parsedData.firstName || input.parsedData.fullName?.split(" ")[0] || "Business";
            const lastName = input.parsedData.lastName || input.parsedData.fullName?.split(" ").slice(1).join(" ") || "Card";
            const fullName = input.parsedData.fullName || `${firstName} ${lastName}`.trim();

            // Check for existing
            let existing = null;
            if (input.parsedData.email) {
              existing = await db.getCrmContactByEmail(input.parsedData.email);
            }

            if (existing) {
              await db.updateCrmContact(existing.id, input.parsedData);
              await db.updateContactCapture(captureId, { contactId: existing.id, status: "merged" });
              return { captureId, contactId: existing.id, isNew: false };
            }

            const contactId = await db.createCrmContact({
              ...input.parsedData,
              firstName,
              lastName,
              fullName,
              source: "business_card",
              capturedBy: ctx.user.id,
            });

            await db.updateContactCapture(captureId, { contactId, status: "contact_created" });
            return { captureId, contactId, isNew: true };
          }

          return { captureId, contactId: null, isNew: false };
        }),

      // Manual processing of pending capture
      processCapture: protectedProcedure
        .input(z.object({
          captureId: z.number(),
          contactData: z.object({
            firstName: z.string(),
            lastName: z.string().optional(),
            fullName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            whatsappNumber: z.string().optional(),
            organization: z.string().optional(),
            jobTitle: z.string().optional(),
          }),
        }))
        .mutation(async ({ input, ctx }) => {
          const capture = await db.getContactCaptureById(input.captureId);
          if (!capture) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Capture not found" });
          }

          const fullName = input.contactData.fullName || `${input.contactData.firstName} ${input.contactData.lastName || ""}`.trim();

          // Check for existing
          let existing = null;
          if (input.contactData.email) {
            existing = await db.getCrmContactByEmail(input.contactData.email);
          }

          if (existing) {
            await db.updateCrmContact(existing.id, input.contactData);
            await db.updateContactCapture(input.captureId, {
              contactId: existing.id,
              status: "merged",
              parsedData: JSON.stringify(input.contactData),
            });
            return { contactId: existing.id, isNew: false };
          }

          const contactId = await db.createCrmContact({
            ...input.contactData,
            fullName,
            source: capture.captureMethod === "iphone_bump" ? "iphone_bump" :
                    capture.captureMethod === "linkedin_scan" ? "linkedin_scan" :
                    capture.captureMethod === "whatsapp_scan" ? "whatsapp" :
                    capture.captureMethod === "business_card_scan" ? "business_card" : "manual",
            capturedBy: ctx.user.id,
          });

          await db.updateContactCapture(input.captureId, {
            contactId,
            status: "contact_created",
            parsedData: JSON.stringify(input.contactData),
          });

          return { contactId, isNew: true };
        }),
    }),

    // --- EMAIL CAMPAIGNS ---
    campaigns: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          type: z.string().optional(),
          limit: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getCrmEmailCampaigns(input)),

      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          subject: z.string().min(1),
          bodyHtml: z.string(),
          bodyText: z.string().optional(),
          type: z.enum(["newsletter", "drip", "announcement", "follow_up", "custom"]).optional(),
          targetTags: z.string().optional(),
          targetContactTypes: z.string().optional(),
          targetPipelineStages: z.string().optional(),
          scheduledAt: z.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmEmailCampaign({
            ...input,
            createdBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'crm_campaign', id, input.name);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          subject: z.string().optional(),
          bodyHtml: z.string().optional(),
          bodyText: z.string().optional(),
          status: z.enum(["draft", "scheduled", "sending", "sent", "paused", "cancelled"]).optional(),
          scheduledAt: z.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateCrmEmailCampaign(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_campaign', id);
          return { success: true };
        }),
    }),
  }),

  // ============================================
  // FIREFLIES.AI INTEGRATION
  // ============================================
  fireflies: router({
    // Validate API key and get Fireflies user info
    validateKey: protectedProcedure
      .input(z.object({ apiKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        return validateFirefliesApiKey(input.apiKey);
      }),

    // Save Fireflies API key as integration config
    configure: adminProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        autoSyncEnabled: z.boolean().optional(),
        autoCreateContacts: z.boolean().optional(),
        autoCreateTasks: z.boolean().optional(),
        autoCreateProjects: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Validate the key first
        const validation = await validateFirefliesApiKey(input.apiKey);
        if (!validation.valid) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid Fireflies API key: ${validation.error}` });
        }

        // Check if config already exists
        const existing = await db.getIntegrationConfigs();
        const firefliesConfig = existing.find((c: any) => c.type === 'fireflies');

        const config = {
          autoSyncEnabled: input.autoSyncEnabled ?? true,
          autoCreateContacts: input.autoCreateContacts ?? true,
          autoCreateTasks: input.autoCreateTasks ?? true,
          autoCreateProjects: input.autoCreateProjects ?? false,
          firefliesEmail: validation.user?.email,
          firefliesUserName: validation.user?.name,
        };

        if (firefliesConfig) {
          await db.updateIntegrationConfig(firefliesConfig.id, {
            config,
            credentials: { apiKey: input.apiKey } as any,
            isActive: true,
          });
          await createAuditLog(ctx.user.id, 'update', 'integration', firefliesConfig.id, 'Fireflies');
          return { id: firefliesConfig.id, updated: true };
        } else {
          const result = await db.createIntegrationConfig({
            type: 'fireflies',
            name: 'Fireflies.ai',
            config: config as any,
            credentials: { apiKey: input.apiKey } as any,
            isActive: true,
          });
          await createAuditLog(ctx.user.id, 'create', 'integration', result.id, 'Fireflies');
          return { id: result.id, updated: false };
        }
      }),

    // Get Fireflies configuration status
    getConfig: protectedProcedure.query(async () => {
      const existing = await db.getIntegrationConfigs();
      const firefliesConfig = existing.find((c: any) => c.type === 'fireflies');
      if (!firefliesConfig) {
        return { configured: false };
      }
      return {
        configured: true,
        isActive: firefliesConfig.isActive,
        config: firefliesConfig.config,
        lastSyncAt: firefliesConfig.lastSyncAt,
      };
    }),

    // Disconnect Fireflies
    disconnect: adminProcedure.mutation(async ({ ctx }) => {
      const existing = await db.getIntegrationConfigs();
      const firefliesConfig = existing.find((c: any) => c.type === 'fireflies');
      if (firefliesConfig) {
        await db.updateIntegrationConfig(firefliesConfig.id, { isActive: false });
        await createAuditLog(ctx.user.id, 'update', 'integration', firefliesConfig.id, 'Fireflies disconnected');
      }
      return { success: true };
    }),

    // Sync meetings from Fireflies
    syncMeetings: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        // Get API key from config
        const existing = await db.getIntegrationConfigs();
        const firefliesConfig = existing.find((c: any) => c.type === 'fireflies' && c.isActive);
        if (!firefliesConfig || !firefliesConfig.credentials) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fireflies is not configured. Please add your API key first.' });
        }

        const apiKey = (firefliesConfig.credentials as any).apiKey;
        if (!apiKey) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fireflies API key not found in configuration.' });
        }

        const transcripts = await listTranscripts(apiKey, input?.limit || 50);
        let synced = 0;
        let skipped = 0;

        for (const transcript of transcripts) {
          // Check if already synced
          const existingMeeting = await db.getFirefliesMeetingByFirefliesId(transcript.id);
          if (existingMeeting) {
            skipped++;
            continue;
          }

          const participants = extractParticipants(transcript);
          const actionItems = transcript.summary?.action_items
            ? parseActionItems(transcript.summary.action_items)
            : [];

          await db.createFirefliesMeeting({
            firefliesId: transcript.id,
            title: transcript.title || 'Untitled Meeting',
            date: transcript.date ? new Date(transcript.date) : undefined,
            duration: transcript.duration || undefined,
            organizerEmail: transcript.organizer_email || undefined,
            participants: JSON.stringify(participants),
            summary: transcript.summary?.overview || undefined,
            shortSummary: transcript.summary?.shorthand_bullet?.join('\n') || undefined,
            keywords: transcript.summary?.keywords ? JSON.stringify(transcript.summary.keywords) : undefined,
            actionItems: JSON.stringify(actionItems),
            transcriptUrl: transcript.transcript_url || undefined,
            meetingSource: undefined,
            calendarEventId: transcript.calendar_id || undefined,
            recordingUrl: transcript.audio_url || undefined,
            processingStatus: 'pending',
          });

          synced++;
        }

        // Update last sync time
        await db.updateIntegrationConfig(firefliesConfig.id, {
          lastSyncAt: new Date(),
        });

        await createAuditLog(ctx.user.id, 'create', 'fireflies_sync', 0, `Synced ${synced} meetings`);

        return { synced, skipped, total: transcripts.length };
      }),

    // List synced meetings
    meetings: router({
      list: protectedProcedure
        .input(z.object({
          processingStatus: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getFirefliesMeetings(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const meeting = await db.getFirefliesMeetingById(input.id);
          if (!meeting) throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting not found' });
          const actionItems = await db.getFirefliesActionItems(input.id);
          const contactMappings = await db.getFirefliesContactMappings(input.id);
          return { ...meeting, actionItemRecords: actionItems, contactMappingRecords: contactMappings };
        }),

      getStats: protectedProcedure.query(() => db.getFirefliesMeetingStats()),
    }),

    // Process a meeting: extract contacts, create tasks, optionally create project
    processMeeting: protectedProcedure
      .input(z.object({
        meetingId: z.number(),
        createContacts: z.boolean().optional(),
        createTasks: z.boolean().optional(),
        createProject: z.boolean().optional(),
        projectName: z.string().optional(),
        assignTasksTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const meeting = await db.getFirefliesMeetingById(input.meetingId);
        if (!meeting) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting not found' });
        }

        let contactsCreated = 0;
        let tasksCreated = 0;
        let projectId: number | undefined;

        // --- Create CRM Contacts from participants ---
        if (input.createContacts !== false) {
          const participants = meeting.participants ? JSON.parse(meeting.participants as string) : [];

          for (const participant of participants) {
            if (!participant.email) continue;

            // Check if contact already exists
            const existingContact = await db.getCrmContactByEmail(participant.email);

            if (existingContact) {
              // Map existing contact
              await db.createFirefliesContactMapping({
                meetingId: meeting.id,
                participantEmail: participant.email,
                participantName: participant.name,
                crmContactId: existingContact.id,
                isNewContact: false,
                wasAutoCreated: false,
              });

              // Log the meeting as an interaction for this contact
              await db.createCrmInteraction({
                contactId: existingContact.id,
                channel: 'meeting',
                interactionType: 'meeting_completed',
                subject: meeting.title,
                summary: meeting.shortSummary || meeting.summary || undefined,
                meetingStartTime: meeting.date || undefined,
                meetingEndTime: meeting.date && meeting.duration
                  ? new Date(new Date(meeting.date).getTime() + meeting.duration * 1000)
                  : undefined,
                meetingLink: meeting.transcriptUrl || undefined,
                performedBy: ctx.user.id,
              });
            } else {
              // Create new CRM contact
              const nameParts = (participant.name || '').split(' ');
              const firstName = nameParts[0] || participant.email.split('@')[0];
              const lastName = nameParts.slice(1).join(' ') || undefined;

              const contactId = await db.createCrmContact({
                firstName,
                lastName,
                fullName: participant.name || firstName,
                email: participant.email,
                contactType: 'lead',
                source: 'fireflies',
                notes: `Auto-created from Fireflies meeting: ${meeting.title}`,
                capturedBy: ctx.user.id,
              });

              await db.createFirefliesContactMapping({
                meetingId: meeting.id,
                participantEmail: participant.email,
                participantName: participant.name,
                crmContactId: contactId,
                isNewContact: true,
                wasAutoCreated: true,
              });

              // Log the meeting as an interaction
              await db.createCrmInteraction({
                contactId: contactId,
                channel: 'meeting',
                interactionType: 'meeting_completed',
                subject: meeting.title,
                summary: meeting.shortSummary || meeting.summary || undefined,
                meetingStartTime: meeting.date || undefined,
                meetingLink: meeting.transcriptUrl || undefined,
                performedBy: ctx.user.id,
              });

              contactsCreated++;
            }
          }
        }

        // --- Create Project (if requested) ---
        if (input.createProject) {
          const projectNumber = generateNumber('PRJ');
          const projectResult = await db.createProject({
            projectNumber,
            name: input.projectName || `Meeting Follow-up: ${meeting.title}`,
            description: `Auto-generated from Fireflies meeting: ${meeting.title}\n\nSummary:\n${meeting.summary || 'No summary available'}`,
            type: 'internal',
            status: 'planning',
            priority: 'medium',
            ownerId: ctx.user.id,
            createdBy: ctx.user.id,
            startDate: new Date(),
          });
          projectId = projectResult.id;
          await createAuditLog(ctx.user.id, 'create', 'project', projectId, input.projectName || meeting.title);
        }

        // --- Create Tasks from Action Items ---
        if (input.createTasks !== false) {
          const actionItems = meeting.actionItems ? JSON.parse(meeting.actionItems as string) : [];

          for (const item of actionItems) {
            // If we have a project, create as project task
            if (projectId) {
              const taskResult = await db.createProjectTask({
                projectId,
                name: item.text?.substring(0, 255) || 'Untitled action item',
                description: `From Fireflies meeting: ${meeting.title}\n\nAction: ${item.text}${item.assignee ? `\nAssignee: ${item.assignee}` : ''}`,
                assigneeId: input.assignTasksTo || ctx.user.id,
                status: 'todo',
                priority: 'medium',
                dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
                createdBy: ctx.user.id,
              });

              await db.createFirefliesActionItem({
                meetingId: meeting.id,
                firefliesMeetingId: meeting.firefliesId,
                text: item.text || '',
                assignee: item.assignee || undefined,
                assigneeEmail: item.assigneeEmail || undefined,
                dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
                projectTaskId: taskResult.id,
                status: 'converted_to_task',
                convertedAt: new Date(),
                convertedBy: ctx.user.id,
              });

              tasksCreated++;
            } else {
              // Store action item without a project link
              await db.createFirefliesActionItem({
                meetingId: meeting.id,
                firefliesMeetingId: meeting.firefliesId,
                text: item.text || '',
                assignee: item.assignee || undefined,
                assigneeEmail: item.assigneeEmail || undefined,
                dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
                status: 'pending',
              });

              tasksCreated++;
            }
          }
        }

        // Update meeting processing status
        let newStatus: 'contacts_created' | 'tasks_created' | 'project_created' | 'fully_processed' = 'fully_processed';
        if (contactsCreated > 0 && tasksCreated === 0 && !projectId) newStatus = 'contacts_created';
        else if (tasksCreated > 0 && contactsCreated === 0 && !projectId) newStatus = 'tasks_created';
        else if (projectId && contactsCreated === 0) newStatus = 'project_created';

        await db.updateFirefliesMeeting(meeting.id, {
          processingStatus: newStatus,
          processedAt: new Date(),
          processedBy: ctx.user.id,
          autoCreatedProjectId: projectId,
          autoCreatedTaskCount: tasksCreated,
          autoCreatedContactCount: contactsCreated,
        });

        await createAuditLog(ctx.user.id, 'create', 'fireflies_process', meeting.id,
          `Processed meeting: ${meeting.title} (${contactsCreated} contacts, ${tasksCreated} tasks${projectId ? ', 1 project' : ''})`);

        return {
          contactsCreated,
          tasksCreated,
          projectId,
          processingStatus: newStatus,
        };
      }),

    // Batch process all pending meetings
    processAllPending: protectedProcedure
      .input(z.object({
        createContacts: z.boolean().optional(),
        createTasks: z.boolean().optional(),
        createProjects: z.boolean().optional(),
        assignTasksTo: z.number().optional(),
      }).optional())
      .mutation(async ({ input, ctx }) => {
        const pendingMeetings = await db.getFirefliesMeetings({ processingStatus: 'pending' });
        const results = { processed: 0, contactsCreated: 0, tasksCreated: 0, projectsCreated: 0 };

        // Get config for defaults
        const existing = await db.getIntegrationConfigs();
        const firefliesConfig = existing.find((c: any) => c.type === 'fireflies');
        const config = firefliesConfig?.config as any || {};

        for (const meeting of pendingMeetings) {
          const shouldCreateContacts = input?.createContacts ?? config.autoCreateContacts ?? true;
          const shouldCreateTasks = input?.createTasks ?? config.autoCreateTasks ?? true;
          const shouldCreateProject = input?.createProjects ?? config.autoCreateProjects ?? false;

          const participants = meeting.participants ? JSON.parse(meeting.participants as string) : [];
          const actionItems = meeting.actionItems ? JSON.parse(meeting.actionItems as string) : [];

          let contactsCreated = 0;
          let tasksCreated = 0;
          let projectId: number | undefined;

          // Create contacts
          if (shouldCreateContacts) {
            for (const participant of participants) {
              if (!participant.email) continue;
              const existingContact = await db.getCrmContactByEmail(participant.email);
              if (!existingContact) {
                const nameParts = (participant.name || '').split(' ');
                const firstName = nameParts[0] || participant.email.split('@')[0];
                const lastName = nameParts.slice(1).join(' ') || undefined;

                const contactId = await db.createCrmContact({
                  firstName,
                  lastName,
                  fullName: participant.name || firstName,
                  email: participant.email,
                  contactType: 'lead',
                  source: 'fireflies',
                  notes: `Auto-created from Fireflies meeting: ${meeting.title}`,
                  capturedBy: ctx.user.id,
                });

                await db.createFirefliesContactMapping({
                  meetingId: meeting.id,
                  participantEmail: participant.email,
                  participantName: participant.name,
                  crmContactId: contactId,
                  isNewContact: true,
                  wasAutoCreated: true,
                });

                contactsCreated++;
              } else {
                await db.createFirefliesContactMapping({
                  meetingId: meeting.id,
                  participantEmail: participant.email,
                  participantName: participant.name,
                  crmContactId: existingContact.id,
                  isNewContact: false,
                  wasAutoCreated: false,
                });
              }
            }
          }

          // Create project
          if (shouldCreateProject) {
            const projectNumber = generateNumber('PRJ');
            const projectResult = await db.createProject({
              projectNumber,
              name: `Meeting Follow-up: ${meeting.title}`,
              description: `Auto-generated from Fireflies meeting: ${meeting.title}\n\nSummary:\n${meeting.summary || 'No summary available'}`,
              type: 'internal',
              status: 'planning',
              priority: 'medium',
              ownerId: ctx.user.id,
              createdBy: ctx.user.id,
              startDate: new Date(),
            });
            projectId = projectResult.id;
            results.projectsCreated++;
          }

          // Create tasks
          if (shouldCreateTasks && actionItems.length > 0) {
            for (const item of actionItems) {
              if (projectId) {
                const taskResult = await db.createProjectTask({
                  projectId,
                  name: item.text?.substring(0, 255) || 'Untitled action item',
                  description: `From Fireflies meeting: ${meeting.title}\n\nAction: ${item.text}`,
                  assigneeId: input?.assignTasksTo || ctx.user.id,
                  status: 'todo',
                  priority: 'medium',
                  createdBy: ctx.user.id,
                });

                await db.createFirefliesActionItem({
                  meetingId: meeting.id,
                  firefliesMeetingId: meeting.firefliesId,
                  text: item.text || '',
                  assignee: item.assignee || undefined,
                  projectTaskId: taskResult.id,
                  status: 'converted_to_task',
                  convertedAt: new Date(),
                  convertedBy: ctx.user.id,
                });
              } else {
                await db.createFirefliesActionItem({
                  meetingId: meeting.id,
                  firefliesMeetingId: meeting.firefliesId,
                  text: item.text || '',
                  assignee: item.assignee || undefined,
                  status: 'pending',
                });
              }
              tasksCreated++;
            }
          }

          // Update meeting
          await db.updateFirefliesMeeting(meeting.id, {
            processingStatus: 'fully_processed',
            processedAt: new Date(),
            processedBy: ctx.user.id,
            autoCreatedProjectId: projectId,
            autoCreatedTaskCount: tasksCreated,
            autoCreatedContactCount: contactsCreated,
          });

          results.processed++;
          results.contactsCreated += contactsCreated;
          results.tasksCreated += tasksCreated;
        }

        return results;
      }),

    // Convert a single action item to a project task
    convertActionItem: protectedProcedure
      .input(z.object({
        actionItemId: z.number(),
        projectId: z.number(),
        assigneeId: z.number().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        dueDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const item = await db.getFirefliesActionItemById(input.actionItemId);
        if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Action item not found' });
        if (item.status === 'converted_to_task') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Action item already converted to a task' });
        }

        const taskResult = await db.createProjectTask({
          projectId: input.projectId,
          name: item.text.substring(0, 255),
          description: `Converted from Fireflies action item\n\n${item.text}`,
          assigneeId: input.assigneeId || ctx.user.id,
          status: 'todo',
          priority: input.priority || 'medium',
          dueDate: input.dueDate || item.dueDate || undefined,
          createdBy: ctx.user.id,
        });

        await db.updateFirefliesActionItem(item.id, {
          projectTaskId: taskResult.id,
          status: 'converted_to_task',
          convertedAt: new Date(),
          convertedBy: ctx.user.id,
        });

        return { taskId: taskResult.id };
      }),
  }),
});

// Helper function to calculate next generation date for recurring invoices
function calculateNextGenerationDate(
  frequency: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): Date {
  const now = new Date();
  const next = new Date(now);
  
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      if (dayOfWeek !== undefined && dayOfWeek !== null) {
        const currentDay = next.getDay();
        const daysUntil = (dayOfWeek - currentDay + 7) % 7;
        next.setDate(next.getDate() + daysUntil);
      }
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  
  return next;
}

// Helper function to map Shopify order status to DB enum
function mapShopifyOrderStatusToDb(financialStatus: string, fulfillmentStatus: string | null): 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' {
  if (financialStatus === 'refunded') return 'refunded';
  if (financialStatus === 'voided') return 'cancelled';
  if (fulfillmentStatus === 'fulfilled') return 'delivered';
  if (fulfillmentStatus === 'partial') return 'shipped';
  if (financialStatus === 'paid') return 'confirmed';
  return 'pending';
}

export type AppRouter = typeof appRouter;

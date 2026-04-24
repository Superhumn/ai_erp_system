import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as db from "../db";
import { createGoogleDoc, createGoogleSheet, updateGoogleSheet, appendToGoogleSheet, getGoogleSheetValues, shareGoogleFile, getFileShareableLink } from "../_core/googleWorkspace";
import { getGoogleFullAccessAuthUrl } from "../_core/googleDrive";
import { getQuickBooksAuthUrl, refreshQuickBooksToken, getCompanyInfo, getChartOfAccounts, getQuickBooksItems, getProfitAndLoss } from "../_core/quickbooks";
import { testConnection } from "../ediTransportService";
import { router, publicProcedure, protectedProcedure, adminProcedure, createAuditLog, generateNumber, getValidGoogleToken } from "./middleware";

export const settingsRouter = router({
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
        type: z.enum(['quickbooks', 'shopify', 'email', 'webhook', 'airtable']),
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
      
      const url = getGoogleFullAccessAuthUrl(ctx.user.id, '/settings/integrations');
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

    // Sync Chart of Accounts from QuickBooks
    syncAccounts: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.realmId) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected' });
        }

        const result = await getChartOfAccounts(token.accessToken, token.realmId);
        if (result.error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
        }

        const accounts = result.data?.QueryResponse?.Account || [];
        const companyId = input.companyId || 1; // Default to company 1
        const synced = await db.syncQuickBooksAccounts(companyId, accounts);

        await createAuditLog(ctx.user.id, 'create', 'quickbooks_sync', 0, `Synced ${synced.synced} accounts from QuickBooks`);
        
        return { 
          success: true, 
          synced: synced.synced,
          message: `Successfully synced ${synced.synced} accounts from QuickBooks`
        };
      }),

    // Sync Items/Products from QuickBooks
    syncItems: protectedProcedure
      .input(z.object({ 
        companyId: z.number().optional(),
        type: z.enum(['Inventory', 'NonInventory', 'Service']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.realmId) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected' });
        }

        const result = await getQuickBooksItems(token.accessToken, token.realmId, {
          type: input.type,
          activeOnly: true,
        });
        
        if (result.error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
        }

        const items = result.data?.QueryResponse?.Item || [];
        const companyId = input.companyId || 1;
        const synced = await db.syncQuickBooksItems(companyId, items);

        await createAuditLog(ctx.user.id, 'create', 'quickbooks_sync', 0, `Synced ${synced.synced} items from QuickBooks`);
        
        return { 
          success: true, 
          synced: synced.synced,
          message: `Successfully synced ${synced.synced} items from QuickBooks`
        };
      }),

    // Fetch Profit & Loss from QuickBooks and return parsed monthly totals.
    // Drives actual burn / gross margin / EBITDA on the CFO dashboard.
    getProfitAndLoss: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        summarizeBy: z.enum(["Month", "Quarter", "Year"]).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.realmId) return { connected: false, months: [] };

        const result = await getProfitAndLoss(token.accessToken, token.realmId, {
          startDate: input?.startDate,
          endDate: input?.endDate,
          summarizeBy: input?.summarizeBy ?? "Month",
        });
        if (result.error) return { connected: true, error: result.error, months: [] };

        const report = result.data;
        const columns: string[] = (report?.Columns?.Column ?? [])
          .map((c: any) => c?.ColTitle ?? "");
        // Walk rows recursively to find the Total Expense / Total Income rows.
        const walkRows = (rows: any[], out: { label: string; values: number[] }[] = []): { label: string; values: number[] }[] => {
          for (const r of rows ?? []) {
            if (r?.Summary?.ColData) {
              out.push({
                label: r.Summary.ColData[0]?.value ?? r.group ?? "Row",
                values: (r.Summary.ColData as any[]).slice(1).map((c) => parseFloat(c?.value ?? "0") || 0),
              });
            }
            if (r?.Rows?.Row) walkRows(r.Rows.Row, out);
          }
          return out;
        };
        const rows = walkRows(report?.Rows?.Row ?? []);
        // Pick out the rollup rows by name (QB labels them "Total Income"/"Total Expenses"/etc.)
        const findRow = (needle: string) => rows.find((r) => r.label.toLowerCase().includes(needle.toLowerCase()));
        const income  = findRow("Total Income")?.values ?? [];
        const cogs    = findRow("Total Cost of Goods Sold")?.values ?? [];
        const expense = findRow("Total Expenses")?.values ?? [];
        const months = columns.slice(1, -1).map((label, i) => ({
          label,
          income:  income[i]  ?? 0,
          cogs:    cogs[i]    ?? 0,
          expense: expense[i] ?? 0,
        }));

        // Per-account expense rollup: sum across the whole period, excluding
        // the "Total ..." summary rows and non-expense sections.
        const expenseAccounts = rows
          .filter((r) => {
            const label = r.label.toLowerCase();
            if (label.startsWith("total ")) return false;
            if (label === "net income" || label === "net operating income") return false;
            if (label === "gross profit") return false;
            return true;
          })
          .map((r) => ({
            name: r.label,
            total: r.values.slice(0, -1).reduce((s, v) => s + v, 0), // exclude summary col
          }))
          .filter((r) => r.total !== 0);

        return { connected: true, months, expenseAccounts };
      }),

    // Get QuickBooks accounts for mapping
    getAccounts: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        classification: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']).optional(),
      }).optional())
      .query(async ({ input }) => {
        const companyId = input?.companyId || 1;
        return db.getQuickBooksAccountsByType(companyId, input?.classification);
      }),

    // Get account mappings
    getAccountMappings: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }))
      .query(async ({ input }) => {
        const companyId = input.companyId || 1;
        return db.getQuickBooksAccountMappings(companyId);
      }),

    // Create or update account mapping
    upsertAccountMapping: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        mappingType: z.enum([
          'cogs_product',
          'cogs_freight',
          'cogs_customs',
          'inventory_asset',
          'freight_expense',
          'income_sales',
          'expense_other'
        ]),
        quickbooksAccountId: z.string(),
        erpCategoryName: z.string().optional(),
        isDefault: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const companyId = input.companyId || 1;
        const result = await db.upsertQuickBooksAccountMapping({
          companyId,
          mappingType: input.mappingType,
          quickbooksAccountId: input.quickbooksAccountId,
          erpCategoryName: input.erpCategoryName,
          isDefault: input.isDefault ?? true,
          notes: input.notes,
          createdBy: ctx.user.id,
        });

        await createAuditLog(ctx.user.id, 'create', 'quickbooks_mapping', result.id, `Mapped ${input.mappingType} to QB account ${input.quickbooksAccountId}`);
        
        return { success: true, id: result.id };
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
});

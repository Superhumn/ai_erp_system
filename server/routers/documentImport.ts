// appRouter.documentImport — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { parseUploadedDocument, importPurchaseOrder, importFreightInvoice, importVendorInvoice, importCustomsDocument, matchLineItemsToMaterials } from "../documentImportService";
import * as db from "../db";
import { storagePut } from "../storage";

// ============================================
// DOCUMENT IMPORT
// ============================================
export const documentImportRouter = router({
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
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return importPurchaseOrder(input.poData as any, ctx.user.id, input.markAsReceived, input.createMissingVendor);
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
        createMissingVendor: z.boolean().default(false),
        receiveInventory: z.boolean().default(false),
        warehouseId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return importFreightInvoice(input.invoiceData as any, ctx.user.id, input.createMissingVendor, input.receiveInventory, input.warehouseId);
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
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return importVendorInvoice(input.invoiceData as any, ctx.user.id, input.markAsReceived, input.createMissingVendor);
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
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return importCustomsDocument(input.documentData as any, ctx.user.id, input.createMissingVendor);
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
  });

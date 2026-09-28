// appRouter.documentImport — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { opsProcedure } from "./middleware";
import {
  parseUploadedDocument,
  importPurchaseOrder,
  importFreightInvoice,
  importVendorInvoice,
  importCustomsDocument,
  matchLineItemsToMaterials,
  type ImportResult,
} from "../documentImportService";
import * as db from "../db";
import { storagePut } from "../storage";
import { MAX_ATTACHMENT_BYTES } from "../attachmentUrl";

// ============================================
// DOCUMENT IMPORT
// ============================================

// The parsed documents the client sends back come straight from the model, so
// a field the schema calls optional often arrives as `null`, and a number can
// arrive as "1,200.00". `.nullish()` accepts the nulls and `numberish` reads
// the strings; `dropNulls` then hands the service the `undefined`s it expects.
const numberish = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(/[^0-9.+-]/g, "")) : v),
  z.number(),
);
const optStr = z.string().nullish();
const optNum = numberish.nullish();

function dropNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropNulls) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, dropNulls(v)]),
    ) as T;
  }
  return value;
}

const goodsLineItemSchema = z.object({
  description: z.string(),
  sku: optStr,
  quantity: numberish,
  unit: optStr,
  unitPrice: numberish,
  totalPrice: numberish,
});

/**
 * Best-effort history row for the Import History tab (audit_logs, entityType
 * `document_import_<type>`; read back by db.getDocumentImportLogs). A failure
 * to record history must never fail an import that already wrote its rows.
 */
async function recordImport(userId: number, label: string, result: ImportResult): Promise<void> {
  try {
    await db.createDocumentImportLog({
      filename: label,
      documentType: result.documentType,
      status: result.success ? (result.warnings.length > 0 ? "partial" : "success") : "failed",
      createdRecords: JSON.stringify(result.createdRecords),
      updatedRecords: JSON.stringify(result.updatedRecords),
      warnings: JSON.stringify(result.warnings),
      error: result.error,
      importedBy: userId,
      importedAt: Date.now(),
    });
  } catch (e) {
    console.error("[DocumentImport] Failed to record import history:", e instanceof Error ? e.message : e);
  }
}

/**
 * Put the uploaded bytes in object storage and hand back a URL the parser can
 * fetch. Storage (R2) is optional in this deployment; without it the bytes are
 * parsed inline as a data: URL (which the attachment-URL guard accepts) instead
 * of failing the whole upload. `stored` tells the caller whether a durable URL
 * exists.
 */
async function storeDocument(fileKey: string, buffer: Buffer, mimeType: string): Promise<{ url: string; stored: boolean }> {
  try {
    const { url } = await storagePut(fileKey, buffer, mimeType);
    return { url, stored: true };
  } catch (e) {
    console.warn("[DocumentImport] Object storage unavailable, parsing inline:", e instanceof Error ? e.message : e);
    return { url: `data:${mimeType};base64,${buffer.toString("base64")}`, stored: false };
  }
}

/**
 * The caller's Google access token, refreshed when expired. `null` when the
 * account is not connected.
 */
async function resolveGoogleAccessToken(userId: number): Promise<string | null> {
  const token = await db.getGoogleOAuthToken(userId);
  if (!token) return null;

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
          userId,
          accessToken: refreshData.access_token,
          expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
        });
      }
    }
  }
  return accessToken;
}

/** Download one Drive file, enforcing the same size cap as uploaded attachments. */
async function downloadDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Failed to download file from Google Drive');
  }
  const declared = Number(response.headers?.get?.('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File is ${declared} bytes; the limit is ${MAX_ATTACHMENT_BYTES} bytes`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File is ${buffer.byteLength} bytes; the limit is ${MAX_ATTACHMENT_BYTES} bytes`);
  }
  return buffer;
}

export const documentImportRouter = router({
    // Parse uploaded document to extract data
    parse: protectedProcedure
      .input(z.object({
        fileData: z.string(), // base64 encoded file
        fileName: z.string(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileData, 'base64');
        if (buffer.byteLength === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'The uploaded file is empty.' });
        }
        if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `The file is larger than the ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB limit.` });
        }
        const mimeType = input.mimeType || 'application/octet-stream';

        // Upload to storage first (falls back to inline parsing when storage is not configured)
        const fileKey = `document-imports/${Date.now()}-${input.fileName}`;
        const { url, stored } = await storeDocument(fileKey, buffer, mimeType);

        // Parse the document using the LLM
        const result = await parseUploadedDocument(url, input.fileName, undefined, mimeType);
        return { ...result, fileUrl: stored ? url : null };
      }),

    // Import a purchase order
    importPO: opsProcedure
      .input(z.object({
        poData: z.object({
          poNumber: z.string(),
          vendorName: z.string(),
          vendorEmail: optStr,
          orderDate: z.string(),
          deliveryDate: optStr,
          subtotal: numberish,
          totalAmount: numberish,
          currency: optStr,
          notes: optStr,
          status: optStr,
          lineItems: z.array(goodsLineItemSchema),
        }),
        markAsReceived: z.boolean().default(false),
        updateInventory: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const poData = dropNulls(input.poData);
        const result = await importPurchaseOrder(poData as any, ctx.user.id, input.markAsReceived, input.createMissingVendor, {
          updateInventory: input.updateInventory,
          companyId: ctx.user.companyId ?? undefined,
        });
        await recordImport(ctx.user.id, input.fileName || `PO ${poData.poNumber}`, result);
        return result;
      }),

    // Import a freight invoice
    importFreightInvoice: opsProcedure
      .input(z.object({
        invoiceData: z.object({
          invoiceNumber: z.string(),
          carrierName: z.string(),
          carrierEmail: optStr,
          invoiceDate: z.string(),
          shipmentDate: optStr,
          deliveryDate: optStr,
          origin: optStr,
          destination: optStr,
          trackingNumber: optStr,
          weight: optStr,
          dimensions: optStr,
          freightCharges: numberish,
          fuelSurcharge: optNum,
          accessorialCharges: optNum,
          totalAmount: numberish,
          currency: optStr,
          relatedPoNumber: optStr,
          notes: optStr,
        }),
        linkToPO: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
        receiveInventory: z.boolean().default(false),
        warehouseId: z.number().optional(),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoiceData = dropNulls(input.invoiceData);
        const result = await importFreightInvoice(invoiceData as any, ctx.user.id, input.createMissingVendor, input.receiveInventory, input.warehouseId, {
          linkToPO: input.linkToPO,
          companyId: ctx.user.companyId ?? undefined,
        });
        await recordImport(ctx.user.id, input.fileName || `Freight invoice ${invoiceData.invoiceNumber}`, result);
        return result;
      }),

    // Import a vendor invoice
    importVendorInvoice: opsProcedure
      .input(z.object({
        invoiceData: z.object({
          invoiceNumber: z.string(),
          vendorName: z.string(),
          vendorEmail: optStr,
          invoiceDate: z.string(),
          dueDate: optStr,
          lineItems: z.array(goodsLineItemSchema),
          subtotal: numberish,
          taxAmount: optNum,
          shippingAmount: optNum,
          totalAmount: numberish,
          currency: optStr,
          relatedPoNumber: optStr,
          paymentTerms: optStr,
          notes: optStr,
        }),
        markAsReceived: z.boolean().default(false),
        updateInventory: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoiceData = dropNulls(input.invoiceData);
        const result = await importVendorInvoice(invoiceData as any, ctx.user.id, input.markAsReceived, input.createMissingVendor, {
          updateInventory: input.updateInventory,
          companyId: ctx.user.companyId ?? undefined,
        });
        await recordImport(ctx.user.id, input.fileName || `Invoice ${invoiceData.invoiceNumber}`, result);
        return result;
      }),

    // Import a customs document
    importCustomsDocument: opsProcedure
      .input(z.object({
        documentData: z.object({
          documentNumber: z.string(),
          documentType: z.enum(["bill_of_lading", "customs_entry", "commercial_invoice", "packing_list", "certificate_of_origin", "import_permit", "other"]),
          entryDate: z.string(),
          shipperName: z.string(),
          shipperCountry: optStr,
          consigneeName: z.string(),
          consigneeCountry: optStr,
          countryOfOrigin: z.string(),
          portOfEntry: optStr,
          portOfExit: optStr,
          vesselName: optStr,
          voyageNumber: optStr,
          containerNumber: optStr,
          lineItems: z.array(z.object({
            description: z.string(),
            hsCode: optStr,
            quantity: numberish,
            unit: optStr,
            declaredValue: numberish,
            dutyRate: optNum,
            dutyAmount: optNum,
            countryOfOrigin: optStr,
          })),
          totalDeclaredValue: numberish,
          totalDuties: optNum,
          totalTaxes: optNum,
          totalCharges: numberish,
          currency: optStr,
          brokerName: optStr,
          brokerReference: optStr,
          relatedPoNumber: optStr,
          trackingNumber: optStr,
          notes: optStr,
        }),
        linkToPO: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const documentData = dropNulls(input.documentData);
        const result = await importCustomsDocument(documentData as any, ctx.user.id, input.createMissingVendor, {
          linkToPO: input.linkToPO,
          companyId: ctx.user.companyId ?? undefined,
        });
        await recordImport(ctx.user.id, input.fileName || `Customs ${documentData.documentNumber}`, result);
        return result;
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
        lineItems: z.array(goodsLineItemSchema),
      }))
      .mutation(async ({ input }) => {
        return matchLineItemsToMaterials(dropNulls(input.lineItems) as any);
      }),

    // List folders from Google Drive
    listDriveFolders: protectedProcedure
      .input(z.object({
        parentFolderId: z.string().optional(),
        pageToken: z.string().optional()
      }).optional())
      .query(async ({ ctx, input }) => {
        const accessToken = await resolveGoogleAccessToken(ctx.user.id);
        if (!accessToken) {
          // Return empty result instead of throwing error
          return { folders: [], nextPageToken: undefined, notConnected: true };
        }

        // Build query for folders
        const parentQuery = input?.parentFolderId
          ? `'${input.parentFolderId}' in parents`
          : `'root' in parents`;
        const query = `mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;

        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime),nextPageToken&orderBy=name&pageSize=100${input?.pageToken ? `&pageToken=${encodeURIComponent(input.pageToken)}` : ''}`;

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
        const accessToken = await resolveGoogleAccessToken(ctx.user.id);
        if (!accessToken) {
          // Return empty result instead of throwing error
          return { files: [], nextPageToken: undefined, notConnected: true };
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

        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink),nextPageToken&orderBy=name&pageSize=100${input.pageToken ? `&pageToken=${encodeURIComponent(input.pageToken)}` : ''}`;

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
        const accessToken = await resolveGoogleAccessToken(ctx.user.id);
        if (!accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google account not connected. Please connect your Google account first.' });
        }

        let buffer: Buffer;
        try {
          buffer = await downloadDriveFile(accessToken, input.fileId);
        } catch (e) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e instanceof Error ? e.message : 'Failed to download file from Google Drive' });
        }

        // Upload to storage (or parse inline when storage is not configured)
        const fileKey = `document-imports/gdrive-${Date.now()}-${input.fileName}`;
        const { url, stored } = await storeDocument(fileKey, buffer, input.mimeType);

        // Parse the document
        const result = await parseUploadedDocument(url, input.fileName, undefined, input.mimeType);
        return { ...result, fileUrl: stored ? url : null, sourceFileId: input.fileId };
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
        const accessToken = await resolveGoogleAccessToken(ctx.user.id);
        if (!accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google account not connected. Please connect your Google account first.' });
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
            const buffer = await downloadDriveFile(accessToken, file.fileId);

            // Upload to storage (or parse inline when storage is not configured)
            const fileKey = `document-imports/gdrive-${Date.now()}-${file.fileName}`;
            const { url, stored } = await storeDocument(fileKey, buffer, file.mimeType);

            // Parse the document. parseUploadedDocument reports failures in
            // its result rather than throwing, so `success` must come from it —
            // a file the model could not read is not a successful parse.
            const parseResult = await parseUploadedDocument(url, file.fileName, undefined, file.mimeType);

            if (!parseResult.success) {
              results.push({
                fileId: file.fileId,
                fileName: file.fileName,
                success: false,
                error: parseResult.error || 'Failed to parse document',
              });
              continue;
            }
            if (parseResult.documentType === 'unknown') {
              results.push({
                fileId: file.fileId,
                fileName: file.fileName,
                success: false,
                error: 'Could not determine the document type',
              });
              continue;
            }

            results.push({
              fileId: file.fileId,
              fileName: file.fileName,
              success: true,
              data: { ...parseResult, fileUrl: stored ? url : null },
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

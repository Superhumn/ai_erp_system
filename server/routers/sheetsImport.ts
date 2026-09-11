// appRouter.sheetsImport — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { buildImportRecord } from "@shared/importFields";
import * as db from "../db";
import { createAuditLog, refreshGoogleToken, getValidGoogleToken, DRIVE_SUPPORTED_TYPES, detectSheetType, importProjectRecord, importProjectTaskRecord, type DriveSyncResult, findActiveDriveSyncJob, importDriveFiles, generateNumber } from "./_shared";

// ============================================
// GOOGLE SHEETS IMPORT (OAuth + Drive API)
// ============================================
export const sheetsImportRouter = router({
    // Check if user has connected Google account
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getGoogleOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, email: null };
      }
      // Check if token is expired and attempt refresh if so
      let isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      let currentAccessToken = token.accessToken;
      if (isExpired && token.refreshToken) {
        // Attempt to refresh the token automatically
        const refreshed = await refreshGoogleToken(token.refreshToken);
        if (refreshed.accessToken && refreshed.expiresAt) {
          await db.upsertGoogleOAuthToken({
            userId: ctx.user.id,
            accessToken: refreshed.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: refreshed.expiresAt,
            googleEmail: token.googleEmail,
          });
          currentAccessToken = refreshed.accessToken;
          isExpired = false;
        } else {
          // Refresh failed — token is truly expired
          return { connected: false, email: token.googleEmail, needsRefresh: true };
        }
      }
      // Backfill googleEmail if missing (for tokens created before email fetch was added)
      let email = token.googleEmail;
      if (!isExpired && !email && currentAccessToken) {
        try {
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${currentAccessToken}` } });
          if (userInfoRes.ok) {
            const userInfo = await userInfoRes.json();
            if (userInfo.email) {
              email = userInfo.email;
              await db.upsertGoogleOAuthToken({ userId: ctx.user.id, accessToken: currentAccessToken, googleEmail: email });
            }
          }
        } catch { /* best-effort */ }
      }
      return {
        connected: !isExpired,
        email,
        needsRefresh: false
      };
    }),

    // Get Google OAuth URL for connecting account
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return { url: null, error: 'Google OAuth not configured' };
      }
      
      // Use the same canonical redirect URI as every other Google OAuth flow
      // (Drive full-access, Gmail, Workspace, Chat) so a single URI needs to be
      // registered in the Google Cloud Console. The matching callback handler
      // lives at /api/oauth/google/callback in server/_core/index.ts. Honors the
      // GOOGLE_REDIRECT_URI override just like that handler does.
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:3000'}/api/oauth/google/callback`;
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly');
      const { createSignedOAuthState } = await import('../_core/crypto');
      const state = createSignedOAuthState({ userId: ctx.user.id, provider: 'google' });

      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
      
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
        
        const url = `https://www.googleapis.com/drive/v3/files?q=(mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='text/csv')&fields=files(id,name,modifiedTime,owners,mimeType)&orderBy=modifiedTime desc&pageSize=100${input?.pageToken ? `&pageToken=${input.pageToken}` : ''}`;
        
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
    importData: protectedProcedure
      .input(z.object({
        targetModule: z.enum(['customers', 'vendors', 'products', 'invoices', 'employees', 'contracts', 'projects', 'project_tasks']),
        data: z.array(z.record(z.string(), z.string())),
        columnMapping: z.record(z.string(), z.string()), // Maps sheet column to ERP field
      }))
      .mutation(async ({ input, ctx }) => {
        const { targetModule, data, columnMapping } = input;
        const results = { imported: 0, failed: 0, errors: [] as string[] };
        // Projects/tasks are matched by name, so a row that already exists is
        // skipped rather than duplicated — it counts as neither imported nor
        // failed. `projectIds` caches task → project lookups across the rows.
        const projectIds = new Map<string, number>();
        const scope = {
          createdBy: ctx.user.id,
          companyId: (ctx.user as any).companyId as number | undefined,
        };
        
        for (const row of data) {
          try {
            // Coerce + validate the row against the destination's field catalogue.
            // What the UI advertises == what we persist (see shared/importFields.ts).
            const { record, errors: rowErrors } = buildImportRecord(row, columnMapping, targetModule);
            if (rowErrors.length > 0) {
              results.errors.push(rowErrors[0]);
              results.failed++;
              continue;
            }

            // Per-module glue: generated numbers + synthetic/derived columns.
            switch (targetModule) {
              case 'customers':
                await db.createCustomer(record as any);
                break;

              case 'vendors':
                await db.createVendor(record as any);
                break;

              case 'products':
                await db.createProduct({
                  ...record,
                  sku: record.sku || generateNumber('PROD'),
                  unitPrice: record.unitPrice ?? '0', // NOT NULL on the table
                } as any);
                break;

              case 'employees':
                await db.createEmployee({
                  ...record,
                  employeeNumber: generateNumber('EMP'),
                } as any);
                break;

              case 'invoices': {
                const amount = record.amount ?? '0';
                delete record.amount; // synthetic -> subtotal/total below
                await db.createInvoice({
                  ...record,
                  invoiceNumber: generateNumber('INV'),
                  issueDate: new Date(),
                  dueDate: record.dueDate ?? new Date(),
                  subtotal: amount,
                  totalAmount: amount,
                } as any);
                break;
              }

              case 'contracts':
                await db.createContract({
                  ...record,
                  contractNumber: generateNumber('CON'),
                  type: record.type || 'service', // NOT NULL, no default
                } as any);
                break;

              case 'projects': {
                const { created } = await importProjectRecord(record, scope);
                if (created) results.imported++;
                continue;
              }

              case 'project_tasks': {
                const { created } = await importProjectTaskRecord(record, scope, projectIds);
                if (created) results.imported++;
                continue;
              }
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

    // Sync all Google Drive spreadsheets automatically
    // Detect the destination type of each spreadsheet WITHOUT importing, so the
    // UI can let the user confirm or override the target before any write.
    previewGoogleDrive: protectedProcedure
      .input(z.object({ fileIds: z.array(z.string()).optional() }).optional())
      .query(async ({ input, ctx }) => {
        const { accessToken, error: tokenError } = await getValidGoogleToken(ctx.user.id);
        if (tokenError || !accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: tokenError || 'Google not connected. Go to Settings to connect your Google account.' });
        }

        const sheetsResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=(mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='text/csv')&fields=files(id,name,modifiedTime,mimeType)&orderBy=modifiedTime desc&pageSize=100`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!sheetsResponse.ok) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list Google Sheets from Drive' });
        }
        const sheetsData = await sheetsResponse.json();
        let files = sheetsData.files || [];
        const wanted = input?.fileIds && input.fileIds.length > 0 ? new Set(input.fileIds) : null;
        if (wanted) files = files.filter((f: any) => wanted.has(f.id));

        const previews: { fileId: string; fileName: string; detectedType: string; rowCount: number; supported: boolean }[] = [];
        for (const file of files) {
          try {
            let data: any;
            const dataResponse = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/Sheet1?majorDimension=ROWS`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            if (dataResponse.ok) {
              data = await dataResponse.json();
            } else {
              const fallback = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/A:ZZ?majorDimension=ROWS`,
                { headers: { Authorization: `Bearer ${accessToken}` } },
              );
              if (!fallback.ok) {
                previews.push({ fileId: file.id, fileName: file.name, detectedType: 'error', rowCount: 0, supported: false });
                continue;
              }
              data = await fallback.json();
            }
            const rows = data.values || [];
            if (rows.length < 2) {
              previews.push({ fileId: file.id, fileName: file.name, detectedType: 'skipped', rowCount: 0, supported: false });
              continue;
            }
            const headers: string[] = rows[0].map((h: string) => h.toLowerCase().trim());
            const detectedType = detectSheetType(headers);
            previews.push({
              fileId: file.id,
              fileName: file.name,
              detectedType,
              rowCount: rows.length - 1,
              supported: (DRIVE_SUPPORTED_TYPES as readonly string[]).includes(detectedType),
            });
          } catch (e: any) {
            previews.push({ fileId: file.id, fileName: file.name, detectedType: 'error', rowCount: 0, supported: false });
          }
        }
        return { previews };
      }),

    syncGoogleDrive: protectedProcedure
      .input(z.object({
        // When provided, import ONLY these files using the user-confirmed type
        // (overriding auto-detection). Omitted = legacy "detect & import all".
        selections: z.array(z.object({
          fileId: z.string(),
          type: z.enum(DRIVE_SUPPORTED_TYPES),
        })).optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        // 1. Get valid Google OAuth token
        const { accessToken, error: tokenError } = await getValidGoogleToken(ctx.user.id);
        if (tokenError || !accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: tokenError || 'Google not connected. Go to Settings to connect your Google account.' });
        }

        const forcedTypes = input?.selections && input.selections.length > 0
          ? new Map(input.selections.map((s) => [s.fileId, s.type as string]))
          : null;

        // 2. Read + import every (selected) spreadsheet
        const { results, totalSheets } = await importDriveFiles({
          userId: ctx.user.id,
          companyId: (ctx.user as any).companyId as number | undefined,
          accessToken,
          forcedTypes,
        });

        // 3. Audit log
        const totalImported = results.reduce((sum, r) => sum + r.imported, 0);
        await createAuditLog(ctx.user.id, 'create', 'google_drive_sync', 0, `Synced ${totalImported} records from ${totalSheets} sheets`);

        // Persist detailed sync results to syncLogs so they survive page reload
        await db.createSyncLog({
          integration: 'google_drive',
          action: 'full_sync',
          status: totalImported > 0 ? 'success' : 'warning',
          details: `Synced ${totalImported} records from ${totalSheets} sheets`,
          recordsProcessed: totalImported,
          recordsFailed: results.reduce((sum, r) => sum + r.errors.length, 0),
          metadata: { results, totalSheets, userId: ctx.user.id },
        });

        return { results, totalSheets };
      }),

    // Kick off a Google Drive import that runs in the BACKGROUND on the server.
    // Unlike syncGoogleDrive (which imports inline and only returns when done),
    // this creates a "pending" syncLog job row, returns its id immediately, and
    // continues the import detached from the request. The client polls
    // getSyncStatus and can reconnect to a running job via getActiveSync — so
    // navigating away from the Import page no longer stops the import.
    startSyncGoogleDrive: protectedProcedure
      .input(z.object({
        selections: z.array(z.object({
          fileId: z.string(),
          type: z.enum(DRIVE_SUPPORTED_TYPES),
        })).optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        // Validate the token up front so connection problems surface immediately
        // (before we tell the client the job is running).
        const { accessToken, error: tokenError } = await getValidGoogleToken(ctx.user.id);
        if (tokenError || !accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: tokenError || 'Google not connected. Go to Settings to connect your Google account.' });
        }

        const forcedTypes = input?.selections && input.selections.length > 0
          ? new Map(input.selections.map((s) => [s.fileId, s.type as string]))
          : null;
        const userId = ctx.user.id;
        const companyId = (ctx.user as any).companyId as number | undefined;

        // One import at a time per user. A second run would read the same
        // sheets concurrently and — because a project/task is matched by name
        // before it is inserted — could duplicate rows the first run is still
        // creating. Hand back the running job so the client just reconnects.
        const running = await findActiveDriveSyncJob(userId);
        if (running) return { jobId: running.id };

        // Create the job row up front so the client (and getActiveSync) can find it.
        const { id: jobId } = await db.createSyncLog({
          integration: 'google_drive',
          action: 'full_sync',
          status: 'pending',
          details: 'Import in progress…',
          recordsProcessed: 0,
          recordsFailed: 0,
          metadata: { status: 'running', results: [], totalSheets: 0, processedSheets: 0, userId, startedAt: new Date().toISOString() },
        });

        // Detached background runner — intentionally not awaited. The Express
        // server is long-lived, so this keeps running after the response is sent
        // and after the client navigates away.
        void (async () => {
          try {
            const { results, totalSheets } = await importDriveFiles({
              userId,
              companyId,
              accessToken,
              forcedTypes,
              onProgress: async ({ results, totalSheets, processedSheets, currentFile }) => {
                await db.updateSyncLog(jobId, {
                  recordsProcessed: results.reduce((sum, r) => sum + r.imported, 0),
                  recordsFailed: results.reduce((sum, r) => sum + r.errors.length, 0),
                  metadata: { status: 'running', results, totalSheets, processedSheets, currentFile, userId },
                }).catch(() => { /* best-effort progress */ });
              },
            });

            const totalImported = results.reduce((sum, r) => sum + r.imported, 0);
            await createAuditLog(userId, 'create', 'google_drive_sync', 0, `Synced ${totalImported} records from ${totalSheets} sheets`);
            await db.updateSyncLog(jobId, {
              status: totalImported > 0 ? 'success' : 'warning',
              details: `Synced ${totalImported} records from ${totalSheets} sheets`,
              recordsProcessed: totalImported,
              recordsFailed: results.reduce((sum, r) => sum + r.errors.length, 0),
              metadata: { status: 'done', results, totalSheets, processedSheets: results.length, userId },
            });
          } catch (e: any) {
            await db.updateSyncLog(jobId, {
              status: 'error',
              details: 'Import failed',
              errorMessage: e?.message ?? 'Unknown error',
              metadata: { status: 'error', error: e?.message ?? 'Unknown error', results: [], totalSheets: 0, processedSheets: 0, userId },
            }).catch(() => { /* nothing more we can do */ });
          }
        })();

        return { jobId };
      }),

    // Poll the status of a background import job started by startSyncGoogleDrive.
    getSyncStatus: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const log = await db.getSyncLog(input.jobId);
        // Fail closed: only expose Google Drive import jobs owned by the caller.
        // syncLogs has no userId column and other integrations write rows without
        // metadata.userId, so a missing owner must be treated as "not yours".
        if (!log || log.integration !== 'google_drive') return null;
        const meta = (log.metadata as any) || {};
        if (meta.userId !== ctx.user.id) return null;
        const state: 'running' | 'done' | 'error' =
          meta.status === 'done' ? 'done'
          : meta.status === 'error' || log.status === 'error' ? 'error'
          : log.status === 'pending' ? 'running'
          : 'done';
        return {
          jobId: log.id,
          state,
          results: (meta.results as DriveSyncResult[]) || [],
          totalSheets: meta.totalSheets || 0,
          processedSheets: meta.processedSheets || 0,
          currentFile: meta.currentFile || null,
          error: meta.error || log.errorMessage || null,
          syncedAt: log.createdAt,
        };
      }),

    // Find the caller's most recent still-running import so the Import page can
    // reconnect to it on mount (after navigation / reload / tab close). Ignores
    // jobs older than an hour, which are treated as stale/abandoned.
    getActiveSync: protectedProcedure.query(async ({ ctx }) => {
      const active = await findActiveDriveSyncJob(ctx.user.id);
      if (!active) return null;
      const meta = (active.metadata as any) || {};
      return {
        jobId: active.id,
        state: 'running' as const,
        results: (meta.results as DriveSyncResult[]) || [],
        totalSheets: meta.totalSheets || 0,
        processedSheets: meta.processedSheets || 0,
        currentFile: meta.currentFile || null,
        syncedAt: active.createdAt,
      };
    }),

    // List files from Google Drive (all types, not just spreadsheets)
    listDriveFiles: protectedProcedure
      .input(z.object({
        mimeType: z.enum([
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.google-apps.presentation',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]).optional(),
        pageToken: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { accessToken, error: tokenError } = await getValidGoogleToken(ctx.user.id);
        if (tokenError || !accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: tokenError || 'Google not connected' });
        }

        let query = 'trashed=false';
        if (input?.mimeType) {
          // mimeType is validated against an enum above — safe to interpolate
          query += ` and mimeType='${input.mimeType}'`;
        }

        const params = new URLSearchParams({
          q: query,
          fields: 'files(id,name,mimeType,modifiedTime,size),nextPageToken',
          orderBy: 'modifiedTime desc',
          pageSize: '30',
        });
        if (input?.pageToken) {
          params.set('pageToken', input.pageToken);
        }

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!response.ok) {
          if (response.status === 401) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google token expired. Please reconnect.' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list Drive files' });
        }

        const data = await response.json();
        return {
          files: data.files || [],
          nextPageToken: data.nextPageToken || null,
        };
      }),

    // Export / download a file from Google Drive
    exportFile: protectedProcedure
      .input(z.object({
        fileId: z.string().min(1),
        exportFormat: z.enum(['pdf', 'xlsx', 'docx', 'csv']),
      }))
      .mutation(async ({ ctx, input }) => {
        const { accessToken, error: tokenError } = await getValidGoogleToken(ctx.user.id);
        if (tokenError || !accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: tokenError || 'Google not connected' });
        }

        const { fileId, exportFormat } = input;

        // Fetch file metadata from Drive — never trust client-supplied mimeType/name
        const metaResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id%2Cname%2CmimeType`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!metaResp.ok) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found or access denied' });
        }
        const meta = await metaResp.json() as { id: string; name: string; mimeType: string };
        const fileMimeType = meta.mimeType;
        // Sanitize filename: strip path separators and control characters, ensure non-empty
        const rawName = meta.name ?? 'download';
        const safeName = rawName.replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_').trim() || 'download';

        // Determine the download URL based on file type
        let url: string;
        let outputMimeType: string;
        let extension: string;

        const isGoogleDoc = fileMimeType === 'application/vnd.google-apps.document';
        const isGoogleSheet = fileMimeType === 'application/vnd.google-apps.spreadsheet';
        const isGoogleSlides = fileMimeType === 'application/vnd.google-apps.presentation';

        const exportMimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          csv: 'text/csv',
        };

        if (isGoogleDoc || isGoogleSheet || isGoogleSlides) {
          // Google Workspace files need export
          outputMimeType = exportMimeTypes[exportFormat];
          url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(outputMimeType)}`;
          extension = exportFormat;
        } else {
          // Native files (PDF, XLSX, etc.) — direct download
          url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
          outputMimeType = fileMimeType;
          const extMap: Record<string, string> = {
            'application/pdf': 'pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'text/csv': 'csv',
          };
          extension = extMap[fileMimeType] || exportFormat;
        }

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown error');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to export file: ${response.status} ${errText.slice(0, 200)}`,
          });
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        // Build filename with correct extension (strip any existing extension from safe name)
        const baseName = safeName.replace(/\.[^/.]+$/, '');
        const outputFilename = `${baseName}.${extension}`;

        return {
          filename: outputFilename,
          base64,
          mimeType: outputMimeType,
          size: arrayBuffer.byteLength,
        };
      }),

    // Get past Google Drive sync history so results persist across page reloads
    getSyncHistory: protectedProcedure.query(async ({ ctx }) => {
      // Fetch a wider window then scope to the caller — these logs contain
      // per-import details/results and must not leak across users. A "pending"
      // row is a background job still in progress (surfaced via getSyncStatus).
      const history = await db.getSyncHistory(100);
      return history
        .filter((log: any) =>
          log.integration === 'google_drive' &&
          log.status !== 'pending' &&
          (log.metadata as any)?.userId === ctx.user.id)
        .slice(0, 20)
        .map((log: any) => ({
          id: log.id,
          status: log.status,
          details: log.details,
          recordsProcessed: log.recordsProcessed,
          recordsFailed: log.recordsFailed,
          results: (log.metadata as any)?.results || [],
          totalSheets: (log.metadata as any)?.totalSheets || 0,
          syncedAt: log.createdAt,
        }));
    }),
  });

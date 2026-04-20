import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { syncDriveFolder, listDriveFolders, getFolderInfo, getSimpleFileType } from "../_core/googleDrive";
import { router, publicProcedure, protectedProcedure, getValidGoogleToken } from "./middleware";
import type { InsertDataRoomDriveSyncConfig } from "../../drizzle/schema";

// Hash a data-room/link password using scrypt (salted KDF).
function hashDataRoomPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Verify a data-room/link password against a stored hash.
// Supports legacy unsalted SHA-256 hashes (stored as plain 64-char hex) for backward compatibility.
function verifyDataRoomPassword(password: string, stored: string): { valid: boolean; needsUpgrade: boolean } {
  if (stored.includes(':')) {
    // Current format: scrypt salt:hash
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return { valid: false, needsUpgrade: false };
    const computed = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hash, 'hex');
    const valid = computed.length === storedBuf.length && timingSafeEqual(computed, storedBuf);
    return {
      valid,
      needsUpgrade: false,
    };
  }

  // Legacy format: plain SHA-256 hex (no salt) — read-only backward-compat verification path.
  // New passwords are always stored as scrypt above. SHA-256 is only used here to verify
  // passwords that were hashed before the scrypt migration; no new SHA-256 hashes are created.
  // lgtm[js/insufficient-password-hash]
  const computed = createHash('sha256').update(password).digest();
  const storedBuf = Buffer.from(stored, 'hex');
  const valid = computed.length === storedBuf.length && timingSafeEqual(computed, storedBuf);
  return { valid, needsUpgrade: valid };
}

export const dataRoomRouter = router({
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
        requiresEmail: z.boolean().default(false),
        enableWatermark: z.boolean().default(false),
        brandingLogo: z.string().optional(),
        brandingColor: z.string().optional(),
        brandingCompanyName: z.string().optional(),
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
          hashedPassword = hashDataRoomPassword(input.password);
        }

        const { enableWatermark, ...rest } = input;
        const { id } = await db.createDataRoom({
          ...rest,
          password: hashedPassword,
          ownerId: ctx.user.id,
          watermarkEnabled: enableWatermark ?? false,
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
        requiresEmail: z.boolean().optional(),
        enableWatermark: z.boolean().optional(),
        brandingLogo: z.string().nullable().optional(),
        brandingColor: z.string().nullable().optional(),
        brandingCompanyName: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const room = await db.getDataRoomById(input.id);
        if (!room) throw new TRPCError({ code: 'NOT_FOUND' });
        if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        const { id, password, enableWatermark, ...updateData } = input;
        let hashedPassword = undefined;
        if (password !== undefined) {
          if (password === null) {
            hashedPassword = null;
          } else {
            hashedPassword = hashDataRoomPassword(password);
          }
        }

        await db.updateDataRoom(id, {
          ...updateData,
          ...(hashedPassword !== undefined && { password: hashedPassword }),
          ...(enableWatermark !== undefined && { watermarkEnabled: enableWatermark }),
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
            hashedPassword = hashDataRoomPassword(input.password);
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

          // Send invitation email
          try {
            if (isEmailConfigured()) {
              const dataRoom = await db.getDataRoomById(input.dataRoomId);
              const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/share/${inviteCode}`;
              await sendEmail({
                to: input.email,
                subject: `You've been invited to a Data Room${dataRoom ? `: ${dataRoom.name}` : ''}`,
                html: formatEmailHtml(
                  `Hello${input.name ? ` ${input.name}` : ''},\n\n` +
                  `You have been invited to access a secure data room${dataRoom ? ` "${dataRoom.name}"` : ''} with ${input.role} permissions.\n\n` +
                  `${input.message ? `Message from the sender:\n${input.message}\n\n` : ''}` +
                  `Click the link below to access the data room:\n${inviteUrl}\n\n` +
                  `This invitation${input.expiresAt ? ` expires on ${input.expiresAt.toLocaleDateString()}` : ' does not expire'}.`
                ),
              });
            }
          } catch (emailErr) {
            console.warn("[DataRoom] Failed to send invitation email:", emailErr);
          }

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
          const invitation = await db.getInvitationByIdWithDataRoom(input.id);
          if (!invitation) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
          }
          try {
            if (isEmailConfigured()) {
              const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/share/${invitation.inviteCode}`;
              await sendEmail({
                to: invitation.email,
                subject: `Reminder: You've been invited to a Data Room${invitation.dataRoomName ? `: ${invitation.dataRoomName}` : ''}`,
                html: formatEmailHtml(
                  `Hello${invitation.name ? ` ${invitation.name}` : ''},\n\n` +
                  `This is a reminder that you have been invited to access a secure data room${invitation.dataRoomName ? ` "${invitation.dataRoomName}"` : ''}.\n\n` +
                  `Click the link below to access the data room:\n${inviteUrl}`
                ),
              });
            }
          } catch (emailErr) {
            console.warn("[DataRoom] Failed to resend invitation email:", emailErr);
          }
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

          // Check data room level email gate
          const dataRoom = await db.getDataRoomById(link.dataRoomId);
          if (dataRoom?.requiresEmail && !input.visitorInfo?.email) {
            return { requiresInfo: true, requiredFields: ['email'], dataRoomId: null, visitorId: null };
          }

          // Check password
          if (link.password) {
            if (!input.password) {
              return { requiresPassword: true, dataRoomId: null, visitorId: null };
            }
            const passwordCheck = verifyDataRoomPassword(input.password, link.password);
            if (!passwordCheck.valid) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' });
            }

            // Seamlessly upgrade legacy SHA-256 hashes to salted scrypt after successful verification.
            if (passwordCheck.needsUpgrade) {
              const upgradedHash = hashDataRoomPassword(input.password);
              await db.updateDataRoomLink(link.id, { password: upgradedHash });            }
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
            const { generateWatermarkData, generateWatermarkText } = await import('../_core/documentWatermark');
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
              requiresEmail: room.requiresEmail,
              brandingLogo: room.brandingLogo,
              brandingColor: room.brandingColor,
              brandingCompanyName: room.brandingCompanyName,
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

          // Update engagement scoring for the visitor
          try {
            const visitor = await db.getDataRoomVisitorById(input.visitorId);
            if (visitor) {
              const durationMinutes = Math.floor((input.duration || 0) / 60);
              const newPagesViewed = (input.pagesViewed?.length || 0);
              // +1 per document viewed, +1 per minute spent
              const scoreIncrement = 1 + durationMinutes;
              await db.updateDataRoomVisitor(visitor.id, {
                engagementScore: (visitor.engagementScore || 0) + scoreIncrement,
                pagesViewed: (visitor.pagesViewed || 0) + newPagesViewed,
                totalTimeSpent: (visitor.totalTimeSpent || 0) + (input.duration || 0),
                lastViewedAt: new Date(),
              });
            }
          } catch (err) {
            console.warn("[DataRoom] Failed to update engagement score:", err);
          }

          // Send real-time view notification to data room owner
          try {
            const document = await db.getDataRoomDocumentById(input.documentId);
            if (document) {
              const dataRoom = await db.getDataRoomById(document.dataRoomId);
              if (dataRoom) {
                const visitor = await db.getDataRoomVisitorById(input.visitorId);
                const visitorName = visitor?.name || visitor?.email || 'Anonymous visitor';
                const link = input.linkId ? await db.getDataRoomLinkByCode('') : null; // We have linkId not code
                await db.createNotification({
                  userId: dataRoom.ownerId,
                  type: 'data_room_view',
                  title: `${visitorName} is viewing "${dataRoom.name}"`,
                  message: `Viewing document: ${document.name}`,
                  entityType: 'data_room',
                  entityId: dataRoom.id,
                  severity: 'info',
                  link: `/data-rooms/${dataRoom.id}`,
                });
              }
            }
          } catch (err) {
            console.warn("[DataRoom] Failed to send view notification:", err);
          }

          return { id };
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
          fileContent: z.string(),
          mimeType: z.string().optional(),
          fileSize: z.number().optional(),
          pageCount: z.number().optional(),
          requiresSignature: z.boolean().optional(),
          allowTypedSignature: z.boolean().optional(),
          allowDrawnSignature: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { fileContent, ...rest } = input;
          const buffer = Buffer.from(fileContent, 'base64');
          const key = `nda/${input.dataRoomId}/${Date.now()}-${input.name}`;
          const mimeType = input.mimeType || 'application/pdf';
          const { url } = await storagePut(key, buffer, mimeType);
          const { id } = await db.createNdaDocument({
            ...rest,
            storageKey: key,
            storageUrl: url,
            uploadedBy: ctx.user.id,
          });
          return { id, url };
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
          consentCheckbox: z.literal(true),
        }))
        .mutation(async ({ input, ctx }) => {
          // Get the NDA document
          const ndaDoc = await db.getNdaDocumentById(input.ndaDocumentId);
          if (!ndaDoc) throw new TRPCError({ code: 'NOT_FOUND', message: 'NDA document not found' });
          if (ndaDoc.dataRoomId !== input.dataRoomId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'NDA document does not belong to this data room' });

          // Get IP address from request
          const ipAddress = ctx.req.headers['x-forwarded-for'] as string || ctx.req.socket.remoteAddress || 'unknown';
          const userAgent = ctx.req.headers['user-agent'] || '';

          // Store signature image if drawn
          let signatureImageUrl: string | undefined;
          if (input.signatureType === 'drawn' && input.signatureData.startsWith('data:image')) {
            const { storagePut } = await import('../storage');
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
            const { sendEmail } = await import('../_core/email');
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
        .query(async ({ input, ctx }) => {
          // Check authorization
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }
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
          // Check authorization
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }

          const existingConfig = await db.getDriveSyncConfig(input.dataRoomId);

          const configData: Omit<InsertDataRoomDriveSyncConfig, 'id'> = {
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
        .mutation(async ({ input, ctx }) => {
          // Check authorization
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }
          await db.deleteDriveSyncConfig(input.dataRoomId);
          return { success: true };
        }),

      // Get sync logs
      getLogs: protectedProcedure
        .input(z.object({ dataRoomId: z.number(), limit: z.number().default(50) }))
        .query(async ({ input, ctx }) => {
          // Check authorization
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }
          return db.getDriveSyncLogs(input.dataRoomId, input.limit);
        }),

      // Trigger manual sync
      syncNow: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          // Check authorization
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }

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
            // Get Google OAuth token for the user configured for sync (or current user as fallback)
            const syncUserId = config.syncUserId || ctx.user.id;
            const { accessToken: syncAccessToken, error: tokenError } = await getValidGoogleToken(syncUserId);
            if (tokenError || !syncAccessToken) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: tokenError || 'Google Drive not connected. Please connect your Google account first.' });
            }

            // Import Google Drive sync service
            const { syncGoogleDriveFolder } = await import('../googleDriveSyncService');

            const result = await syncGoogleDriveFolder({
              dataRoomId: input.dataRoomId,
              folderId: config.googleDriveFolderId,
              accessToken: syncAccessToken,
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
          const { accessToken, error: tokenError } = await getValidGoogleToken(ctx.user.id);
          if (tokenError || !accessToken) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: tokenError || 'Google Drive not connected' });
          }

          const { listGoogleDriveFolders } = await import('../googleDriveSyncService');
          return listGoogleDriveFolders(accessToken, input.parentId);
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
          sessionToken: z.string(), // Session token to verify the page view belongs to the current visitor session
          durationMs: z.number(),
          scrollDepth: z.number().optional(),
          mouseMovements: z.number().optional(),
          clicks: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          // Verify the page view belongs to this session
          const pageView = await db.getDocumentPageViewById(input.id);
          
          if (!pageView) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Page view not found' });
          }

          // Verify session token matches (get session for this page view's visitor)
          const sessions = await db.getVisitorSessions(pageView.visitorId);
          const validSession = sessions.find(s => s.sessionToken === input.sessionToken);
          
          if (!validSession) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session token' });
          }

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
          const sessionToken = `sess_${nanoid()}`;
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
        .input(z.object({ dataRoomId: z.number(), email: z.string().email() }))
        .query(async ({ input }) => {
          const result = await db.checkEmailAccess(input.dataRoomId, input.email);
          if (!result) {
            return { allowed: false, permissions: undefined };
          }
          const { allowed, permissions } = result as { allowed: boolean; permissions?: unknown };
          return { allowed, permissions };
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
          type: z.enum(['visitors', 'documents']), // Only supported types
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

    // ============================================
    // DUE DILIGENCE CHECKLISTS
    // ============================================
    dueDiligence: router({
      // Get checklist summary for a data room
      getSummary: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getChecklistSummary(input.dataRoomId);
        }),

      // List all checklists for a data room
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return db.getDataRoomChecklists(input.dataRoomId);
        }),

      // Get a checklist with all its items
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return db.getChecklistWithItems(input.id);
        }),

      // Create a standard due diligence checklist
      createStandard: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          checklistType: z.enum(['fundraising', 'ma', 'full', 'series_b']).default('full'),
          customName: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const checklist = await db.createStandardChecklist(
            input.dataRoomId,
            ctx.user.id,
            input.checklistType,
            input.customName
          );
          return checklist;
        }),

      // Create from a template
      createFromTemplate: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          templateId: z.number(),
          customName: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          return db.createChecklistFromTemplate(
            input.dataRoomId,
            input.templateId,
            ctx.user.id,
            input.customName
          );
        }),

      // Auto-match documents against checklist items
      autoMatch: protectedProcedure
        .input(z.object({ checklistId: z.number() }))
        .mutation(async ({ input }) => {
          return db.autoMatchChecklistDocuments(input.checklistId);
        }),

      // Update checklist item status
      updateItem: protectedProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['missing', 'partial', 'complete', 'not_applicable', 'waived']).optional(),
          notes: z.string().optional(),
          internalNotes: z.string().optional(),
          waiverReason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, waiverReason, ...data } = input;

          const updateData: any = { ...data };

          // If waiving the item, set the waiver info
          if (input.status === 'waived' && waiverReason) {
            updateData.waivedBy = ctx.user.id;
            updateData.waivedAt = new Date();
            updateData.waiverReason = waiverReason;
          }

          await db.updateChecklistItem(id, updateData);

          // Get the item to recalculate parent checklist
          const item = await db.getChecklistItemById(id);
          if (item) {
            await db.recalculateChecklistProgress(item.checklistId);
          }

          return { success: true };
        }),

      // Link a document to a checklist item
      linkDocument: protectedProcedure
        .input(z.object({
          itemId: z.number(),
          documentId: z.number(),
        }))
        .mutation(async ({ input }) => {
          const item = await db.getChecklistItemById(input.itemId);
          if (!item) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist item not found' });
          }

          let linkedIds: number[] = [];
          try {
            linkedIds = item.linkedDocumentIds ? JSON.parse(item.linkedDocumentIds) : [];
          } catch (e) {
            linkedIds = [];
          }

          if (!linkedIds.includes(input.documentId)) {
            linkedIds.push(input.documentId);
          }

          await db.updateChecklistItem(input.itemId, {
            linkedDocumentIds: JSON.stringify(linkedIds),
            linkedDocumentCount: linkedIds.length,
            status: linkedIds.length > 0 ? 'complete' : 'missing',
          });

          await db.recalculateChecklistProgress(item.checklistId);

          return { success: true };
        }),

      // Unlink a document from a checklist item
      unlinkDocument: protectedProcedure
        .input(z.object({
          itemId: z.number(),
          documentId: z.number(),
        }))
        .mutation(async ({ input }) => {
          const item = await db.getChecklistItemById(input.itemId);
          if (!item) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist item not found' });
          }

          let linkedIds: number[] = [];
          try {
            linkedIds = item.linkedDocumentIds ? JSON.parse(item.linkedDocumentIds) : [];
          } catch (e) {
            linkedIds = [];
          }

          linkedIds = linkedIds.filter(id => id !== input.documentId);

          await db.updateChecklistItem(input.itemId, {
            linkedDocumentIds: JSON.stringify(linkedIds),
            linkedDocumentCount: linkedIds.length,
            status: linkedIds.length > 0 ? 'complete' : 'missing',
          });

          await db.recalculateChecklistProgress(item.checklistId);

          return { success: true };
        }),

      // Add a custom item to a checklist
      addItem: protectedProcedure
        .input(z.object({
          checklistId: z.number(),
          categoryName: z.string(),
          itemName: z.string(),
          itemDescription: z.string().optional(),
          requirement: z.enum(['required', 'conditional', 'optional']).default('required'),
          matchKeywords: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input }) => {
          const checklist = await db.getDataRoomChecklistById(input.checklistId);
          if (!checklist) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist not found' });
          }

          const result = await db.createDataRoomChecklistItem({
            checklistId: input.checklistId,
            dataRoomId: checklist.dataRoomId,
            categoryName: input.categoryName,
            itemName: input.itemName,
            itemDescription: input.itemDescription,
            requirement: input.requirement,
            matchKeywords: input.matchKeywords ? JSON.stringify(input.matchKeywords) : undefined,
            status: 'missing',
          });

          await db.recalculateChecklistProgress(input.checklistId);

          return result;
        }),

      // Delete a checklist item
      deleteItem: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const item = await db.getChecklistItemById(input.id);
          if (item) {
            await db.deleteChecklistItem(input.id);
            await db.recalculateChecklistProgress(item.checklistId);
          }
          return { success: true };
        }),

      // Delete entire checklist
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteDataRoomChecklist(input.id);
          return { success: true };
        }),

      // Review an item
      reviewItem: protectedProcedure
        .input(z.object({
          id: z.number(),
          reviewStatus: z.enum(['pending', 'approved', 'needs_attention', 'rejected']),
          reviewNotes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          await db.updateChecklistItem(input.id, {
            reviewStatus: input.reviewStatus,
            reviewNotes: input.reviewNotes,
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
          } as any);
          return { success: true };
        }),
    }),
  }),
});

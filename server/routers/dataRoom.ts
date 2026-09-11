// appRouter.dataRoom — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as db from "../db";
import { storagePut, storageDelete } from "../storage";
import { nanoid } from "nanoid";
import { listDriveFiles, getFileMetadata, getFolderInfo, getSimpleFileType, searchDriveFoldersByName } from "../_core/googleDrive";
import { adminProcedure, contractorProcedure, createAuditLog, getValidGoogleToken, hashPassword, verifyPassword, assertEmailAccessRuleOwnership } from "./_shared";

// ============================================
// DATA ROOM
// ============================================
export const dataRoomRouter = router({
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
          hashedPassword = await hashPassword(input.password);
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
        showLiveFinancials: z.boolean().optional(),
        liveFinancialsIncludeAr: z.boolean().optional(),
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
            hashedPassword = await hashPassword(password);
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
    // Contractor-facing read-only documents. Reuses the data-room folder/doc
    // tables (and therefore the Google Drive sync), but scopes by the logged-in
    // user's role + individual grants instead of an email invite / link code.
    contractor: router({
      // Folders + documents this contractor may see, across all data rooms.
      getContent: contractorProcedure.query(async ({ ctx }) => {
        const folders = await db.getAccessibleDataRoomFoldersForUser(ctx.user.id, ctx.user.role);
        const folderIds = folders.map((f) => f.id);
        const documents = (await db.getDataRoomDocumentsInFolders(folderIds)).filter(
          (d) => !d.isHidden,
        );
        return { folders, documents };
      }),

      // Open one document — verifies it lives in a folder the user may access.
      getDocument: contractorProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
          const doc = await db.getDataRoomDocumentById(input.id);
          if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
          const folders = await db.getAccessibleDataRoomFoldersForUser(ctx.user.id, ctx.user.role);
          const allowed = new Set(folders.map((f) => f.id));
          if (doc.folderId == null || !allowed.has(doc.folderId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this document' });
          }
          return doc;
        }),

      // Admin: list a contractor user's per-folder grants.
      listGrants: adminProcedure
        .input(z.object({ userId: z.number() }))
        .query(async ({ input }) => db.getContractorFolderGrants(input.userId)),

      // Admin: every folder (with its data room) for the access picker.
      listAllFolders: adminProcedure.query(async () => db.getAllDataRoomFoldersWithRoom()),

      // Admin: grant or restrict a specific folder for a contractor user.
      setGrant: adminProcedure
        .input(z.object({
          userId: z.number(),
          folderId: z.number(),
          mode: z.enum(['allow', 'restrict']),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createContractorFolderGrant({
            userId: input.userId,
            folderId: input.folderId,
            mode: input.mode,
            grantedBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'contractor_folder_grant', result.id);
          return result;
        }),

      // Admin: remove a grant/restriction for a contractor user.
      removeGrant: adminProcedure
        .input(z.object({ userId: z.number(), folderId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteContractorFolderGrant(input.userId, input.folderId);
          await createAuditLog(ctx.user.id, 'delete', 'contractor_folder_grant', input.folderId);
          return { success: true };
        }),

      // Admin: set which app roles can see a folder (role-wide visibility).
      setFolderVisibility: adminProcedure
        .input(z.object({
          folderId: z.number(),
          visibleToRoles: z.array(z.string()),
        }))
        .mutation(async ({ input, ctx }) => {
          await db.updateDataRoomFolder(input.folderId, { visibleToRoles: input.visibleToRoles });
          await createAuditLog(ctx.user.id, 'update', 'data_room_folder', input.folderId, undefined, undefined, { visibleToRoles: input.visibleToRoles });
          return { success: true };
        }),
    }),

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
          const key = `dataroom/${input.dataRoomId}/${nanoid()}-${input.name.replace(/[/\\]/g, '_')}`;
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

      // Refresh a single Drive-backed document from Google Drive — pulls the
      // latest metadata (name, size, mime type, web view link, thumbnail) and
      // bumps the document's version. The bytes themselves still stream
      // through /api/drive/proxy so no download is needed.
      refreshFromDrive: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const doc = await db.getDataRoomDocumentById(input.id);
          if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
          if (doc.storageType !== 'google_drive' || !doc.googleDriveFileId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'This file is not linked to Google Drive. Use "Upload new version" instead.',
            });
          }

          const room = await db.getDataRoomById(doc.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }

          // Drive bytes are fetched with the data room owner's OAuth token
          // (matching /api/drive/proxy), so admins can refresh without
          // having connected their own Google account.
          const { accessToken, error } = await getValidGoogleToken(room.ownerId);
          if (error) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });

          const { file: driveFile, error: metaError } = await getFileMetadata(accessToken, doc.googleDriveFileId);
          if (metaError || !driveFile) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: metaError || 'File not found in Google Drive' });
          }

          const fileSize: number | undefined = driveFile.size && !isNaN(parseInt(driveFile.size))
            ? parseInt(driveFile.size)
            : undefined;

          const newVersion = await db.updateDataRoomDocumentBumpVersion(doc.id, {
            name: driveFile.name,
            fileType: getSimpleFileType(driveFile.mimeType),
            mimeType: driveFile.mimeType,
            fileSize,
            storageUrl: driveFile.webViewLink || undefined,
            googleDriveWebViewLink: driveFile.webViewLink,
            thumbnailUrl: driveFile.thumbnailLink,
          });

          return { success: true, name: driveFile.name, version: newVersion };
        }),

      // Replace a document's contents with a new uploaded file. Bumps version
      // and stores the new bytes in S3. If the document was previously linked
      // to Google Drive, the Drive link is detached because the uploaded file
      // is now the source of truth.
      uploadNewVersion: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          fileType: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
          base64Content: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const doc = await db.getDataRoomDocumentById(input.id);
          if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });

          const room = await db.getDataRoomById(doc.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }

          const newName = input.name || doc.name;
          const buffer = Buffer.from(input.base64Content, 'base64');
          const key = `dataroom/${doc.dataRoomId}/${nanoid()}-${newName.replace(/[/\\]/g, '_')}`;
          const { url } = await storagePut(key, buffer, input.mimeType);

          const previousStorageKey = doc.storageType === 's3' ? doc.storageKey : null;

          const newVersion = await db.updateDataRoomDocumentBumpVersion(doc.id, {
            name: newName,
            fileType: input.fileType,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
            storageType: 's3',
            storageUrl: url,
            storageKey: key,
            googleDriveFileId: null,
            googleDriveWebViewLink: null,
            thumbnailUrl: null,
          });

          // Best-effort cleanup of the previous S3 object so replacing a
          // file's bytes doesn't leave an orphaned blob behind. We swallow
          // failures so a transient delete error doesn't fail the upload —
          // the new version is already persisted at this point.
          if (previousStorageKey) {
            storageDelete(previousStorageKey).catch((err) => {
              console.warn(`[dataRoom] failed to delete prior storage key ${previousStorageKey}:`, err);
            });
          }

          return { id: doc.id, url, version: newVersion };
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
          customSlug: z.string().optional(), // Custom URL slug (e.g., "sequoia" → /dataroom/sequoia)
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
          // Use custom slug, or generate from name, or random
          const linkCode = input.customSlug
            ? input.customSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
            : input.name
              ? input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
              : nanoid(12);
          let hashedPassword = null;
          if (input.password) {
            hashedPassword = await hashPassword(input.password);
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

      // Owner preview: get or create a permanent no-gate link so the owner
      // can see the exact investor view without needing a share link.
      getOrCreateOwnerPreviewLink: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }

          // Look for an existing owner-preview link
          const allLinks = await db.getDataRoomLinks(input.dataRoomId);
          const existing = allLinks.find((l) => l.name === '__owner_preview__');
          if (existing) return { linkCode: existing.linkCode };

          // Create a permanent, no-gate link
          const linkCode = `owner-preview-${nanoid(12)}`;
          await db.createDataRoomLink({
            dataRoomId: input.dataRoomId,
            linkCode,
            name: '__owner_preview__',
            password: null,
            expiresAt: null,
            maxViews: null,
            allowDownload: true,
            allowPrint: true,
            requireEmail: false,
            requireName: false,
            requireCompany: false,
            requirePhone: false,
            isActive: true,
            createdBy: ctx.user.id,
          });
          return { linkCode };
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

    // Sync from Google Drive — one-click sync of an entire Drive folder (and subfolders) into the data room
    syncFromDrive: protectedProcedure
      .input(z.object({
        dataRoomId: z.number(),
        driveFolderId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify data room ownership
        const room = await db.getDataRoomById(input.dataRoomId);
        if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
        if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Prefer the room owner's Google token (the folder is usually linked to
        // their Drive). Fall back to the acting user so an admin who has access
        // can still sync when the owner hasn't connected Google.
        let tokenUserId = room.ownerId;
        let { accessToken, error } = await getValidGoogleToken(tokenUserId);
        if (error && ctx.user.id !== room.ownerId) {
          tokenUserId = ctx.user.id;
          ({ accessToken, error } = await getValidGoogleToken(tokenUserId));
        }
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }

        let folderId = input.driveFolderId || room.googleDriveFolderId;

        // If no folder ID provided and none linked, search for a "Data Room" folder in Drive
        if (!folderId) {
          const { folders: found, error: searchErr } = await searchDriveFoldersByName(accessToken, 'Data Room');
          if (searchErr) {
            console.warn('[DataRoom] Drive folder search failed:', searchErr);
          }
          if (found.length > 0) {
            folderId = found[0].id;
          }
          if (!folderId) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'No Google Drive folder specified and no "Data Room" folder found in Google Drive. Please provide a folder ID or create a folder named "Data Room" in your Google Drive.',
            });
          }
        }

        // Verify folder exists and get info
        const folderInfo = await getFolderInfo(accessToken, folderId);
        if (folderInfo.error || !folderInfo.folder) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: folderInfo.error || 'Folder not found in Google Drive' });
        }

        // Reconcile the data room against the Drive tree — create new folders
        // and files, and (for this user-initiated re-sync) remove Drive-backed
        // items that were deleted in Drive. Shared with the background auto-sync
        // scheduler so both behave identically.
        const {
          reconcileDataRoomFromDrive,
          isTotalDriveImportFailure,
          totalDriveImportFailureMessage,
        } = await import('../googleDriveSyncService');
        let recon;
        try {
          recon = await reconcileDataRoomFromDrive({
            dataRoomId: input.dataRoomId,
            rootFolderId: folderId,
            accessToken: async () => {
              const t = await getValidGoogleToken(tokenUserId);
              if (t.error || !t.accessToken) throw new Error(t.error || 'Google token unavailable');
              return t.accessToken;
            },
            uploadedBy: ctx.user.id,
            allowDelete: true,
          });
        } catch (err: unknown) {
          // reconcileDataRoomFromDrive only throws curated, user-safe messages
          // (the Drive-listing hint, or a generic fallback); the full error is
          // already logged there. Log again with room context and pass it on.
          console.error(`[DataRoom] syncFromDrive failed for room ${input.dataRoomId}:`, err);
          const msg = err instanceof Error ? err.message : 'Sync failed';
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg });
        }

        if (isTotalDriveImportFailure(recon)) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: totalDriveImportFailureMessage(recon),
          });
        }

        // Always link the folder; only stamp lastSyncedAt on a complete listing
        // (a partial sync skipped some sub-tree, so the room isn't fully synced).
        await db.updateDataRoom(input.dataRoomId, {
          googleDriveFolderId: folderId,
          ...(recon.partial ? {} : { lastSyncedAt: new Date() }),
        });

        console.log(
          `[DataRoom] Drive sync for room ${input.dataRoomId}: found ${recon.foldersFound} folders / ${recon.filesFound} files; ` +
          `created ${recon.foldersCreated} folders / ${recon.filesCreated} files; ` +
          `updated ${recon.foldersUpdated} folders / ${recon.filesUpdated} files; ` +
          `removed ${recon.foldersRemoved} folders / ${recon.filesRemoved} files; ${recon.filesFailed} file errors.`
        );

        return {
          totalSynced: recon.filesCreated,
          foldersCreated: recon.foldersCreated,
          foldersUpdated: recon.foldersUpdated,
          filesCreated: recon.filesCreated,
          filesUpdated: recon.filesUpdated,
          filesRemoved: recon.filesRemoved,
          foldersRemoved: recon.foldersRemoved,
          filesFound: recon.filesFound,
          foldersFound: recon.foldersFound,
          filesFailed: recon.filesFailed,
          errors: recon.errors,
          folderName: folderInfo.folder.name,
        };
      }),

    // Kick off a Drive → Data Room sync as a background task and return
    // immediately with a taskId. The heavy reconcile runs detached from this
    // request so it keeps going — and stays visible in the global task tray —
    // after the user navigates away. Pre-flight validation (ownership, OAuth,
    // folder resolution) still happens synchronously so obvious errors surface
    // to the caller right away.
    startDriveSync: protectedProcedure
      .input(z.object({
        dataRoomId: z.number(),
        driveFolderId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const room = await db.getDataRoomById(input.dataRoomId);
        if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
        if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Prefer the room owner's Google token; fall back to the acting user.
        let tokenUserId = room.ownerId;
        let { accessToken, error } = await getValidGoogleToken(tokenUserId);
        if (error && ctx.user.id !== room.ownerId) {
          tokenUserId = ctx.user.id;
          ({ accessToken, error } = await getValidGoogleToken(tokenUserId));
        }
        if (error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
        }

        let folderId = input.driveFolderId || room.googleDriveFolderId;
        if (!folderId) {
          const { folders: found, error: searchErr } = await searchDriveFoldersByName(accessToken, 'Data Room');
          if (searchErr) {
            console.warn('[DataRoom] Drive folder search failed:', searchErr);
          }
          if (found.length > 0) {
            folderId = found[0].id;
          }
          if (!folderId) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'No Google Drive folder specified and no "Data Room" folder found in Google Drive. Please provide a folder ID or create a folder named "Data Room" in your Google Drive.',
            });
          }
        }

        const folderInfo = await getFolderInfo(accessToken, folderId);
        if (folderInfo.error || !folderInfo.folder) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: folderInfo.error || 'Folder not found in Google Drive' });
        }

        // Capture non-null values for the detached closure.
        const resolvedFolderId = folderId;
        const userId = ctx.user.id;
        const googleTokenUserId = tokenUserId;
        const { dataRoomId } = input;

        const { runBackgroundTask } = await import('../_core/backgroundTasks');
        const {
          reconcileDataRoomFromDrive,
          isTotalDriveImportFailure,
          totalDriveImportFailureMessage,
        } = await import('../googleDriveSyncService');

        const { taskId } = await runBackgroundTask(
          {
            userId,
            type: 'data_room_drive_sync',
            title: `Syncing "${room.name}" from Google Drive`,
            description: folderInfo.folder.name ? `Drive folder: ${folderInfo.folder.name}` : undefined,
            message: 'Starting…',
            entityType: 'data_room',
            entityId: dataRoomId,
            link: `/dataroom/${dataRoomId}`,
          },
          async (handle) => {
            const recon = await reconcileDataRoomFromDrive({
              dataRoomId,
              rootFolderId: resolvedFolderId,
              accessToken: async () => {
                const t = await getValidGoogleToken(googleTokenUserId);
                if (t.error || !t.accessToken) throw new Error(t.error || 'Google token unavailable');
                return t.accessToken;
              },
              uploadedBy: userId,
              allowDelete: true,
              onProgress: (u) => handle.report(u),
            });

            if (isTotalDriveImportFailure(recon)) {
              throw new Error(totalDriveImportFailureMessage(recon));
            }

            await db.updateDataRoom(dataRoomId, {
              googleDriveFolderId: resolvedFolderId,
              ...(recon.partial ? {} : { lastSyncedAt: new Date() }),
            });

            const summaryParts: string[] = [];
            if (recon.filesCreated) summaryParts.push(`${recon.filesCreated} added`);
            if (recon.filesUpdated) summaryParts.push(`${recon.filesUpdated} updated`);
            if (recon.filesRemoved) summaryParts.push(`${recon.filesRemoved} removed`);
            if (recon.filesFailed) summaryParts.push(`${recon.filesFailed} failed`);
            const summaryMsg = summaryParts.length
              ? `Synced ${folderInfo.folder!.name}: ${summaryParts.join(', ')}`
              : recon.filesFound === 0 && recon.foldersFound === 0
                ? `No files found in "${folderInfo.folder!.name}"`
                : `${folderInfo.folder!.name} is already up to date`;

            return {
              message: recon.partial ? `${summaryMsg} (partial)` : summaryMsg,
              result: {
                totalSynced: recon.filesCreated,
                foldersCreated: recon.foldersCreated,
                foldersUpdated: recon.foldersUpdated,
                filesCreated: recon.filesCreated,
                filesUpdated: recon.filesUpdated,
                filesRemoved: recon.filesRemoved,
                foldersRemoved: recon.foldersRemoved,
                filesFound: recon.filesFound,
                foldersFound: recon.foldersFound,
                filesFailed: recon.filesFailed,
                partial: recon.partial,
                errors: recon.errors,
                folderName: folderInfo.folder!.name,
              },
            };
          },
        );

        return { taskId, folderName: folderInfo.folder.name };
      }),

    // Google Drive sync
    googleDrive: router({
      // List files (non-folders) inside a Google Drive folder
      listFiles: protectedProcedure
        .input(z.object({
          folderId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
          const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
          if (error) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
          }

          const result = await listDriveFiles(accessToken, input.folderId);
          if (result.error) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
          }

          return { files: result.files };
        }),

      // Sync a single Google Drive file to a data room
      syncFile: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          googleDriveFileId: z.string(),
          folderId: z.number().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const room = await db.getDataRoomById(input.dataRoomId);
          if (!room) throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          if (room.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }

          const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
          if (error) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error });
          }

          // Fetch file metadata
          const { file: driveFile, error: metaError } = await getFileMetadata(accessToken, input.googleDriveFileId);
          if (metaError || !driveFile) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: metaError || 'File not found in Google Drive' });
          }

          // Check if already synced
          const existingDocs = await db.getDataRoomDocuments(input.dataRoomId);
          if (existingDocs.some(d => d.googleDriveFileId === driveFile.id)) {
            throw new TRPCError({ code: 'CONFLICT', message: 'This file has already been synced to this data room' });
          }

          // Store by reference in Google Drive (no download)
          const displayName = driveFile.name;
          const fileType = getSimpleFileType(driveFile.mimeType);
          const fileSize: number | undefined = driveFile.size && !isNaN(parseInt(driveFile.size))
            ? parseInt(driveFile.size)
            : undefined;

          await db.createDataRoomDocument({
            dataRoomId: input.dataRoomId,
            folderId: input.folderId ?? null,
            name: displayName,
            fileType,
            mimeType: driveFile.mimeType,
            fileSize,
            storageType: 'google_drive',
            storageUrl: driveFile.webViewLink || undefined,
            storageKey: undefined,
            googleDriveFileId: driveFile.id,
            googleDriveWebViewLink: driveFile.webViewLink,
            thumbnailUrl: driveFile.thumbnailLink,
            uploadedBy: ctx.user.id,
          });

          return { success: true, fileName: displayName };
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

          if (link.password) {
            if (!input.password) {
              return { requiresPassword: true, dataRoomId: null, visitorId: null };
            }

            const { valid, needsUpgrade } = await verifyPassword(input.password, link.password);

            if (!valid) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' });
            }

            if (needsUpgrade) {
              const upgradedHash = await hashPassword(input.password);
              await db.updateDataRoomLink(link.id, { password: upgradedHash });
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

          // Issue a signed visitor session cookie on every successful access,
          // including anonymous (no-email) flows — without it the public file
          // list is reachable but the proxy 401s on the actual bytes. visitorId
          // is omitted when no visitor row exists; the proxy falls back to
          // link/room-level checks in that case.
          {
            const { setVisitorSessionCookie } = await import('../_core/dataRoomVisitorSession');
            const ttlMs = link.expiresAt
              ? Math.max(60_000, new Date(link.expiresAt).getTime() - Date.now())
              : 24 * 60 * 60 * 1000;
            await setVisitorSessionCookie(
              ctx.req,
              ctx.res,
              {
                visitorId: visitor?.id,
                linkId: link.id,
                linkCode: input.linkCode,
                dataRoomId: link.dataRoomId,
              },
              ttlMs,
            );
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
              showLiveFinancials: room.showLiveFinancials,
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
              const drRoom = await db.getDataRoomById(document.dataRoomId);
              if (drRoom) {
                const visitor = await db.getDataRoomVisitorById(input.visitorId);
                const visitorName = visitor?.name || visitor?.email || 'Anonymous visitor';
                await db.createNotification({
                  userId: drRoom.ownerId,
                  type: 'data_room_view',
                  title: `${visitorName} is viewing "${drRoom.name}"`,
                  message: `Viewing document: ${document.name}`,
                  entityType: 'data_room',
                  entityId: drRoom.id,
                  severity: 'info',
                  link: `/data-rooms/${drRoom.id}`,
                });
              }
            }
          } catch (err) {
            console.warn("[DataRoom] Failed to send view notification:", err);
          }

          return { id };
        }),

      // Live current-financials feed for the data room's public page.
      // This is the investor-facing counterpart to the frozen projections
      // snapshot: metrics are recomputed at request time, gated by a valid
      // link + any NDA requirement that applied to `accessByLink`.
      //
      // Intentionally narrow: cash, last-3-mo revenue, last-3-mo burn,
      // avg burn, runway, and optionally an AR total when the room owner
      // has explicitly opted in. No customer-level detail, no AR aging,
      // no risk radar.
      getFinancials: publicProcedure
        .input(z.object({
          linkCode: z.string(),
          visitorId: z.number().optional(),
        }))
        .query(async ({ input }) => {
          const link = await db.getDataRoomLinkByCode(input.linkCode);
          if (!link || !link.isActive) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid link' });
          }
          if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Link has expired' });
          }

          const room = await db.getDataRoomById(link.dataRoomId);
          if (!room) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Data room not found' });
          }
          if (!room.showLiveFinancials) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Live financials are not enabled for this data room',
            });
          }

          // Re-enforce every gate that applied at `accessByLink` time.
          // This endpoint is separately reachable with only a link code, so
          // any gate the room relies on (password, required visitor info,
          // NDA) has to be checked here too — otherwise a caller who knows
          // the link could skip the password/info prompt and fetch
          // financials directly. The gates we implement via "visitor must
          // exist" because `accessByLink` only issues a visitor row once
          // its own checks pass.
          const requiresVisitor =
            !!link.password ||
            !!link.requireEmail ||
            !!link.requireName ||
            !!link.requireCompany ||
            !!room.requiresEmail ||
            !!room.requiresNda;

          if (requiresVisitor) {
            if (!input.visitorId) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Please access the data room through the normal flow before viewing live financials.',
              });
            }
            const visitor = await db.getDataRoomVisitorById(input.visitorId);
            if (!visitor || visitor.dataRoomId !== room.id) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid visitor for this data room' });
            }
            if (visitor.accessStatus === 'blocked' || visitor.accessStatus === 'revoked') {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Your access has been revoked' });
            }
            if (room.requiresNda && !visitor.ndaAcceptedAt) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'NDA signature required' });
            }
          } else if (input.visitorId) {
            // Even without gates, still honor blocked/revoked on known visitors.
            const visitor = await db.getDataRoomVisitorById(input.visitorId);
            if (visitor && (visitor.accessStatus === 'blocked' || visitor.accessStatus === 'revoked')) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'Your access has been revoked' });
            }
          }

          const { computeLiveFinancials } = await import('../dataRoomLiveFinancials');
          // dataRooms has no companyId column today (single-tenant); the helper
          // still accepts one for when multi-tenancy lands per-room.
          const snapshot = await computeLiveFinancials({
            includeAr: !!room.liveFinancialsIncludeAr,
          });

          return {
            room: {
              name: room.name,
              brandingCompanyName: room.brandingCompanyName,
              brandingLogo: room.brandingLogo,
              brandingColor: room.brandingColor,
              brandColor: room.brandColor,
              logoUrl: room.logoUrl,
              watermarkEnabled: room.watermarkEnabled,
              watermarkText: room.watermarkText,
            },
            financials: snapshot,
          };
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

          const configData: any = {
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
            await db.updateDataRoom(input.dataRoomId, {
              googleDriveFolderId: input.googleDriveFolderId,
            });
            return { id: existingConfig.id, updated: true };
          } else {
            const id = await db.createDriveSyncConfig(configData);
            await db.updateDataRoom(input.dataRoomId, {
              googleDriveFolderId: input.googleDriveFolderId,
            });
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
            // Get Google OAuth token for the user configured for sync (or room
            // owner / current user as fallback)
            const syncUserId = config.syncUserId || room.ownerId || ctx.user.id;
            const { accessToken: _preflightToken, error: syncTokenErr } = await getValidGoogleToken(syncUserId);
            if (syncTokenErr || !_preflightToken) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google Drive not connected. Please connect your Google account first.' });
            }

            // Use the same reconcile engine as one-click / auto-sync so renames,
            // moves, metadata refresh, and delete-propagation stay consistent.
            const {
              reconcileDataRoomFromDrive,
              isTotalDriveImportFailure,
              totalDriveImportFailureMessage,
            } = await import('../googleDriveSyncService');

            const syncStartMs = Date.now();
            const recon = await reconcileDataRoomFromDrive({
              dataRoomId: input.dataRoomId,
              rootFolderId: config.googleDriveFolderId,
              accessToken: async () => {
                const t = await getValidGoogleToken(syncUserId);
                if (t.error || !t.accessToken) throw new Error(t.error || 'Google token unavailable');
                return t.accessToken;
              },
              uploadedBy: ctx.user.id,
              allowDelete: true,
              syncSubfolders: config.syncSubfolders,
              includeFileTypes: config.includeFileTypes ? JSON.parse(config.includeFileTypes) : undefined,
              excludeFileTypes: config.excludeFileTypes ? JSON.parse(config.excludeFileTypes) : undefined,
              maxFileSizeMb: config.maxFileSizeMb ?? undefined,
            });
            const syncDurationMs = Date.now() - syncStartMs;

            if (isTotalDriveImportFailure(recon)) {
              throw new Error(totalDriveImportFailureMessage(recon));
            }

            // Keep the data room's linked folder ID in sync with the config so
            // the daily auto-sync scheduler also picks this room up.
            await db.updateDataRoom(input.dataRoomId, {
              googleDriveFolderId: config.googleDriveFolderId,
              ...(recon.partial ? {} : { lastSyncedAt: new Date() }),
            });

            const result = {
              filesScanned: recon.filesFound,
              filesAdded: recon.filesCreated,
              filesUpdated: recon.filesUpdated,
              filesSkipped: 0,
              foldersCreated: recon.foldersCreated,
              durationMs: syncDurationMs,
              warnings: recon.errors,
            };

            // Update sync log with results
            await db.updateDriveSyncLog(logId, {
              status: 'completed',
              completedAt: new Date(),
              filesScanned: recon.filesFound,
              filesAdded: recon.filesCreated,
              filesUpdated: recon.filesUpdated,
              filesRemoved: recon.filesRemoved,
              filesSkipped: 0,
              foldersCreated: recon.foldersCreated,
              durationMs: syncDurationMs,
              warnings: recon.errors?.length ? JSON.stringify(recon.errors) : null,
            });

            // Update config last sync status
            await db.updateDriveSyncConfig(config.id, {
              lastSyncAt: new Date(),
              lastSyncStatus: recon.filesFailed || recon.partial ? 'partial' : 'success',
              lastSyncFilesAdded: recon.filesCreated,
              lastSyncFilesUpdated: recon.filesUpdated,
              lastSyncFilesRemoved: recon.filesRemoved,
              lastSyncError: recon.errors[0] || null,
            });

            return { success: true, ...result, filesRemoved: recon.filesRemoved, foldersUpdated: recon.foldersUpdated, filesFailed: recon.filesFailed, partial: recon.partial, errors: recon.errors };
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
          const { accessToken: listAccessToken, error: listTokenErr } = await getValidGoogleToken(ctx.user.id);
          if (listTokenErr || !listAccessToken) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google Drive not connected' });
          }

          const { listGoogleDriveFolders } = await import('../googleDriveSyncService');
          return listGoogleDriveFolders(listAccessToken, input.parentId);
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
        .mutation(async ({ input, ctx }) => {
          await assertEmailAccessRuleOwnership(input.id, ctx.user.id, ctx.user.role);
          const { id, ...data } = input;
          await db.updateEmailAccessRule(id, data);
          return { success: true };
        }),

      // Delete a rule
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await assertEmailAccessRuleOwnership(input.id, ctx.user.id, ctx.user.role);
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
          return (db as any).getChecklistSummary(input.dataRoomId);
        }),

      // List all checklists for a data room
      list: protectedProcedure
        .input(z.object({ dataRoomId: z.number() }))
        .query(async ({ input }) => {
          return (db as any).getDataRoomChecklists(input.dataRoomId);
        }),

      // Get a checklist with all its items
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return (db as any).getChecklistWithItems(input.id);
        }),

      // Create a standard due diligence checklist
      createStandard: protectedProcedure
        .input(z.object({
          dataRoomId: z.number(),
          checklistType: z.enum(['fundraising', 'ma', 'full', 'series_b']).default('full'),
          customName: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const checklist = await (db as any).createStandardChecklist(
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
          return (db as any).createChecklistFromTemplate(
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
          return (db as any).autoMatchChecklistDocuments(input.checklistId);
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

          await (db as any).updateChecklistItem(id, updateData);

          // Get the item to recalculate parent checklist
          const item = await (db as any).getChecklistItemById(id);
          if (item) {
            await (db as any).recalculateChecklistProgress(item.checklistId);
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
          const item = await (db as any).getChecklistItemById(input.itemId);
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

          await (db as any).updateChecklistItem(input.itemId, {
            linkedDocumentIds: JSON.stringify(linkedIds),
            linkedDocumentCount: linkedIds.length,
            status: linkedIds.length > 0 ? 'complete' : 'missing',
          });

          await (db as any).recalculateChecklistProgress(item.checklistId);

          return { success: true };
        }),

      // Unlink a document from a checklist item
      unlinkDocument: protectedProcedure
        .input(z.object({
          itemId: z.number(),
          documentId: z.number(),
        }))
        .mutation(async ({ input }) => {
          const item = await (db as any).getChecklistItemById(input.itemId);
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

          await (db as any).updateChecklistItem(input.itemId, {
            linkedDocumentIds: JSON.stringify(linkedIds),
            linkedDocumentCount: linkedIds.length,
            status: linkedIds.length > 0 ? 'complete' : 'missing',
          });

          await (db as any).recalculateChecklistProgress(item.checklistId);

          return { success: true };
        }),

      // Add a custom item to a checklist
      addItem: protectedProcedure
        .input(z.object({
          checklistId: z.number(),
          categoryName: z.string(),
          itemName: z.string(),
          itemDescription: z.string().optional(),
          requirement: z.enum(['required', 'recommended', 'optional']).default('required'),
          matchKeywords: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input }) => {
          const checklist = await (db as any).getDataRoomChecklistById(input.checklistId);
          if (!checklist) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist not found' });
          }

          const result = await (db as any).createDataRoomChecklistItem({
            checklistId: input.checklistId,
            dataRoomId: checklist.dataRoomId,
            categoryName: input.categoryName,
            itemName: input.itemName,
            itemDescription: input.itemDescription,
            requirement: input.requirement,
            matchKeywords: input.matchKeywords ? JSON.stringify(input.matchKeywords) : undefined,
            status: 'missing',
          });

          await (db as any).recalculateChecklistProgress(input.checklistId);

          return result;
        }),

      // Delete a checklist item
      deleteItem: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const item = await (db as any).getChecklistItemById(input.id);
          if (item) {
            await (db as any).deleteChecklistItem(input.id);
            await (db as any).recalculateChecklistProgress(item.checklistId);
          }
          return { success: true };
        }),

      // Delete entire checklist
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await (db as any).deleteDataRoomChecklist(input.id);
          return { success: true };
        }),

      // Review an item
      reviewItem: protectedProcedure
        .input(z.object({
          id: z.number(),
          reviewStatus: z.enum(['pending', 'approved', 'needs_attention', 'rejected']),
          reviewNotes: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          // dataRoomChecklistItems has `status` and `notes`, not review* columns;
          // writing unknown keys produced `UPDATE … SET WHERE`, a SQL syntax error.
          const statusMap = {
            pending: "pending",
            approved: "approved",
            rejected: "rejected",
            needs_attention: "partial",
          } as const;
          await db.updateChecklistItem(input.id, {
            status: statusMap[input.reviewStatus],
            ...(input.reviewNotes !== undefined && { notes: input.reviewNotes }),
          });
          return { success: true };
        }),
    }),

    // ============================================
    // INVESTMENT COMMITMENTS (Investor Onboarding)
    // ============================================

    // Public endpoint — investor submits interest/commitment (no auth required)
    submitInvestment: publicProcedure
      .input(z.object({
        dataRoomId: z.number(),
        investorName: z.string().min(1),
        investorEmail: z.string().email(),
        investorCompany: z.string().optional(),
        investorTitle: z.string().optional(),
        investmentAmount: z.string(),
        instrumentType: z.enum(["equity", "safe", "convertible_note", "warrant"]).optional(),
        valuationCap: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await db.createInvestmentCommitment({
          ...input,
          status: "interested",
        });

        // Notify admin
        await db.createNotification({
          userId: 1,
          type: "system" as any,
          title: `New investment interest: ${input.investorName}`,
          message: `${input.investorName} (${input.investorCompany || ''}) expressed interest in investing $${input.investmentAmount}`,
        });

        // Send confirmation email to investor
        try {
          const { sendEmail: sendEmailFn } = await import("../_core/email");
          await sendEmailFn({
            to: input.investorEmail,
            subject: "Investment Interest Received — Superhumn Inc",
            html: `<p>Thank you for your interest in investing in Superhumn Inc.</p><p>We've received your indication of interest for $${Number(input.investmentAmount).toLocaleString()}. Our team will be in touch shortly with next steps.</p><p>Best regards,<br>The Superhumn Team</p>`,
          });
        } catch {}

        return { id: result.id, message: "Thank you! We'll be in touch." };
      }),

    // Admin: list all commitments
    listCommitments: protectedProcedure
      .input(z.object({ dataRoomId: z.number().optional() }).optional())
      .query(({ input }) => db.getInvestmentCommitments(input ?? undefined)),

    // Admin: update commitment status
    updateCommitmentStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["interested", "committed", "docs_sent", "signed", "funded", "completed", "declined"]),
      }))
      .mutation(async ({ input }) => {
        await db.updateInvestmentCommitment(input.id, { status: input.status });
        return { success: true };
      }),

    // Admin: finalize investment -> add to cap table
    finalizeInvestment: protectedProcedure
      .input(z.object({
        commitmentId: z.number(),
        shareClassId: z.number(),
        shares: z.string(),
        pricePerShare: z.string(),
      }))
      .mutation(async ({ input }) => {
        const commitment = await db.getInvestmentCommitmentById(input.commitmentId);
        if (!commitment) throw new TRPCError({ code: "NOT_FOUND" });

        // Create stakeholder
        const stakeholder = await db.createStakeholder({
          name: commitment.investorName,
          email: commitment.investorEmail,
          type: "investor",
          relationship: commitment.investorCompany || undefined,
          accreditedInvestor: true,
        });

        const stakeholderId = stakeholder.id || (stakeholder as any).insertId;

        // Create equity grant
        await db.createEquityGrant({
          stakeholderId,
          shareClassId: input.shareClassId,
          grantType: commitment.instrumentType === "safe" ? "safe" : commitment.instrumentType === "convertible_note" ? "convertible_note" : "purchase",
          grantDate: new Date(),
          shares: input.shares,
          pricePerShare: input.pricePerShare,
          totalValue: commitment.investmentAmount?.toString(),
          principalAmount: commitment.instrumentType !== "equity" ? commitment.investmentAmount?.toString() : undefined,
          valuationCap: commitment.valuationCap?.toString(),
          discountRate: commitment.discountRate?.toString(),
          status: "active",
        });

        // Update commitment
        await db.updateInvestmentCommitment(input.commitmentId, {
          status: "completed",
          addedToCapTable: true,
          stakeholderId,
          fundedAt: new Date(),
        });

        return { success: true, stakeholderId };
      }),
  });

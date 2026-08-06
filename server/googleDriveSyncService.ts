/**
 * Google Drive Sync Service for Data Room
 * Handles syncing files from Google Drive to the data room
 */

import {
  syncDriveFolder,
  listDriveFolders,
  getSimpleFileType,
  type DriveAccessToken,
} from './_core/googleDrive';
import * as db from './db';

interface SyncOptions {
  dataRoomId: number;
  folderId: string;
  accessToken: string;
  refreshToken?: string;
  syncSubfolders: boolean;
  includeFileTypes?: string[];
  excludeFileTypes?: string[];
  maxFileSizeMb: number;
  parentFolderId?: number | null;
  uploadedBy?: number;
}

interface SyncResult {
  filesScanned: number;
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  foldersCreated: number;
  durationMs: number;
  warnings: string[];
}

/**
 * List folders in Google Drive for the folder picker UI
 */
export async function listGoogleDriveFolders(
  accessToken: string,
  parentId?: string
): Promise<{ id: string; name: string; webViewLink?: string }[]> {
  const { folders, error } = await listDriveFolders(accessToken, parentId);

  if (error) {
    throw new Error(`Failed to list folders: ${error}`);
  }

  return folders.map(f => ({
    id: f.id,
    name: f.name,
    webViewLink: f.webViewLink,
  }));
}

/**
 * Main sync function - syncs a Google Drive folder to a data room
 */
export async function syncGoogleDriveFolder(options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  let filesScanned = 0;
  let filesAdded = 0;
  let filesUpdated = 0;
  let filesSkipped = 0;
  let foldersCreated = 0;

  // Map of Drive folder IDs to data room folder IDs for this sync
  const folderMapping = new Map<string, number>();

  try {
    // Get existing documents and folders in the data room
    const existingDocs = await db.getDataRoomDocuments(options.dataRoomId);
    const existingFolders = await db.getDataRoomFolders(options.dataRoomId);

    // Build a map of Google Drive file IDs to existing documents
    const existingDocsByDriveId = new Map<string, any>();
    existingDocs.forEach(doc => {
      if (doc.googleDriveFileId) {
        existingDocsByDriveId.set(doc.googleDriveFileId, doc);
      }
    });

    // Build a map of Google Drive folder IDs to existing folders
    const existingFoldersByDriveId = new Map<string, any>();
    existingFolders.forEach(folder => {
      if (folder.googleDriveFolderId) {
        existingFoldersByDriveId.set(folder.googleDriveFolderId, folder);
        folderMapping.set(folder.googleDriveFolderId, folder.id);
      }
    });

    // Sync the folder structure recursively
    const maxDepth = options.syncSubfolders ? 10 : 1;
    const { success, folders, files, error } = await syncDriveFolder(
      options.accessToken,
      options.folderId,
      maxDepth
    );

    if (!success || error) {
      throw new Error(error || 'Failed to sync drive folder');
    }

    filesScanned = files.length;

    // Process folders first to build the folder mapping
    if (options.syncSubfolders) {
      for (const driveFolder of folders) {
        const existingFolder = existingFoldersByDriveId.get(driveFolder.id);

        if (!existingFolder) {
          // Determine parent folder ID
          let parentId: number | null = options.parentFolderId || null;

          // Check if the Drive folder has a parent that we've already mapped
          if (driveFolder.parents && driveFolder.parents.length > 0) {
            const parentDriveId = driveFolder.parents[0];
            if (folderMapping.has(parentDriveId)) {
              parentId = folderMapping.get(parentDriveId)!;
            }
          }

          // Create the folder in the data room
          const folderResult = await db.createDataRoomFolder({
            dataRoomId: options.dataRoomId,
            parentId,
            name: driveFolder.name,
            googleDriveFolderId: driveFolder.id,
          } as any);

          folderMapping.set(driveFolder.id, folderResult.id);
          foldersCreated++;
        } else {
          folderMapping.set(driveFolder.id, existingFolder.id);
        }
      }
    }

    // Process files
    for (const file of files) {
      try {
        // Check file type filters
        const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
        const fileType = getSimpleFileType(file.mimeType);

        if (options.includeFileTypes && options.includeFileTypes.length > 0) {
          if (!options.includeFileTypes.includes(fileExt) && !options.includeFileTypes.includes(fileType)) {
            filesSkipped++;
            continue;
          }
        }

        if (options.excludeFileTypes && options.excludeFileTypes.length > 0) {
          if (options.excludeFileTypes.includes(fileExt) || options.excludeFileTypes.includes(fileType)) {
            filesSkipped++;
            continue;
          }
        }

        // Check file size
        const fileSizeMb = file.size ? parseInt(file.size) / (1024 * 1024) : 0;
        if (fileSizeMb > options.maxFileSizeMb) {
          warnings.push(`Skipped "${file.name}": File size (${fileSizeMb.toFixed(1)}MB) exceeds limit`);
          filesSkipped++;
          continue;
        }

        const existingDoc = existingDocsByDriveId.get(file.id);

        // Determine the folder ID for this file
        let folderId: number | null = options.parentFolderId || null;
        if (file.parents && file.parents.length > 0) {
          const parentDriveId = file.parents[0];
          if (folderMapping.has(parentDriveId)) {
            folderId = folderMapping.get(parentDriveId)!;
          }
        }

        if (existingDoc) {
          const driveModified = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
          const docModified = existingDoc.updatedAt ? new Date(existingDoc.updatedAt).getTime() : 0;

          if (driveModified > docModified) {
            // Refresh metadata only — file content stays in Google Drive and
            // is served on demand via /api/drive/proxy/:documentId.
            await db.updateDataRoomDocument(existingDoc.id, {
              name: file.name,
              folderId,
              fileSize: file.size ? parseInt(file.size) : undefined,
              mimeType: file.mimeType,
            });
            filesUpdated++;
          } else {
            filesSkipped++;
          }
        } else {
          // Create a metadata-only record pointing at the Drive file. The
          // viewer streams the bytes through /api/drive/proxy/:documentId at
          // render time, so no copy is ever made in our storage.
          await db.createDataRoomDocument({
            dataRoomId: options.dataRoomId,
            folderId,
            name: file.name,
            fileType: getSimpleFileType(file.mimeType),
            mimeType: file.mimeType,
            fileSize: file.size ? parseInt(file.size) : undefined,
            storageType: 'google_drive',
            googleDriveFileId: file.id,
            googleDriveWebViewLink: file.webViewLink,
            thumbnailUrl: file.thumbnailLink,
            uploadedBy: options.uploadedBy,
          });
          filesAdded++;
        }
      } catch (fileError: any) {
        warnings.push(`Error processing "${file.name}": ${fileError.message}`);
      }
    }

    return {
      filesScanned,
      filesAdded,
      filesUpdated,
      filesSkipped,
      foldersCreated,
      durationMs: Date.now() - startTime,
      warnings,
    };
  } catch (error: any) {
    throw new Error(`Sync failed: ${error.message}`);
  }
}

export interface ReconcileResult {
  foldersFound: number;
  filesFound: number;
  foldersCreated: number;
  foldersUpdated: number;
  filesCreated: number;
  filesUpdated: number;
  filesRemoved: number;
  foldersRemoved: number;
  filesFailed: number;
  partial: boolean;
  errors: string[];
}

// Trim values to their DB column widths so one oversized field can't abort an
// insert (and, before per-item isolation, the whole batch).
function trunc(v: string | null | undefined, max: number): string | undefined {
  if (v == null) return undefined;
  return v.length > max ? v.slice(0, max) : v;
}

// Concise, user-safe message. Full error objects are logged separately; raw
// SQL/driver text never reaches callers/UI.
function errMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'ER_DATA_TOO_LONG': return 'a field exceeded the maximum length';
    case 'ER_DUP_ENTRY': return 'a duplicate entry was detected';
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'WARN_DATA_TRUNCATED': return 'an unsupported character or value';
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_ROW_IS_REFERENCED_2': return 'a related-record constraint failed';
    case 'ER_BAD_NULL_ERROR': return 'a required field was missing';
  }
  if (err instanceof Error && !code) return err.message;
  return 'an unexpected database error';
}

/**
 * Reconcile a data room against a Google Drive folder tree: create new folders
 * and documents (as metadata-only Drive references), and — only when
 * `allowDelete` is set and the tree listed completely — remove data-room items
 * whose Drive counterparts no longer exist.
 *
 * Shared by the one-click `dataRoom.syncFromDrive` route and the background
 * auto-sync scheduler so both behave identically. Per-item inserts/deletes are
 * isolated so a single failure can't abort the batch; over-length fields are
 * truncated; client-facing errors are sanitized.
 *
 * Delete-propagation safety: it is skipped when the Drive listing was `partial`
 * (a sub-folder failed to list) or returned an empty tree, since a "missing"
 * item may simply be unlisted — deleting then would be data loss. Only
 * Drive-originated items (those carrying a googleDriveFileId / FolderId) are
 * ever removed; manually uploaded S3 documents are untouched.
 */
export async function reconcileDataRoomFromDrive(params: {
  dataRoomId: number;
  rootFolderId: string;
  /** Static token or a getter refreshed before each Drive listing. */
  accessToken: DriveAccessToken;
  uploadedBy?: number;
  allowDelete?: boolean;
  /** When false, subfolders are excluded from sync (root files only). Defaults to true. */
  syncSubfolders?: boolean;
  /** Only include files matching these extensions or simple file types (e.g. ['pdf', 'image']). */
  includeFileTypes?: string[];
  /** Exclude files matching these extensions or simple file types. */
  excludeFileTypes?: string[];
  /** Skip files larger than this size in MB. */
  maxFileSizeMb?: number;
  /**
   * Optional progress reporter, invoked as the Drive tree is reconciled. Used by
   * the background-task runner to surface live progress in the client. Throwing
   * from it (e.g. on cooperative cancellation) aborts the reconcile.
   */
  onProgress?: (update: { processed: number; total: number; message?: string }) => void | Promise<void>;
}): Promise<ReconcileResult> {
  const { dataRoomId, rootFolderId, accessToken, uploadedBy, allowDelete, onProgress,
    syncSubfolders = true, includeFileTypes, excludeFileTypes, maxFileSizeMb } = params;

  await onProgress?.({ processed: 0, total: 0, message: 'Listing Google Drive folder…' });
  const sync = await syncDriveFolder(accessToken, rootFolderId);
  if (!sync.success) {
    throw new Error(sync.error || 'Failed to list the Google Drive folder');
  }

  const totalItems = sync.folders.length + sync.files.length;
  let processedItems = 0;
  await onProgress?.({
    processed: 0,
    total: totalItems,
    message: `Reconciling ${totalItems} item(s) from Google Drive…`,
  });

  const folderMap = new Map<string, number>();
  const errors: string[] = [];
  let foldersCreated = 0;
  let foldersUpdated = 0;
  let filesCreated = 0;
  let filesUpdated = 0;
  let filesFailed = 0;
  let filesRemoved = 0;
  let foldersRemoved = 0;

  try {
    const existingFolders = await db.getDataRoomFolders(dataRoomId);
    const existingDocs = await db.getDataRoomDocuments(dataRoomId);
    const existingFolderByDriveId = new Map<string, typeof existingFolders[number]>(
      existingFolders.filter(f => f.googleDriveFolderId).map(f => [f.googleDriveFolderId!, f]),
    );
    const existingDocByDriveId = new Map<string, typeof existingDocs[number]>(
      existingDocs.filter(d => d.googleDriveFileId).map(d => [d.googleDriveFileId!, d]),
    );

    // Reconcile folder hierarchy (DFS pre-order → parents precede children):
    // create new folders, and rename/re-parent existing ones that moved in Drive.
    // When syncSubfolders is disabled, skip all subfolders (root-only sync).
    for (const driveFolder of syncSubfolders ? sync.folders : []) {
      processedItems++;
      await onProgress?.({ processed: processedItems, total: totalItems, message: 'Syncing folders…' });
      const parentDriveId = driveFolder.parents?.[0];
      let parentId: number | null = null;
      if (parentDriveId && parentDriveId !== rootFolderId) {
        parentId = folderMap.get(parentDriveId) ?? existingFolderByDriveId.get(parentDriveId)?.id ?? null;
        if (parentId === null && errors.length < 5) {
          errors.push(`Folder "${driveFolder.name}": parent folder could not be resolved; placed at root.`);
        }
      }

      const newName = trunc(driveFolder.name, 255) || 'Untitled folder';
      const existing = existingFolderByDriveId.get(driveFolder.id);
      if (existing) {
        folderMap.set(driveFolder.id, existing.id);
        // Reflect a Drive-side rename or move.
        if (existing.name !== newName || (existing.parentId ?? null) !== parentId) {
          try {
            await db.updateDataRoomFolder(existing.id, { name: newName, parentId });
            foldersUpdated++;
          } catch (err: unknown) {
            console.error(`[DataRoom] Failed to update folder ${driveFolder.id} (room ${dataRoomId}):`, err);
          }
        }
        continue;
      }

      try {
        const { id } = await db.createDataRoomFolder({
          dataRoomId,
          parentId,
          name: newName,
          googleDriveFolderId: driveFolder.id,
        });
        folderMap.set(driveFolder.id, id);
        foldersCreated++;
      } catch (err: unknown) {
        console.error(`[DataRoom] Failed to create folder ${driveFolder.id} (room ${dataRoomId}):`, err);
        if (errors.length < 5) errors.push(`Folder "${driveFolder.name}": ${errMessage(err)}`);
      }
    }

    // Reconcile documents (metadata-only Drive references): create new files, and
    // update existing ones that were renamed, moved, or changed in Drive.
    for (const driveFile of sync.files) {
      processedItems++;
      await onProgress?.({ processed: processedItems, total: totalItems, message: 'Syncing files…' });
      const parentDriveId = driveFile.parents?.[0];

      // When subfolder sync is disabled, only process root-level files.
      if (!syncSubfolders && parentDriveId && parentDriveId !== rootFolderId) {
        continue;
      }

      let folderId: number | null = null;
      if (parentDriveId && parentDriveId !== rootFolderId) {
        folderId = folderMap.get(parentDriveId) ?? existingFolderByDriveId.get(parentDriveId)?.id ?? null;
        if (folderId === null && errors.length < 5) {
          errors.push(`File "${driveFile.name}": parent folder could not be resolved; placed at root.`);
        }
      }

      const newName = trunc(driveFile.name, 255) || 'Untitled';
      const newSize = driveFile.size && !isNaN(parseInt(driveFile.size)) ? parseInt(driveFile.size) : undefined;

      // Apply file-type and size filters from the sync config.
      const fileExt = driveFile.name.split('.').pop()?.toLowerCase() || '';
      const fileType = getSimpleFileType(driveFile.mimeType);
      if (includeFileTypes && includeFileTypes.length > 0) {
        if (!includeFileTypes.includes(fileExt) && !includeFileTypes.includes(fileType)) {
          continue;
        }
      }
      if (excludeFileTypes && excludeFileTypes.length > 0) {
        if (excludeFileTypes.includes(fileExt) || excludeFileTypes.includes(fileType)) {
          continue;
        }
      }
      if (maxFileSizeMb !== undefined && newSize !== undefined) {
        const fileSizeMb = newSize / (1024 * 1024);
        if (fileSizeMb > maxFileSizeMb) {
          continue;
        }
      }

      const existing = existingDocByDriveId.get(driveFile.id);

      if (existing) {
        const driveModified = driveFile.modifiedTime ? new Date(driveFile.modifiedTime).getTime() : 0;
        const docModified = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const moved = (existing.folderId ?? null) !== folderId;
        // Update on a Drive-side change (newer mtime), a move between folders, or
        // a rename. Bytes stay in Drive; only metadata is refreshed.
        if (driveModified > docModified || moved || existing.name !== newName) {
          try {
            await db.updateDataRoomDocument(existing.id, {
              name: newName,
              folderId,
              mimeType: trunc(driveFile.mimeType, 128),
              fileSize: newSize,
              storageUrl: trunc(driveFile.webViewLink, 512),
              googleDriveWebViewLink: trunc(driveFile.webViewLink, 512),
              thumbnailUrl: trunc(driveFile.thumbnailLink, 512),
            });
            filesUpdated++;
          } catch (err: unknown) {
            console.error(`[DataRoom] Failed to update document ${driveFile.id} (room ${dataRoomId}):`, err);
            filesFailed++;
            if (errors.length < 5) errors.push(`File "${driveFile.name}": ${errMessage(err)}`);
          }
        }
        continue;
      }

      try {
        await db.createDataRoomDocument({
          dataRoomId,
          folderId,
          name: newName,
          fileType: getSimpleFileType(driveFile.mimeType),
          mimeType: trunc(driveFile.mimeType, 128),
          fileSize: newSize,
          storageType: 'google_drive',
          storageUrl: trunc(driveFile.webViewLink, 512),
          googleDriveFileId: driveFile.id,
          googleDriveWebViewLink: trunc(driveFile.webViewLink, 512),
          thumbnailUrl: trunc(driveFile.thumbnailLink, 512),
          uploadedBy,
        });
        filesCreated++;
      } catch (err: unknown) {
        console.error(`[DataRoom] Failed to create document ${driveFile.id} (room ${dataRoomId}):`, err);
        filesFailed++;
        if (errors.length < 5) errors.push(`File "${driveFile.name}": ${errMessage(err)}`);
      }
    }

    // Delete-propagation — remove Drive-originated items no longer in Drive.
    // Isolated so a delete-propagation failure never discards the create/update
    // work above (creating the files is the primary goal and must survive).
    const treeIsEmpty = sync.folders.length === 0 && sync.files.length === 0;
    try {
    if (allowDelete && (sync.partial || treeIsEmpty)) {
      // Removals are deliberately skipped when the tree is incomplete/empty — tell
      // the caller so 0-removed isn't mistaken for "nothing to delete".
      if (errors.length < 5) {
        errors.push(
          sync.partial
            ? 'Deletions were skipped: the Google Drive folder listed only partially, so deleted items could not be determined safely.'
            : 'Deletions were skipped: the Google Drive folder returned no items.',
        );
      }
    } else if (allowDelete) {
      const seenFileIds = new Set(sync.files.map(f => f.id));
      const seenFolderIds = new Set(sync.folders.map(f => f.id));

      // 1) Remove documents whose Drive file no longer exists.
      for (const [driveId, doc] of existingDocByDriveId) {
        if (!seenFileIds.has(driveId)) {
          try {
            await db.deleteDataRoomDocument(doc.id);
            filesRemoved++;
          } catch (err: unknown) {
            console.error(`[DataRoom] Failed to remove document ${doc.id} (room ${dataRoomId}):`, err);
          }
        }
      }

      // 2) Remove folders whose Drive folder no longer exists — but ONLY when
      // empty, so a still-present child (e.g. a manually uploaded S3 file, or an
      // item moved rather than deleted in Drive) is never orphaned by a dangling
      // parentId/folderId. Re-fetch current state and delete leaf-first via a
      // fixed point so an emptied parent becomes deletable on a later pass.
      const candidateFolderIds = new Set<number>();
      for (const [driveId, folder] of existingFolderByDriveId) {
        if (!seenFolderIds.has(driveId)) candidateFolderIds.add(folder.id);
      }
      if (candidateFolderIds.size > 0) {
        const curDocs = await db.getDataRoomDocuments(dataRoomId);
        let curFolders = await db.getDataRoomFolders(dataRoomId);
        let removedInPass = true;
        while (removedInPass && candidateFolderIds.size > 0) {
          removedInPass = false;
          const docChildCount = new Map<number, number>();
          for (const d of curDocs) if (d.folderId != null) docChildCount.set(d.folderId, (docChildCount.get(d.folderId) || 0) + 1);
          const folderChildCount = new Map<number, number>();
          for (const f of curFolders) if (f.parentId != null) folderChildCount.set(f.parentId, (folderChildCount.get(f.parentId) || 0) + 1);

          for (const fid of [...candidateFolderIds]) {
            if ((docChildCount.get(fid) || 0) === 0 && (folderChildCount.get(fid) || 0) === 0) {
              try {
                await db.deleteDataRoomFolder(fid);
                foldersRemoved++;
                removedInPass = true;
              } catch (err: unknown) {
                console.error(`[DataRoom] Failed to remove folder ${fid} (room ${dataRoomId}):`, err);
              }
              // Drop from candidates either way (success, or don't retry forever).
              candidateFolderIds.delete(fid);
              curFolders = curFolders.filter(f => f.id !== fid);
            }
          }
        }
        // Folders left here still contained documents/child folders and were
        // deliberately kept to avoid orphaning them.
        if (candidateFolderIds.size > 0 && errors.length < 5) {
          errors.push(`${candidateFolderIds.size} folder(s) removed in Drive were kept because they still contain files.`);
        }
      }
    }
    } catch (delErr: unknown) {
      // Non-fatal: files were already created/updated above.
      console.error(`[DataRoom] Delete-propagation failed for room ${dataRoomId}:`, delErr);
      if (errors.length < 5) errors.push(`Delete cleanup skipped: ${errMessage(delErr)}`);
    }
  } catch (err: unknown) {
    // Unexpected failure (e.g. a DB write/read). Log the full error server-side,
    // and include the concise cause in the thrown message. This route is
    // owner/admin-only, so surfacing the reason to the caller is acceptable and
    // is the only way to diagnose failures without server-log access.
    console.error(`[DataRoom] Reconcile failed for room ${dataRoomId}:`, err);
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to update the data room from Google Drive: ${detail}`);
  }

  return {
    foldersFound: sync.folders.length,
    filesFound: sync.files.length,
    foldersCreated,
    foldersUpdated,
    filesCreated,
    filesUpdated,
    filesRemoved,
    foldersRemoved,
    filesFailed,
    partial: !!sync.partial,
    errors,
  };
}

/**
 * True when Drive returned files but every create/update attempt failed — the
 * sync must not be reported as success (historical regression: green toast /
 * background-task "success" with 0 imports).
 */
export function isTotalDriveImportFailure(recon: Pick<ReconcileResult, 'filesFound' | 'filesCreated' | 'filesUpdated' | 'filesFailed'>): boolean {
  return (
    recon.filesFound > 0 &&
    recon.filesCreated === 0 &&
    recon.filesUpdated === 0 &&
    recon.filesFailed > 0
  );
}

/**
 * Build a user-facing error for a total import failure.
 */
export function totalDriveImportFailureMessage(
  recon: Pick<ReconcileResult, 'filesFound' | 'errors'>,
): string {
  const detail = recon.errors[0] ? ` ${recon.errors[0]}` : '';
  return `Found ${recon.filesFound} file(s) in Google Drive but failed to import any.${detail}`;
}

/**
 * Get sync status summary for a data room
 */
export async function getSyncStatus(dataRoomId: number): Promise<{
  config: any | null;
  lastSync: any | null;
  documentCount: number;
}> {
  const config = await db.getDriveSyncConfig(dataRoomId);
  const logs = await db.getDriveSyncLogs(dataRoomId, 1);
  const docs = await db.getDataRoomDocuments(dataRoomId);

  return {
    config,
    lastSync: logs[0] || null,
    documentCount: docs.length,
  };
}

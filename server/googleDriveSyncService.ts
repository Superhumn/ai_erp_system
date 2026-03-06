/**
 * Google Drive Sync Service for Data Room
 * Handles syncing files from Google Drive to the data room
 */

import {
  syncDriveFolder,
  listDriveFolders,
  downloadFile,
  getSimpleFileType,
  DriveFile,
} from './_core/googleDrive';
import * as db from './db';
import { storagePut } from './storage';

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
          });

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
          // Check if file has been modified
          const driveModified = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
          const docModified = existingDoc.updatedAt ? new Date(existingDoc.updatedAt).getTime() : 0;

          if (driveModified > docModified) {
            // File has been updated - re-download and update
            const downloaded = await downloadAndUploadFile(file, options);

            if (downloaded) {
              await db.updateDataRoomDocument(existingDoc.id, {
                name: file.name,
                folderId,
                storageUrl: downloaded.url,
                storageKey: downloaded.key,
                fileSize: file.size ? parseInt(file.size) : undefined,
                mimeType: file.mimeType,
              });
              filesUpdated++;
            } else {
              warnings.push(`Failed to update "${file.name}"`);
            }
          } else {
            filesSkipped++;
          }
        } else {
          // New file - download and create
          const downloaded = await downloadAndUploadFile(file, options);

          if (downloaded) {
            await db.createDataRoomDocument({
              dataRoomId: options.dataRoomId,
              folderId,
              name: file.name,
              fileType: getSimpleFileType(file.mimeType),
              mimeType: file.mimeType,
              fileSize: file.size ? parseInt(file.size) : undefined,
              storageType: 's3',
              storageUrl: downloaded.url,
              storageKey: downloaded.key,
              googleDriveFileId: file.id,
              googleDriveWebViewLink: file.webViewLink,
              thumbnailUrl: file.thumbnailLink,
            });
            filesAdded++;
          } else {
            warnings.push(`Failed to download "${file.name}"`);
          }
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

/**
 * Download a file from Google Drive and upload to our storage
 */
async function downloadAndUploadFile(
  file: DriveFile,
  options: SyncOptions
): Promise<{ url: string; key: string } | null> {
  try {
    // Download the file from Google Drive
    const { content, error } = await downloadFile(
      options.accessToken,
      file.id,
      file.mimeType
    );

    if (error || !content) {
      console.error(`[DriveSync] Failed to download ${file.name}:`, error);
      return null;
    }

    // Upload to our storage with sanitized filename
    // Sanitize filename to prevent path traversal and S3 key issues:
    // 1. Replace path separators (/ \) with underscores
    // 2. Keep only safe characters: alphanumeric, spaces, dots, dashes, underscores
    // 3. Limit length to prevent excessively long keys
    let sanitizedName = file.name
      .replace(/[\/\\]/g, '_')     // Replace slashes with underscores
      .replace(/[^\w\s.-]/g, '')   // Keep only word chars (\w includes a-zA-Z0-9_), spaces, dots, dashes
      .replace(/\s+/g, '_')        // Replace spaces with underscores for cleaner URLs
      .substring(0, 200);          // Limit filename length
    
    // Provide fallback if sanitization results in empty string
    if (!sanitizedName || sanitizedName.trim() === '') {
      sanitizedName = 'unnamed_file';
    }
    
    const key = `dataroom/${options.dataRoomId}/drive-sync/${Date.now()}-${sanitizedName}`;

    const result = await storagePut(key, content, file.mimeType);

    if (!result.url) {
      console.error(`[DriveSync] Failed to upload ${file.name}`);
      return null;
    }

    return { url: result.url, key };
  } catch (error: any) {
    console.error(`[DriveSync] Error processing ${file.name}:`, error);
    return null;
  }
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

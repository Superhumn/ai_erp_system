/**
 * Google Drive Integration for Data Room
 * Handles folder/file listing, syncing, and document access
 */

import { ENV } from "./env";
import { createSignedOAuthState } from "./crypto";

// Google Drive API types
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
}

export interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  parents?: string[];
}

export interface DriveSyncResult {
  success: boolean;
  folders: DriveFolder[];
  files: DriveFile[];
  error?: string;
}

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

// File type mappings
const GOOGLE_DOCS_EXPORT_TYPES: Record<string, { mimeType: string; extension: string }> = {
  "application/vnd.google-apps.document": { mimeType: "application/pdf", extension: "pdf" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf", extension: "pdf" },
  "application/vnd.google-apps.drawing": { mimeType: "image/png", extension: "png" },
};

/**
 * Get OAuth URL for Google Drive access
 */
export function getGoogleDriveAuthUrl(userId: number): string {
  const clientId = ENV.googleClientId;
  const redirectUri = ENV.googleRedirectUri || `${ENV.appUrl}/api/oauth/google/callback`;
  
  // Request drive.readonly scope for reading files and folders
  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/drive.readonly " +
    "https://www.googleapis.com/auth/spreadsheets.readonly"
  );
  
  const state = createSignedOAuthState({ userId, provider: 'google' });

  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
}

/**
 * Get comprehensive OAuth URL for all Google services (Drive, Gmail, Workspace)
 */
export function getGoogleFullAccessAuthUrl(userId: number): string {
  const clientId = ENV.googleClientId;
  const redirectUri = ENV.googleRedirectUri || `${ENV.appUrl}/api/oauth/google/callback`;
  
  // Request all necessary scopes for Drive, Gmail, Docs, and Sheets
  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/drive " +
    "https://www.googleapis.com/auth/drive.file " +
    "https://www.googleapis.com/auth/spreadsheets " +
    "https://www.googleapis.com/auth/documents " +
    "https://www.googleapis.com/auth/gmail.send " +
    "https://www.googleapis.com/auth/gmail.compose " +
    "https://www.googleapis.com/auth/gmail.readonly"
  );
  
  const state = createSignedOAuthState({ userId, provider: 'google' });

  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
}

/**
 * List all folders in a Google Drive folder
 */
export async function listDriveFolders(
  accessToken: string,
  parentFolderId?: string
): Promise<{ folders: DriveFolder[]; error?: string }> {
  try {
    let query = `mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }
    
    const url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,parents)&orderBy=name`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleDrive] Failed to list folders:", error);
      return { folders: [], error: `Failed to list folders: ${response.status}` };
    }
    
    const data = await response.json();
    return { folders: data.files || [] };
  } catch (error: any) {
    console.error("[GoogleDrive] Error listing folders:", error);
    return { folders: [], error: error.message };
  }
}

/**
 * List all files in a Google Drive folder
 */
export async function listDriveFiles(
  accessToken: string,
  folderId: string
): Promise<{ files: DriveFile[]; error?: string }> {
  try {
    const query = `'${folderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME_TYPE}'`;
    
    const url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,webViewLink,thumbnailLink,iconLink,createdTime,modifiedTime,parents)&orderBy=name`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleDrive] Failed to list files:", error);
      return { files: [], error: `Failed to list files: ${response.status}` };
    }
    
    const data = await response.json();
    return { files: data.files || [] };
  } catch (error: any) {
    console.error("[GoogleDrive] Error listing files:", error);
    return { files: [], error: error.message };
  }
}

/**
 * Recursively sync a Google Drive folder structure
 */
export async function syncDriveFolder(
  accessToken: string,
  folderId: string,
  maxDepth: number = 5
): Promise<DriveSyncResult> {
  const allFolders: DriveFolder[] = [];
  const allFiles: DriveFile[] = [];
  
  async function syncRecursive(currentFolderId: string, depth: number) {
    if (depth > maxDepth) return;
    
    // Get subfolders
    const { folders, error: folderError } = await listDriveFolders(accessToken, currentFolderId);
    if (folderError) {
      console.error(`[GoogleDrive] Error syncing folder ${currentFolderId}:`, folderError);
      return;
    }
    
    allFolders.push(...folders);
    
    // Get files in current folder
    const { files, error: fileError } = await listDriveFiles(accessToken, currentFolderId);
    if (fileError) {
      console.error(`[GoogleDrive] Error getting files in ${currentFolderId}:`, fileError);
    } else {
      allFiles.push(...files);
    }
    
    // Recursively sync subfolders
    for (const folder of folders) {
      await syncRecursive(folder.id, depth + 1);
    }
  }
  
  try {
    // Start with the root folder's files
    const { files: rootFiles, error: rootFileError } = await listDriveFiles(accessToken, folderId);
    if (!rootFileError) {
      allFiles.push(...rootFiles);
    }
    
    // Sync subfolders
    await syncRecursive(folderId, 1);
    
    return {
      success: true,
      folders: allFolders,
      files: allFiles,
    };
  } catch (error: any) {
    console.error("[GoogleDrive] Sync error:", error);
    return {
      success: false,
      folders: [],
      files: [],
      error: error.message,
    };
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  accessToken: string,
  fileId: string
): Promise<{ file: DriveFile | null; error?: string }> {
  try {
    const url = `${GOOGLE_DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,webViewLink,thumbnailLink,iconLink,createdTime,modifiedTime,parents`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { file: null, error: `Failed to get file: ${response.status}` };
    }
    
    const file = await response.json();
    return { file };
  } catch (error: any) {
    return { file: null, error: error.message };
  }
}

/**
 * Get a download URL for a file (handles Google Docs export)
 */
export function getFileDownloadUrl(file: DriveFile): { url: string; exportMimeType?: string } {
  // Check if it's a Google Docs file that needs export
  const exportType = GOOGLE_DOCS_EXPORT_TYPES[file.mimeType];
  
  if (exportType) {
    // Google Docs files need to be exported
    return {
      url: `${GOOGLE_DRIVE_API}/files/${file.id}/export?mimeType=${encodeURIComponent(exportType.mimeType)}`,
      exportMimeType: exportType.mimeType,
    };
  }
  
  // Regular files can be downloaded directly
  return {
    url: `${GOOGLE_DRIVE_API}/files/${file.id}?alt=media`,
  };
}

/**
 * Download file content
 */
export async function downloadFile(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<{ content: Buffer | null; error?: string }> {
  try {
    const exportType = GOOGLE_DOCS_EXPORT_TYPES[mimeType];
    let url: string;
    
    if (exportType) {
      url = `${GOOGLE_DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportType.mimeType)}`;
    } else {
      url = `${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`;
    }
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { content: null, error: `Failed to download: ${response.status}` };
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return { content: Buffer.from(arrayBuffer) };
  } catch (error: any) {
    return { content: null, error: error.message };
  }
}

/**
 * Get folder info
 */
export async function getFolderInfo(
  accessToken: string,
  folderId: string
): Promise<{ folder: DriveFolder | null; error?: string }> {
  try {
    const url = `${GOOGLE_DRIVE_API}/files/${folderId}?fields=id,name,mimeType,webViewLink,parents`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { folder: null, error: `Failed to get folder: ${response.status}` };
    }
    
    const folder = await response.json();
    
    if (folder.mimeType !== FOLDER_MIME_TYPE) {
      return { folder: null, error: "Not a folder" };
    }
    
    return { folder };
  } catch (error: any) {
    return { folder: null, error: error.message };
  }
}

/**
 * Map Google Drive mime type to simple file type
 */
export function getSimpleFileType(mimeType: string): string {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("document") || mimeType.includes("word")) return "doc";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xls";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "ppt";
  if (mimeType.includes("image")) return "image";
  if (mimeType.includes("video")) return "video";
  if (mimeType.includes("audio")) return "audio";
  if (mimeType.includes("text")) return "text";
  return "other";
}

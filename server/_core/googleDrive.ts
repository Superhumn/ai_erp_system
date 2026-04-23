/**
 * Google Drive Integration for Data Room
 * Handles folder/file listing, syncing, and document access
 */

import { ENV } from "./env";
import { createSignedOAuthState } from "./crypto";
import {
  getServiceAccountAccessToken,
  getServiceAccountEmail,
  isServiceAccountConfigured,
} from "./googleServiceAccount";

/**
 * Fetch a Drive API URL with Bearer auth, and if the user's token is
 * forbidden, retry with the service-account token when configured. This lets
 * private folders that are shared with the service account be read even when
 * the logged-in user has no direct access.
 */
async function driveFetch(url: string, userAccessToken: string): Promise<Response> {
  const primary = await fetch(url, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (primary.status !== 403 && primary.status !== 401) return primary;
  if (!isServiceAccountConfigured()) return primary;

  const saToken = await getServiceAccountAccessToken();
  if (!saToken) return primary;

  const retry = await fetch(url, {
    headers: { Authorization: `Bearer ${saToken}` },
  });
  // Only prefer the retry when it actually succeeded; otherwise surface the
  // original error so callers can see the user-scoped failure reason.
  return retry.ok ? retry : primary;
}

/**
 * Build a "share this folder with…" hint for 403/404 errors.
 */
function permissionHint(): string {
  const saEmail = getServiceAccountEmail();
  if (saEmail) {
    return ` Share the file or parent folder with ${saEmail} (Viewer is enough) so the server can read it without making it public.`;
  }
  return " Share the file or parent folder with the connected Google account, or configure GOOGLE_SERVICE_ACCOUNT_JSON and share the folder with the service account's email.";
}

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
  const redirectUri = ENV.googleRedirectUri || `${process.env.VITE_APP_URL || ENV.appUrl}/api/oauth/google/callback`;
  
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
export function getGoogleFullAccessAuthUrl(userId: number, returnTo?: string): string {
  const clientId = ENV.googleClientId;
  const redirectUri = ENV.googleRedirectUri || `${process.env.VITE_APP_URL || ENV.appUrl}/api/oauth/google/callback`;

  // Request all necessary scopes for Drive, Gmail, Docs, Sheets, and Calendar
  // NOTE: You must enable the Google Calendar API in your Google Cloud Console:
  // https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/drive " +
    "https://www.googleapis.com/auth/drive.file " +
    "https://www.googleapis.com/auth/spreadsheets " +
    "https://www.googleapis.com/auth/documents " +
    "https://www.googleapis.com/auth/gmail.send " +
    "https://www.googleapis.com/auth/gmail.compose " +
    "https://www.googleapis.com/auth/gmail.readonly " +
    "https://www.googleapis.com/auth/calendar " +
    "https://www.googleapis.com/auth/calendar.events"
  );

  const statePayload: Record<string, unknown> = { userId, provider: 'google' };
  if (returnTo) statePayload.returnTo = returnTo;
  const state = createSignedOAuthState(statePayload);

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
    
    const url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,parents)&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await driveFetch(url, accessToken);

    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleDrive] Failed to list folders:", error);
      const hint = response.status === 403 || response.status === 404 ? permissionHint() : "";
      return { folders: [], error: `Failed to list folders: ${response.status}.${hint}` };
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
    
    const url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,webViewLink,thumbnailLink,iconLink,createdTime,modifiedTime,parents)&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await driveFetch(url, accessToken);

    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleDrive] Failed to list files:", error);
      const hint = response.status === 403 || response.status === 404 ? permissionHint() : "";
      return { files: [], error: `Failed to list files: ${response.status}.${hint}` };
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
    
    // Skip folders named "Private" or starting with "_"
    const filteredFolders = folders.filter(f =>
      !f.name.toLowerCase().includes('private') &&
      !f.name.startsWith('_') &&
      !f.name.toLowerCase().includes('confidential')
    );
    allFolders.push(...filteredFolders);

    // Get files in current folder
    const { files, error: fileError } = await listDriveFiles(accessToken, currentFolderId);
    if (fileError) {
      console.error(`[GoogleDrive] Error getting files in ${currentFolderId}:`, fileError);
    } else {
      allFiles.push(...files);
    }
    
    // Recursively sync subfolders (only non-private ones)
    for (const folder of filteredFolders) {
      await syncRecursive(folder.id, depth + 1);
    }
  }
  
  try {
    // Sync root folder and all subfolders recursively
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
    const url = `${GOOGLE_DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,webViewLink,thumbnailLink,iconLink,createdTime,modifiedTime,parents&supportsAllDrives=true`;

    const response = await driveFetch(url, accessToken);

    if (!response.ok) {
      const error = await response.text();
      const hint = response.status === 403 || response.status === 404 ? permissionHint() : "";
      return { file: null, error: `Failed to get file: ${response.status}. ${error}${hint}` };
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
      url = `${GOOGLE_DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`;
    }

    const response = await driveFetch(url, accessToken);

    if (!response.ok) {
      const body = await response.text();
      const hint = response.status === 403 || response.status === 404 ? permissionHint() : "";
      return { content: null, error: `Failed to download: ${response.status}. ${body}${hint}` };
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return { content: Buffer.from(arrayBuffer) };
  } catch (error: any) {
    return { content: null, error: error.message };
  }
}

/**
 * Download a Drive file's content, exporting Google Workspace files as PDF.
 * Returns the raw buffer and the effective MIME type after any export conversion.
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<{ buffer: Buffer; exportedMimeType: string } | { error: string }> {
  try {
    let url: string;
    let exportedMimeType = mimeType;

    // Google Workspace files need to be exported
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
      exportedMimeType = 'application/pdf';
    } else if (mimeType === 'application/vnd.google-apps.document') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
      exportedMimeType = 'application/pdf';
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
      exportedMimeType = 'application/pdf';
    } else if (mimeType === 'application/vnd.google-apps.drawing') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=image/png`;
      exportedMimeType = 'image/png';
    } else {
      // Regular files — download directly
      url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
    }

    const response = await driveFetch(url, accessToken);

    if (!response.ok) {
      const body = await response.text();
      const hint = response.status === 403 || response.status === 404 ? permissionHint() : "";
      return { error: `Download failed: ${response.status}. ${body}${hint}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), exportedMimeType };
  } catch (e: any) {
    return { error: e.message };
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
    const url = `${GOOGLE_DRIVE_API}/files/${folderId}?fields=id,name,mimeType,webViewLink,parents&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await driveFetch(url, accessToken);

    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleDrive] getFolderInfo failed:", response.status, error);
      const hint = response.status === 403 || response.status === 404
        ? permissionHint()
        : "";
      return { folder: null, error: `Failed to get folder (${response.status}): ${error}.${hint}` };
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

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
export async function driveFetch(url: string, userAccessToken: string): Promise<Response> {
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
  // True when the root listed OK but one or more nested sub-folders failed to
  // list (tolerated). Callers must NOT delete-propagate on a partial tree — a
  // "missing" file may simply be under an unlisted sub-folder.
  partial?: boolean;
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

// Export targets for the INLINE VIEWER (proxy streaming). Everything a browser
// can render in an <iframe>: Docs/Sheets/Slides → PDF, Drawings → PNG. This
// differs from GOOGLE_DOCS_EXPORT_TYPES (used for downloads) where a Sheet
// exports to xlsx — an xlsx can't be previewed in an iframe.
const GOOGLE_DOCS_VIEW_EXPORT_TYPES: Record<string, { mimeType: string }> = {
  "application/vnd.google-apps.document": { mimeType: "application/pdf" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "application/pdf" },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf" },
  "application/vnd.google-apps.drawing": { mimeType: "image/png" },
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
 * Run a Drive `files.list` query with Shared Drive support and a safe fallback.
 *
 * Prefers the `allDrives` corpus so files that live in Shared/Team Drives are
 * returned. Some Drive configurations reject `corpora=allDrives` with a 400 —
 * it can't be combined with certain parameters (notably `orderBy`) and some
 * account types disallow it. On a 400 we transparently retry against the
 * default (user) corpus, which is the behaviour that worked before Shared Drive
 * support was added, so a listing never fails outright merely because
 * `allDrives` was requested.
 *
 * `orderBy` is deliberately NOT sent (incompatible with `allDrives`); callers
 * sort client-side by name.
 */
async function driveFilesListAll(
  accessToken: string,
  query: string,
  fields: string,
): Promise<{ files: any[]; error?: string }> {
  const collect = async (
    useAllDrives: boolean,
  ): Promise<{ files: any[]; ok: boolean; status: number; text: string }> => {
    const files: any[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: query,
        fields,
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (useAllDrives) params.set("corpora", "allDrives");
      if (pageToken) params.set("pageToken", pageToken);

      const response = await driveFetch(`${GOOGLE_DRIVE_API}/files?${params.toString()}`, accessToken);
      if (!response.ok) {
        return { files, ok: false, status: response.status, text: await response.text() };
      }
      const data = await response.json();
      if (Array.isArray(data.files)) files.push(...data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);
    return { files, ok: true, status: 200, text: "" };
  };

  // Prefer allDrives; on a 400 (unsupported param combo / account type), fall
  // back to the default corpus so we still return whatever is reachable.
  let result = await collect(true);
  if (!result.ok && result.status === 400) {
    console.warn("[GoogleDrive] corpora=allDrives rejected (400); retrying with default corpus.");
    result = await collect(false);
  }
  if (!result.ok) {
    console.error("[GoogleDrive] files.list failed:", result.status, result.text);
    const hint = result.status === 403 || result.status === 404 ? permissionHint() : "";
    return { files: [], error: `Failed to list Drive contents: ${result.status}.${hint}` };
  }
  return { files: result.files };
}

const byName = (a: { name?: string }, b: { name?: string }) => (a.name || "").localeCompare(b.name || "");

/**
 * List all folders in a Google Drive folder
 */
export async function listDriveFolders(
  accessToken: string,
  parentFolderId?: string
): Promise<{ folders: DriveFolder[]; error?: string }> {
  let query = `mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }
  const { files, error } = await driveFilesListAll(
    accessToken,
    query,
    "nextPageToken,files(id,name,mimeType,webViewLink,parents)",
  );
  if (error) return { folders: [], error };
  return { folders: (files as DriveFolder[]).sort(byName) };
}

/**
 * List all files in a Google Drive folder
 */
export async function listDriveFiles(
  accessToken: string,
  folderId: string
): Promise<{ files: DriveFile[]; error?: string }> {
  const query = `'${folderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME_TYPE}'`;
  const { files, error } = await driveFilesListAll(
    accessToken,
    query,
    "nextPageToken,files(id,name,mimeType,size,webViewLink,thumbnailLink,iconLink,createdTime,modifiedTime,parents)",
  );
  if (error) return { files: [], error };
  return { files: (files as DriveFile[]).sort(byName) };
}

/**
 * List all items (folders AND files) in a Google Drive folder in a single API call.
 * Splits items client-side by mimeType, which avoids relying on the `!=` operator
 * in Drive query strings (known to be unreliable for some account types / Shared Drives).
 */
async function listDriveItems(
  accessToken: string,
  parentFolderId: string
): Promise<{ folders: DriveFolder[]; files: DriveFile[]; error?: string }> {
  const query = `'${parentFolderId}' in parents and trashed=false`;
  const { files: items, error } = await driveFilesListAll(
    accessToken,
    query,
    "nextPageToken,files(id,name,mimeType,size,webViewLink,thumbnailLink,iconLink,createdTime,modifiedTime,parents)",
  );
  if (error) return { folders: [], files: [], error };

  const folders: DriveFolder[] = [];
  const files: DriveFile[] = [];
  for (const item of items) {
    if (item.mimeType === FOLDER_MIME_TYPE) {
      folders.push(item as DriveFolder);
    } else {
      files.push(item as DriveFile);
    }
  }
  return { folders: folders.sort(byName), files: files.sort(byName) };
}

/**
 * Folders that must never be pulled into a data room, matching the security
 * promise shown in the import dialog: anything named "private"/"confidential"
 * (case-insensitive) or whose name starts with "_". Applied to NESTED folders
 * only — the root folder the user explicitly selects is always synced (so a
 * root like "_Data Room" still works).
 */
export function isConfidentialFolderName(name: string): boolean {
  const n = (name || "").trim().toLowerCase();
  return n.startsWith("_") || n === "private" || n === "confidential";
}

/**
 * Recursively sync a Google Drive folder structure.
 *
 * Uses a single `listDriveItems` call per folder (no mimeType filter in the
 * query) and splits results client-side. This avoids the `mimeType!=` operator
 * which is unreliable for certain Google Drive account types and Shared Drives,
 * and also cuts the number of API round-trips in half.
 *
 * Nested folders whose names match `isConfidentialFolderName` are skipped
 * entirely (not listed, not recursed into), so confidential content never
 * enters the data room.
 */
export async function syncDriveFolder(
  accessToken: string,
  folderId: string,
  maxDepth: number = 5
): Promise<DriveSyncResult> {
  const allFolders: DriveFolder[] = [];
  const allFiles: DriveFile[] = [];
  // A failure to list the ROOT folder means the sync produced nothing usable,
  // so it must be surfaced to the caller. Failures inside nested subfolders are
  // tolerated (one inaccessible subfolder shouldn't abort the whole sync) but
  // are recorded via `partial` so callers can refuse destructive reconciliation.
  let rootError: string | undefined;
  let partial = false;

  async function syncRecursive(currentFolderId: string, depth: number) {
    if (depth > maxDepth) {
      // Recursion was cut off before this sub-tree could be listed, so the tree
      // is incomplete. Mark partial so callers skip delete-propagation (a
      // deeper item isn't "deleted", just unlisted).
      partial = true;
      return;
    }

    // Single call returns both folders and files; split is done client-side.
    const { folders, files, error } = await listDriveItems(accessToken, currentFolderId);
    if (error) {
      console.error(`[GoogleDrive] Error listing contents of ${currentFolderId}:`, error);
      // Root folder failure is fatal; record it so the caller can report why
      // nothing synced (e.g. the folder isn't shared / token lacks Drive scope).
      if (depth === 1) rootError = error;
      // Nested folders: do not abort the whole sync — other folders that were
      // already discovered may still be processed by the caller — but mark the
      // tree as partial so delete-propagation is skipped.
      else partial = true;
      return;
    }

    // Drop confidential sub-folders before recording or recursing so neither
    // they nor their contents ever enter the data room. The root (depth 1) is
    // the folder the user explicitly chose, so it is never filtered here.
    const visibleFolders = folders.filter((f) => !isConfidentialFolderName(f.name));

    allFolders.push(...visibleFolders);
    allFiles.push(...files);

    // Recurse into the surviving sub-folders found in this directory.
    for (const folder of visibleFolders) {
      await syncRecursive(folder.id, depth + 1);
    }
  }

  try {
    // Sync root folder and all subfolders recursively
    await syncRecursive(folderId, 1);

    if (rootError) {
      return {
        success: false,
        folders: [],
        files: [],
        error: rootError,
      };
    }

    return {
      success: true,
      folders: allFolders,
      files: allFiles,
      partial,
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
 * Resolve the Drive URL to fetch a file's bytes from, plus the effective
 * output MIME type after any Google Workspace → PDF/PNG export conversion.
 * Used by the streaming proxy endpoint so the browser gets a viewable file
 * without the server having to buffer it.
 */
export function resolveDriveStreamUrl(fileId: string, mimeType: string): { url: string; outMime: string } {
  const exportType = GOOGLE_DOCS_VIEW_EXPORT_TYPES[mimeType];
  if (exportType) {
    return {
      url: `${GOOGLE_DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportType.mimeType)}`,
      outMime: exportType.mimeType,
    };
  }
  return {
    url: `${GOOGLE_DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`,
    outMime: mimeType,
  };
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

# Google Drive Sync for Data Rooms

## Overview

The Google Drive sync feature allows you to sync existing Google Drive folders to your data rooms. All synced files and folders automatically inherit the security and access controls configured for the data room.

## Features

- **Automatic Security Inheritance**: All synced content automatically gets:
  - Password protection (if enabled on data room)
  - NDA requirements (if enabled on data room)
  - Access controls and invitations
  - Download/print permissions
  - Document watermarking
  - Visitor tracking and analytics

- **Folder Hierarchy Preservation**: The entire folder structure from Google Drive is maintained in the data room

- **Direct Google Drive Access**: Files are linked to their Google Drive locations for viewing

## How to Use

### Prerequisites

1. Connect your Google account in Settings > Integrations
2. Ensure you have appropriate permissions to access the Google Drive folder

### Syncing a Folder

1. Navigate to your data room
2. Go to the **Settings** tab
3. Find the **Google Drive Sync** section
4. Click **Connect** (or **Re-sync** if already connected)
5. Enter the Google Drive Folder ID:
   - Open the folder in Google Drive
   - Copy the folder ID from the URL (the part after `/folders/`)
   - Example: If URL is `https://drive.google.com/drive/folders/1ABC123xyz`, the ID is `1ABC123xyz`
6. Review the security controls that will apply
7. Click **Sync Folder**

### What Gets Synced

- All files in the selected folder and its subfolders (up to 5 levels deep)
- Folder names and hierarchy
- File metadata (name, size, type)
- Links to view files in Google Drive

### Security & Access Controls

All synced files and folders are subject to the data room's security settings:

#### Room-Level Controls
- **Password Protection**: Visitors must enter password before accessing any content
- **NDA Requirements**: Visitors must sign NDA before viewing documents
- **Access Modes**: Public, Private, or Invitation-Only
- **Download/Print Permissions**: Control whether visitors can download or print
- **Document Watermarking**: Add visitor email watermarks to documents

#### Visitor Tracking
- Every access is logged with IP address, user agent, and timestamp
- Track which documents each visitor views
- Monitor time spent on each document
- Block or revoke access at any time

#### Granular Permissions
- Set folder-level and document-level restrictions per visitor
- Control exactly which files each person can access
- Separate permissions for different links

### File Storage

- Synced files maintain their link to Google Drive
- Files are displayed with a Google Drive badge
- Clicking "View" opens the file in Google Drive
- Original files remain in Google Drive (no duplication)

### Re-syncing

To update the data room with new files from Google Drive:

1. Go to Settings > Google Drive Sync
2. Click **Re-sync**
3. Use the same folder ID
4. Only new files and folders will be added (duplicates are detected and skipped)

## Important Notes

- **One-Way Sync**: Changes in Google Drive are not automatically reflected in the data room. You must manually re-sync to add new files.
- **Duplicate Detection**: When re-syncing, existing files and folders are detected by their Google Drive IDs and skipped.
- **Permissions**: Synced files use the data room's security controls, not Google Drive's permissions
- **File Limits**: Syncing stops at 5 levels of folder depth to prevent excessive recursion
- **Google Workspace Files**: Google Docs, Sheets, and Presentations are linked and can be viewed in Google Drive

## Supported File Types

- PDF documents
- Microsoft Office files (Word, Excel, PowerPoint)
- Google Workspace files (Docs, Sheets, Slides)
- Images (PNG, JPEG, GIF)
- And many more

## Troubleshooting

**"Google account not connected"**
- Go to Settings > Integrations and connect your Google account

**"Failed to get folder"**
- Verify the folder ID is correct
- Ensure you have access to the folder in Google Drive
- Check that your Google OAuth token hasn't expired

**"Access denied"**
- Only the data room owner can sync folders
- Admins can also perform syncs

**Folders sync but no files appear**
- If the folder lives in a **Shared Drive (Team Drive)**, the listing now
  requests `corpora=allDrives` so Shared Drive files are included. Make sure the
  connected Google account (or the service account) is a member of the Shared
  Drive.
- The sync no longer reports a green "success" when zero files come back — it now
  tells you whether **no files were found** in Drive vs. **files were found but
  failed to import** (with the first error). Individual file failures no longer
  abort the whole sync; other files still import and the count of failures is
  shown.
- Confirm the folder actually contains files (not just empty subfolders) and that
  they are within 5 levels of nesting.

## Example Use Cases

1. **Due Diligence**: Sync a folder containing confidential company documents with NDA requirement
2. **Client Portal**: Share specific folders with password protection for different clients
3. **Board Materials**: Sync meeting materials with watermarking and no-download policies
4. **Document Reviews**: Share folders with time-limited access and visitor tracking

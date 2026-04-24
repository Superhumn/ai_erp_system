-- Migration 0035: Convert existing Drive-synced documents to metadata-only.
-- Drive files are now streamed through /api/drive/proxy/:documentId instead of
-- being downloaded into our storage. Any document that still has a Drive file
-- id should be reclassified as storageType='google_drive' with its storageUrl
-- and storageKey cleared so the viewer routes through the proxy.

UPDATE `data_room_documents`
SET
  `storageType` = 'google_drive',
  `storageUrl` = NULL,
  `storageKey` = NULL
WHERE `googleDriveFileId` IS NOT NULL;

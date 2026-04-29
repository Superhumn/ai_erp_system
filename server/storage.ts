// Preconfigured storage helpers for Manus WebDev templates
// Uses the Biz-provided storage proxy (Authorization: Bearer <token>)
// Falls back to AWS S3 when Forge API credentials are not configured.

import { ENV } from './_core/env';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ── Forge proxy helpers ────────────────────────────────────────────────────────

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// ── S3 helpers ─────────────────────────────────────────────────────────────────

const S3_DEFAULT_REGION = "us-east-1";

// Presigned URL valid for 7 days (max for temporary access links)
const S3_PRESIGNED_URL_EXPIRES = 7 * 24 * 60 * 60;

function isS3Configured(): boolean {
  return !!(
    ENV.awsAccessKeyId &&
    ENV.awsSecretAccessKey &&
    ENV.awsS3Bucket
  );
}

function buildS3ObjectUrl(bucket: string, key: string, region: string): string {
  const encodedKey = key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

function getS3Client(): S3Client {
  if (!ENV.awsAccessKeyId || !ENV.awsSecretAccessKey) {
    throw new Error("AWS credentials missing: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
  }
  return new S3Client({
    region: ENV.awsRegion || S3_DEFAULT_REGION,
    credentials: {
      accessKeyId: ENV.awsAccessKeyId,
      secretAccessKey: ENV.awsSecretAccessKey,
    },
  });
}

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : data;
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: ENV.awsS3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  const region = ENV.awsRegion || S3_DEFAULT_REGION;
  const url = buildS3ObjectUrl(ENV.awsS3Bucket!, key, region);
  return { key, url };
}

async function s3Get(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const s3 = getS3Client();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: ENV.awsS3Bucket, Key: key }),
    { expiresIn: S3_PRESIGNED_URL_EXPIRES }
  );
  return { key, url };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  // Prefer S3 when Forge credentials are absent but S3 is configured
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    if (isS3Configured()) {
      return s3Put(relKey, data, contentType);
    }
    throw new Error(
      "No storage backend configured. Set FORGE_API_URL + FORGE_API_KEY (Forge proxy) " +
      "or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_S3_BUCKET (S3)."
    );
  }

  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  // Prefer S3 when Forge credentials are absent but S3 is configured
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    if (isS3Configured()) {
      return s3Get(relKey);
    }
    throw new Error(
      "No storage backend configured. Set FORGE_API_URL + FORGE_API_KEY (Forge proxy) " +
      "or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_S3_BUCKET (S3)."
    );
  }

  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}

// Delete an object from the configured backend. S3 is implemented; the Forge
// proxy doesn't currently expose a delete API, so we no-op there with a
// warning rather than failing the caller.
export async function storageDelete(relKey: string): Promise<void> {
  if (!relKey) return;
  const key = normalizeKey(relKey);
  if (isS3Configured() && (!ENV.forgeApiUrl || !ENV.forgeApiKey)) {
    const s3 = getS3Client();
    await s3.send(new DeleteObjectCommand({ Bucket: ENV.awsS3Bucket, Key: key }));
    return;
  }
  if (isS3Configured()) {
    // Both backends configured — prefer S3 for deletion since that's where
    // S3-keyed blobs live.
    const s3 = getS3Client();
    await s3.send(new DeleteObjectCommand({ Bucket: ENV.awsS3Bucket, Key: key }));
    return;
  }
  console.warn(`[storage] delete skipped for key ${key}: Forge proxy has no delete API`);
}


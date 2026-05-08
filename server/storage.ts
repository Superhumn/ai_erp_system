// Cloudflare R2 storage helpers (S3-compatible via @aws-sdk/client-s3)

import { ENV } from './_core/env';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// ── R2 helpers ─────────────────────────────────────────────────────────────────

// Presigned URL valid for 7 days (max for temporary access links)
const R2_PRESIGNED_URL_EXPIRES = 7 * 24 * 60 * 60;

function isR2Configured(): boolean {
  return !!(
    ENV.r2AccountId &&
    ENV.r2AccessKeyId &&
    ENV.r2SecretAccessKey &&
    ENV.r2Bucket
  );
}

function getR2Client(): S3Client {
  if (!ENV.r2AccountId || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey) {
    throw new Error("R2 credentials missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${ENV.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
  });
}

function buildR2Url(key: string): string {
  if (ENV.r2PublicUrl) {
    return `${ENV.r2PublicUrl.replace(/\/+$/, "")}/${key}`;
  }
  return "";
}

async function r2Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : data;
  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({
      Bucket: ENV.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  const publicUrl = buildR2Url(key);
  if (publicUrl) {
    return { key, url: publicUrl };
  }
  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: ENV.r2Bucket, Key: key }),
    { expiresIn: R2_PRESIGNED_URL_EXPIRES }
  );
  return { key, url };
}

async function r2Get(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const publicUrl = buildR2Url(key);
  if (publicUrl) {
    return { key, url: publicUrl };
  }
  const r2 = getR2Client();
  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: ENV.r2Bucket, Key: key }),
    { expiresIn: R2_PRESIGNED_URL_EXPIRES }
  );
  return { key, url };
}

async function r2Delete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  const r2 = getR2Client();
  await r2.send(new DeleteObjectCommand({ Bucket: ENV.r2Bucket, Key: key }));
}

// ── Public API ─────────────────────────────────────────────────────────────────

function r2NotConfiguredError(): Error {
  return new Error(
    "No storage backend configured. Set R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET (Cloudflare R2)."
  );
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!isR2Configured()) throw r2NotConfiguredError();
  return r2Put(relKey, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  if (!isR2Configured()) throw r2NotConfiguredError();
  return r2Get(relKey);
}

export async function storageDelete(relKey: string): Promise<void> {
  if (!relKey) return;
  if (!isR2Configured()) {
    console.warn(`[storage] delete skipped for key ${relKey}: R2 is not configured`);
    return;
  }
  await r2Delete(relKey);
}


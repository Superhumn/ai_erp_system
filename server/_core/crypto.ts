import crypto from 'crypto';

const AES_GCM_IV_LENGTH = 12;
const AES_GCM_AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a string using AES-256-GCM (authenticated encryption) with a random IV
 * @param text - The text to encrypt
 * @param secret - The encryption secret (defaults to JWT_SECRET from env)
 * @returns Encrypted string in format "iv:authTag:ciphertext" (all in hex)
 */
export function encrypt(text: string, secret?: string): string {
  const key = secret || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('Encryption secret is required. Set JWT_SECRET environment variable.');
  }

  const iv = crypto.randomBytes(AES_GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(key), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string that was encrypted with the encrypt function
 * @param encryptedText - The encrypted text in format "iv:authTag:ciphertext" (all in hex)
 * @param secret - The encryption secret (defaults to JWT_SECRET from env)
 * @returns Decrypted string
 */
export function decrypt(encryptedText: string, secret?: string): string {
  const key = secret || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('Decryption secret is required. Set JWT_SECRET environment variable.');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedData = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(key), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Create an HMAC-signed OAuth state parameter
 * Format: "payload.signature" where payload is base64url-encoded JSON
 */
export function createSignedOAuthState(data: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET required for OAuth state signing');
  const payload = Buffer.from(JSON.stringify({ ...data, ts: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verify and decode an HMAC-signed OAuth state parameter
 * Returns null if signature is invalid or state has expired
 */
export function verifySignedOAuthState(state: string, maxAgeMs = 10 * 60 * 1000): Record<string, unknown> | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const dotIdx = state.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.ts === 'number' && Date.now() - data.ts > maxAgeMs) return null;
    return data;
  } catch {
    return null;
  }
}

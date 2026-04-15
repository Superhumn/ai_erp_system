import crypto from 'crypto';

// Maximum age for signed OAuth state tokens (10 minutes)
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Creates an HMAC-signed OAuth state parameter to prevent CSRF attacks.
 * Format: "<userId>:<timestampMs>:<hmac-sha256-hex>"
 */
export function createSignedOAuthState(userId: number): string {
  const key = process.env.JWT_SECRET;
  if (!key) {
    throw new Error('JWT_SECRET is required for OAuth state signing');
  }
  const payload = `${userId}:${Date.now()}`;
  const mac = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return `${payload}:${mac}`;
}

/**
 * Validates an HMAC-signed OAuth state parameter.
 * Returns the userId on success, or an error string on failure.
 */
export function verifySignedOAuthState(state: string): { userId?: number; error?: string } {
  try {
    const key = process.env.JWT_SECRET;
    if (!key) return { error: 'JWT_SECRET is required' };

    // The mac is the last colon-delimited segment; payload is everything before it.
    const lastColon = state.lastIndexOf(':');
    if (lastColon === -1) return { error: 'Invalid state format' };

    const payload = state.slice(0, lastColon);
    const mac = state.slice(lastColon + 1);

    // SHA-256 HMAC produces exactly 32 bytes = 64 lowercase hex characters.
    // Reject anything else before touching crypto primitives.
    if (!/^[0-9a-f]{64}$/.test(mac)) return { error: 'Invalid state format' };

    const expectedMac = crypto.createHmac('sha256', key).update(payload).digest('hex');
    const macBuf = Buffer.from(mac, 'hex');
    const expectedBuf = Buffer.from(expectedMac, 'hex');

    if (!crypto.timingSafeEqual(macBuf, expectedBuf)) {
      return { error: 'Invalid state signature' };
    }

    const [userIdStr, timestampStr] = payload.split(':');
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > OAUTH_STATE_MAX_AGE_MS) {
      return { error: 'State expired' };
    }

    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId) || userId <= 0) return { error: 'Invalid user ID in state' };

    return { userId };
  } catch {
    return { error: 'State validation failed' };
  }
}

/**
 * Encrypts a string using AES-256-CBC encryption with a random IV
 * @param text - The text to encrypt
 * @param secret - The encryption secret (defaults to JWT_SECRET from env)
 * @returns Encrypted string in format "iv:encryptedData" (both in hex)
 */
export function encrypt(text: string, secret?: string): string {
  const key = secret || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('Encryption secret is required. Set JWT_SECRET environment variable.');
  }
  
  // Generate a random IV for each encryption
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    crypto.createHash('sha256').update(key).digest().slice(0, 32),
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV and encrypted data together
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string that was encrypted with the encrypt function
 * @param encryptedText - The encrypted text in format "iv:encryptedData" (both in hex)
 * @param secret - The encryption secret (defaults to JWT_SECRET from env)
 * @returns Decrypted string
 */
export function decrypt(encryptedText: string, secret?: string): string {
  const key = secret || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('Decryption secret is required. Set JWT_SECRET environment variable.');
  }
  
  // Split IV and encrypted data
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedData = parts[1];
  
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    crypto.createHash('sha256').update(key).digest().slice(0, 32),
    iv
  );
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Safely decrypts a token that was encrypted with encrypt().
 * Returns null instead of throwing if the value is missing or decryption fails.
 */
export function safeDecryptToken(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;
  try {
    return decrypt(encryptedText);
  } catch {
    return null;
  }
}

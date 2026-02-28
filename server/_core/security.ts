import crypto from 'crypto';

/**
 * Hash a password using scrypt (built-in Node.js KDF with salt)
 * Format: salt:hash (both hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify a password against a stored scrypt hash
 * Also supports legacy SHA-256 hashes for migration (64-char hex without colon)
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Legacy SHA-256 hash (64 hex chars, no colon separator)
  if (!storedHash.includes(':') && storedHash.length === 64) {
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sha256Hash, 'hex'), Buffer.from(storedHash, 'hex'));
  }

  const [salt, hash] = storedHash.split(':');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(salt, 'hex'), 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(crypto.timingSafeEqual(derivedKey, Buffer.from(hash, 'hex')));
    });
  });
}

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(prefix: string = '', length: number = 32): string {
  const token = crypto.randomBytes(length).toString('hex');
  return prefix ? `${prefix}_${token}` : token;
}

/**
 * Generate a secure random alphanumeric string (for IDs like PO numbers)
 */
export function generateSecureId(length: number = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate a URL to prevent SSRF attacks
 * Rejects private/reserved IP ranges, non-HTTPS schemes, etc.
 */
export function validateExternalUrl(url: string, allowedHostPatterns?: RegExp[]): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error(`Only HTTPS URLs are allowed, got: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  const blockedHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]'];
  if (blockedHosts.includes(hostname)) {
    throw new Error(`URL hostname is not allowed: ${hostname}`);
  }

  // Block private IP ranges
  const privateIpPatterns = [
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local / cloud metadata
    /^fc00:/i,     // IPv6 ULA
    /^fe80:/i,     // IPv6 link-local
    /^fd/i,        // IPv6 ULA
  ];

  for (const pattern of privateIpPatterns) {
    if (pattern.test(hostname)) {
      throw new Error(`URL points to a private/reserved IP range: ${hostname}`);
    }
  }

  // If allowedHostPatterns are provided, check against them
  if (allowedHostPatterns && allowedHostPatterns.length > 0) {
    const isAllowed = allowedHostPatterns.some(pattern => pattern.test(hostname));
    if (!isAllowed) {
      throw new Error(`URL hostname is not in the allowed list: ${hostname}`);
    }
  }
}

/**
 * Validate a Shopify store domain
 */
export function validateShopifyDomain(domain: string): string {
  const cleaned = domain.trim().toLowerCase();
  if (!cleaned.endsWith('.myshopify.com')) {
    throw new Error(`Invalid Shopify domain: must end with .myshopify.com`);
  }
  // Ensure no path traversal or injection
  if (cleaned.includes('/') || cleaned.includes('\\') || cleaned.includes('@')) {
    throw new Error(`Invalid Shopify domain format: ${cleaned}`);
  }
  return cleaned;
}

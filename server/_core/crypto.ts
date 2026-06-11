import crypto from 'crypto';

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
import crypto from 'crypto';

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

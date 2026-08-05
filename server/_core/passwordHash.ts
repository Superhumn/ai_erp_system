/**
 * Shared PBKDF2 password hashing for local auth.
 * Kept separate from localAuth.ts so db helpers can reuse it without cycles.
 */

import { pbkdf2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);

export const SALT_LENGTH = 32;
export const HASH_ITERATIONS = 600000;
export const HASH_ITERATIONS_LEGACY = 100000; // pre–April 2026 accounts
export const KEY_LENGTH = 64;
export const DIGEST = "sha512";

/** Derive the raw PBKDF2 key bytes. */
export function deriveKey(password: string, salt: string, iterations: number): Promise<Buffer> {
  return pbkdf2Async(password, salt, iterations, KEY_LENGTH, DIGEST);
}

export async function hashPasswordWithIterations(
  password: string,
  salt: string,
  iterations: number
): Promise<string> {
  return (await deriveKey(password, salt, iterations)).toString("hex");
}

/** Hash with the current iteration count. */
export function hashPassword(password: string, salt: string): Promise<string> {
  return hashPasswordWithIterations(password, salt, HASH_ITERATIONS);
}

export function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString("hex");
}

/**
 * Verify a password against a stored hash.
 * Returns needsUpgrade when the hash used the legacy iteration count.
 */
export async function verifyPassword(
  password: string,
  salt: string,
  hash: string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  const stored = Buffer.from(hash, "hex");

  const candidate = await deriveKey(password, salt, HASH_ITERATIONS);
  if (candidate.length === stored.length && timingSafeEqual(candidate, stored)) {
    return { valid: true, needsUpgrade: false };
  }

  const legacy = await deriveKey(password, salt, HASH_ITERATIONS_LEGACY);
  if (legacy.length === stored.length && timingSafeEqual(legacy, stored)) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
}

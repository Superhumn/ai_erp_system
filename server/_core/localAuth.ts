/**
 * Local Authentication System
 * Provides email/password authentication as a replacement for manus.ai OAuth
 */

import { pbkdf2Sync, randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const SALT_LENGTH = 32;
const HASH_ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

// Rate limiting
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Check and update rate limit for an IP address
 * Returns true if request should be allowed, false if rate limited
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  // Clean up expired entries
  if (attempt && now > attempt.resetAt) {
    loginAttempts.delete(ip);
  }

  const current = loginAttempts.get(ip);
  if (!current) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  current.count++;
  return true;
}

/**
 * Reset rate limit for an IP address (called on successful login)
 */
function resetRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Hash a password using PBKDF2
 */
function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
}

function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString("hex");
}

/**
 * Verify a password against a hash
 */
function verifyPassword(password: string, salt: string, hash: string): boolean {
  const passwordHash = hashPassword(password, salt);
  return passwordHash === hash;
}

/**
 * Generate a unique openId for local users
 * Format: local_{nanoid}
 */
async function generateLocalOpenId(): Promise<string> {
  const { nanoid } = await import("nanoid");
  return `local_${nanoid(21)}`;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export interface LocalAuthCredentials {
  email: string;
  password: string;
  name?: string;
}

/**
 * Register local authentication routes
 */
export function registerLocalAuthRoutes(app: Express) {
  /**
   * POST /api/auth/signup
   * Register a new user with email/password
   */
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ 
        error: "Too many signup attempts. Please try again in 15 minutes." 
      });
    }

    try {
      const { email, password, name } = req.body as LocalAuthCredentials;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      if (!isValidPassword(password)) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Check if user already exists
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "User with this email already exists" });
      }

      // Generate salt and hash password
      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      const openId = await generateLocalOpenId();

      // Store credentials
      await db.createLocalAuthCredential({
        openId,
        email: email.toLowerCase(),
        passwordHash,
        salt,
      });

      // Create user record
      await db.upsertUser({
        openId,
        name: name || email.split("@")[0],
        email: email.toLowerCase(),
        loginMethod: "email",
        lastSignedIn: new Date(),
      });

      // Create session
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Reset rate limit on successful signup
      resetRateLimit(clientIp);

      return res.status(201).json({
        success: true,
        message: "Account created successfully",
      });
    } catch (error) {
      console.error("[Local Auth] Signup failed", error);
      return res.status(500).json({ error: "Signup failed" });
    }
  });

  /**
   * POST /api/auth/login
   * Login with email/password
   */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ 
        error: "Too many login attempts. Please try again in 15 minutes." 
      });
    }

    try {
      const { email, password } = req.body as LocalAuthCredentials;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Get user credentials
      const credentials = await db.getLocalAuthCredentialByEmail(email.toLowerCase());
      if (!credentials) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password
      const isValid = verifyPassword(password, credentials.salt, credentials.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Update user's last signed in timestamp
      await db.upsertUser({
        openId: credentials.openId,
        lastSignedIn: new Date(),
      });

      // Create session
      const user = await db.getUserByOpenId(credentials.openId);
      const sessionToken = await sdk.createSessionToken(credentials.openId, {
        name: user?.name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Reset rate limit on successful login
      resetRateLimit(clientIp);

      return res.status(200).json({
        success: true,
        message: "Login successful",
      });
    } catch (error) {
      console.error("[Local Auth] Login failed", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  /**
   * POST /api/auth/change-password
   * Change password for authenticated user
   */
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ 
        error: "Too many password change attempts. Please try again in 15 minutes." 
      });
    }

    try {
      // Authenticate the request
      const user = await sdk.authenticateRequest(req);
      
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      if (!isValidPassword(newPassword)) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      // Get current credentials
      const credentials = await db.getLocalAuthCredentialByOpenId(user.openId);
      if (!credentials) {
        return res.status(400).json({ error: "No local auth credentials found for this user" });
      }

      // Verify current password
      const isValid = verifyPassword(currentPassword, credentials.salt, credentials.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Generate new salt and hash
      const newSalt = generateSalt();
      const newPasswordHash = hashPassword(newPassword, newSalt);

      // Update credentials
      await db.updateLocalAuthCredential(user.openId, {
        passwordHash: newPasswordHash,
        salt: newSalt,
      });

      // Reset rate limit on successful password change
      resetRateLimit(clientIp);

      return res.status(200).json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("[Local Auth] Password change failed", error);
      // Check if this is an authentication error
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as Error).message;
        if (errorMessage.includes('session') || errorMessage.includes('Forbidden')) {
          return res.status(401).json({ error: "Authentication required" });
        }
      }
      return res.status(500).json({ error: "Password change failed" });
    }
  });
}

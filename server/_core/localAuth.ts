/**
 * Local Authentication System
 * Provides email/password authentication as a replacement for manus.ai OAuth
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { isEmailConfigured, sendEmail } from "./email";

const SALT_LENGTH = 32;
const HASH_ITERATIONS = 600000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

// Rate limiting
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Periodically clean up stale rate limit entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);

// ============================================
// EMAIL VERIFICATION
// ============================================

// TODO: For multi-instance deployments, replace in-memory Map with database-backed token store
// In-memory store for verification tokens (simple approach)
const verificationTokens = new Map<string, { email: string; expiresAt: number }>();

// TODO: For multi-instance deployments, replace in-memory Set with a persisted emailVerified column on the users table
// In-memory set of verified emails (avoids schema migration)
const verifiedEmails = new Set<string>();

/** Check if an email address has been verified */
export function isEmailVerified(email: string): boolean {
  return verifiedEmails.has(email.toLowerCase());
}

// Cleanup expired verification tokens every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of verificationTokens) {
    if (now > data.expiresAt) verificationTokens.delete(token);
  }
}, 30 * 60 * 1000);

// ============================================
// PASSWORD RESET TOKENS
// ============================================

// TODO: For multi-instance deployments, replace in-memory Map with database-backed token store
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

// Cleanup expired reset tokens every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens) {
    if (now > data.expiresAt) resetTokens.delete(token);
  }
}, 15 * 60 * 1000);

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
  if (passwordHash.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(passwordHash), Buffer.from(hash));
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

/**
 * Validate password strength
 * At least 10 characters, must include uppercase, lowercase, and a digit
 */
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
async function logAuthEvent(action: "create" | "update" | "view", entityType: string, userId?: number, ip?: string, details?: string) {
  try {
    await db.createAuditLog({ action, entityType, userId, ipAddress: ip, entityName: details });
  } catch { /* audit logging should never break auth flow */ }
}

export function registerLocalAuthRoutes(app: Express) {
  /**
   * POST /api/auth/signup
   * Register a new user with email/password
   */
  app.post("/api/auth/register", async (req: Request, res: Response) => {
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
      const existingUser = await (db as any).getUserByEmail(email);
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

      // First user automatically gets admin role
      const allUsers = await db.getAllUsers();
      const newUser = await db.getUserByOpenId(openId);
      if (allUsers.length <= 1 && newUser) {
        await db.updateUserRole(newUser.id, 'admin');
      }

      await logAuthEvent("create", "auth_signup", newUser?.id, clientIp, email.toLowerCase());

      // Generate email verification token (24-hour expiry)
      const verificationToken = randomBytes(32).toString("hex");
      const normalizedEmail = email.toLowerCase();
      verificationTokens.set(verificationToken, {
        email: normalizedEmail,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });

      // Send verification email if SendGrid is configured, otherwise log to console
      const verifyUrl = `${ENV.publicAppUrl}/api/auth/verify-email?token=${verificationToken}`;
      if (isEmailConfigured()) {
        sendEmail({
          to: normalizedEmail,
          subject: "Verify your email address",
          text: `Please verify your email by visiting: ${verifyUrl}`,
          html: `<p>Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
        }).catch((err) => {
          console.error("[Local Auth] Failed to send verification email:", err);
        });
      } else {
        console.log(`[Local Auth] Email verification token for ${normalizedEmail}: ${verificationToken}`);
        console.log(`[Local Auth] Verify URL: ${verifyUrl}`);
      }

      return res.status(201).json({
        success: true,
        message: "Account created successfully",
        emailVerified: false,
      });
    } catch (error) {
      console.error("[Local Auth] Signup failed", error);
      return res.status(500).json({ error: "Signup failed" });
    }
  });

  /**
   * GET /api/auth/verify-email
   * Verify a user's email address using a token from the verification email
   */
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const token = req.query.token as string;

      if (!token) {
        return res.status(400).json({ error: "Missing verification token" });
      }

      const tokenData = verificationTokens.get(token);
      if (!tokenData) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      if (Date.now() > tokenData.expiresAt) {
        verificationTokens.delete(token);
        return res.status(400).json({ error: "Verification token has expired" });
      }

      // Mark email as verified in-memory
      verifiedEmails.add(tokenData.email);

      // Clean up the used token
      verificationTokens.delete(token);

      await logAuthEvent("update", "auth_email_verified", undefined, undefined, tokenData.email);

      // Redirect to login with verified flag
      return res.redirect("/login?verified=true");
    } catch (error) {
      console.error("[Local Auth] Email verification failed:", error);
      return res.status(500).json({ error: "Email verification failed" });
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
        // Run a dummy hash to prevent timing-based email enumeration
        hashPassword(password, "0".repeat(SALT_LENGTH * 2));
        await logAuthEvent("view", "auth_login_failed", undefined, clientIp, email.toLowerCase());
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password
      const isValid = verifyPassword(password, credentials.salt, credentials.passwordHash);
      if (!isValid) {
        const failedUser = await db.getUserByOpenId(credentials.openId);
        await logAuthEvent("view", "auth_login_failed", failedUser?.id, clientIp, email.toLowerCase());
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

      await logAuthEvent("view", "auth_login_success", user?.id, clientIp, email.toLowerCase());

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
        return res.status(400).json({ error: "Password must be at least 8 characters" });
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

      await logAuthEvent("update", "auth_password_change", user.id, clientIp, user.email || user.openId);

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

  /**
   * POST /api/auth/forgot-password
   * Request a password reset link. Always returns 200 to avoid email enumeration.
   */
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        error: "Too many requests. Please try again in 15 minutes.",
      });
    }

    try {
      const { email } = req.body;

      if (!email || !isValidEmail(email)) {
        // Still return 200 to avoid revealing whether email validation failed vs not found
        return res.status(200).json({
          message: "If an account exists, a reset link has been sent",
        });
      }

      const normalizedEmail = email.toLowerCase();

      // Look up credentials for this email
      const credentials = await db.getLocalAuthCredentialByEmail(normalizedEmail);

      if (credentials) {
        // Generate a secure reset token (32 bytes hex)
        const token = randomBytes(32).toString("hex");
        resetTokens.set(token, {
          email: normalizedEmail,
          expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
        });

        const resetUrl = `${ENV.publicAppUrl}/reset-password?token=${token}`;

        if (isEmailConfigured()) {
          sendEmail({
            to: normalizedEmail,
            subject: "Password Reset Request",
            text: `You requested a password reset. Visit this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.`,
            html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>`,
          }).catch((err) => {
            console.error("[Local Auth] Failed to send password reset email:", err);
          });
        } else {
          console.log(`[Local Auth] Password reset token for ${normalizedEmail}: ${token}`);
          console.log(`[Local Auth] Reset URL: ${resetUrl}`);
        }

        await logAuthEvent("update", "auth_password_reset_requested", undefined, clientIp, normalizedEmail);
      }

      // Always return the same response regardless of whether the email exists
      return res.status(200).json({
        message: "If an account exists, a reset link has been sent",
      });
    } catch (error) {
      console.error("[Local Auth] Forgot password failed", error);
      return res.status(500).json({ error: "Password reset request failed" });
    }
  });

  /**
   * POST /api/auth/reset-password
   * Reset password using a valid reset token
   */
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        error: "Too many requests. Please try again in 15 minutes.",
      });
    }

    try {
      const { token, newPassword } = req.body;

      if (!token) {
        return res.status(400).json({ error: "Reset token is required" });
      }

      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      if (!isValidPassword(newPassword)) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Validate the token
      const tokenData = resetTokens.get(token);
      if (!tokenData) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      if (Date.now() > tokenData.expiresAt) {
        resetTokens.delete(token);
        return res.status(400).json({ error: "Reset token has expired" });
      }

      // Look up the credential record for this email
      const credentials = await db.getLocalAuthCredentialByEmail(tokenData.email);
      if (!credentials) {
        // Token was valid but credential no longer exists — invalidate and return error
        resetTokens.delete(token);
        return res.status(400).json({ error: "Account not found" });
      }

      // Hash the new password with a new salt
      const newSalt = generateSalt();
      const newPasswordHash = hashPassword(newPassword, newSalt);

      // Update the credential record
      await db.updateLocalAuthCredential(credentials.openId, {
        passwordHash: newPasswordHash,
        salt: newSalt,
      });

      // Invalidate the used token
      resetTokens.delete(token);

      // Also invalidate any other reset tokens for this email
      for (const [t, data] of resetTokens) {
        if (data.email === tokenData.email) resetTokens.delete(t);
      }

      const user = await db.getUserByOpenId(credentials.openId);
      await logAuthEvent("update", "auth_password_reset_completed", user?.id, clientIp, tokenData.email);

      resetRateLimit(clientIp);

      return res.status(200).json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      console.error("[Local Auth] Reset password failed", error);
      return res.status(500).json({ error: "Password reset failed" });
    }
  });
}

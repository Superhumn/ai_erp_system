/**
 * Local Authentication System
 * Provides email/password authentication as a replacement for manus.ai OAuth
 */

import { pbkdf2Sync, randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const SALT_LENGTH = 32;
const HASH_ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt && now > attempt.resetAt) loginAttempts.delete(ip);
  const current = loginAttempts.get(ip);
  if (!current) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_LOGIN_ATTEMPTS) return false;
  current.count++;
  return true;
}

function resetRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
}

function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  return hashPassword(password, salt) === hash;
}

async function generateLocalOpenId(): Promise<string> {
  const { nanoid } = await import("nanoid");
  return `local_${nanoid(21)}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export interface LocalAuthCredentials {
  email: string;
  password: string;
  name?: string;
}

export function registerLocalAuthRoutes(app: Express) {
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: "Too many signup attempts. Please try again in 15 minutes." });
    }
    try {
      const { email, password, name } = req.body as LocalAuthCredentials;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
      if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email format" });
      if (!isValidPassword(password)) return res.status(400).json({ error: "Password must be at least 8 characters" });
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) return res.status(409).json({ error: "User with this email already exists" });
      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      const openId = await generateLocalOpenId();
      await db.createLocalAuthCredential({ openId, email: email.toLowerCase(), passwordHash, salt });
      await db.upsertUser({ openId, name: name || email.split("@")[0], email: email.toLowerCase(), loginMethod: "email", lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(openId, { name: name || email.split("@")[0], expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      resetRateLimit(clientIp);
      return res.status(201).json({ success: true, message: "Account created successfully" });
    } catch (error) {
      console.error("[Local Auth] Signup failed", error);
      return res.status(500).json({ error: "Signup failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: "Too many login attempts. Please try again in 15 minutes." });
    }
    try {
      const { email, password } = req.body as LocalAuthCredentials;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
      const credentials = await db.getLocalAuthCredentialByEmail(email.toLowerCase());
      if (!credentials) return res.status(401).json({ error: "Invalid email or password" });
      const isValid = verifyPassword(password, credentials.salt, credentials.passwordHash);
      if (!isValid) return res.status(401).json({ error: "Invalid email or password" });
      await db.upsertUser({ openId: credentials.openId, lastSignedIn: new Date() });
      const user = await db.getUserByOpenId(credentials.openId);
      const sessionToken = await sdk.createSessionToken(credentials.openId, { name: user?.name || email.split("@")[0], expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      resetRateLimit(clientIp);
      return res.status(200).json({ success: true, message: "Login successful" });
    } catch (error) {
      console.error("[Local Auth] Login failed", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: "Too many password change attempts. Please try again in 15 minutes." });
    }
    try {
      const user = await sdk.authenticateRequest(req);
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current password and new password are required" });
      if (!isValidPassword(newPassword)) return res.status(400).json({ error: "New password must be at least 8 characters" });
      const credentials = await db.getLocalAuthCredentialByOpenId(user.openId);
      if (!credentials) return res.status(400).json({ error: "No local auth credentials found for this user" });
      const isValid = verifyPassword(currentPassword, credentials.salt, credentials.passwordHash);
      if (!isValid) return res.status(401).json({ error: "Current password is incorrect" });
      const newSalt = generateSalt();
      const newPasswordHash = hashPassword(newPassword, newSalt);
      await db.updateLocalAuthCredential(user.openId, { passwordHash: newPasswordHash, salt: newSalt });
      resetRateLimit(clientIp);
      return res.status(200).json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      console.error("[Local Auth] Password change failed", error);
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

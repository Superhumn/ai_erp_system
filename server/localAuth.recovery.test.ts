/**
 * Auth recovery path tests — exercises register/forgot/reset against mocked db
 * so we can cover the orphaned-user (user row, no credentials) failure mode
 * without a live MySQL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getLocalAuthCredentialByEmail: vi.fn(),
  getLocalAuthCredentialByOpenId: vi.fn(),
  createLocalAuthCredential: vi.fn(),
  updateLocalAuthCredential: vi.fn(),
  upsertUser: vi.fn(),
  getAllUsers: vi.fn(),
  getUserByOpenId: vi.fn(),
  updateUserRole: vi.fn(),
  createAuditLog: vi.fn(),
  createAuthToken: vi.fn(),
  getAuthToken: vi.fn(),
  deleteAuthToken: vi.fn(),
  deleteAuthTokensByEmail: vi.fn(),
  setUserEmailVerified: vi.fn(),
  getTeamInviteByToken: vi.fn(),
  updateTeamInvite: vi.fn(),
  updateStakeholder: vi.fn(),
  isUserEmailVerified: vi.fn(),
  deleteExpiredAuthTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("session-token"),
    authenticateRequest: vi.fn(),
  },
}));

vi.mock("./_core/email", () => ({
  isEmailConfigured: vi.fn().mockReturnValue(false),
  sendEmail: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    publicAppUrl: "http://localhost:3000",
    isProduction: false,
  },
}));

import * as db from "./db";
import { registerLocalAuthRoutes } from "./_core/localAuth";

async function startApp() {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  const server = await new Promise<import("http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe("local auth recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("register points orphaned users (user, no credentials) at forgot-password", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: 7,
      openId: "local_orphan",
      email: "orphan@example.com",
      name: "Orphan",
    } as any);
    vi.mocked(db.getLocalAuthCredentialByEmail).mockResolvedValue(undefined);

    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "orphan@example.com",
          password: "password123",
          name: "Orphan",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.recovery).toBe("reset_password");
      expect(body.error).toMatch(/Forgot password/i);
      expect(db.createLocalAuthCredential).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("forgot-password issues a token when user exists without credentials", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: 7,
      openId: "local_orphan",
      email: "orphan@example.com",
    } as any);
    vi.mocked(db.createAuthToken).mockResolvedValue(undefined as any);

    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "orphan@example.com" }),
      });
      expect(res.status).toBe(200);
      expect(db.createAuthToken).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "password_reset",
          email: "orphan@example.com",
        })
      );
    } finally {
      await close();
    }
  });

  it("reset-password creates credentials when missing", async () => {
    vi.mocked(db.getAuthToken).mockResolvedValue({
      token: "reset-token",
      type: "password_reset",
      email: "orphan@example.com",
      expiresAt: new Date(Date.now() + 60_000),
    } as any);
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: 7,
      openId: "local_orphan",
      email: "orphan@example.com",
    } as any);
    vi.mocked(db.getLocalAuthCredentialByOpenId).mockResolvedValue(undefined);
    vi.mocked(db.createLocalAuthCredential).mockResolvedValue(undefined as any);
    vi.mocked(db.deleteAuthTokensByEmail).mockResolvedValue(undefined as any);

    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "reset-token",
          newPassword: "newpassword1",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(db.createLocalAuthCredential).toHaveBeenCalledWith(
        expect.objectContaining({
          openId: "local_orphan",
          email: "orphan@example.com",
        })
      );
      expect(db.updateLocalAuthCredential).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("login refuses when credential has no matching user row", async () => {
    vi.mocked(db.getLocalAuthCredentialByEmail).mockResolvedValue({
      openId: "local_ghost",
      email: "ghost@example.com",
      salt: "ab".repeat(32),
      passwordHash: "cd".repeat(64),
    } as any);
    // verifyPassword will fail on the fake hash — stub by making verify succeed
    // via a real hash instead:
    const { hashPassword, generateSalt } = await import("./_core/passwordHash");
    const salt = generateSalt();
    const passwordHash = await hashPassword("password123", salt);
    vi.mocked(db.getLocalAuthCredentialByEmail).mockResolvedValue({
      openId: "local_ghost",
      email: "ghost@example.com",
      salt,
      passwordHash,
    } as any);
    vi.mocked(db.upsertUser).mockResolvedValue(undefined as any);
    vi.mocked(db.getUserByOpenId).mockResolvedValue(undefined);

    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "ghost@example.com",
          password: "password123",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body.recovery).toBe("reset_password");
    } finally {
      await close();
    }
  });
});

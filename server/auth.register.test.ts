import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getLocalAuthCredentialByEmail: vi.fn(),
  createLocalAuthCredential: vi.fn(),
  upsertUser: vi.fn(),
  getAllUsers: vi.fn(),
  getUserByOpenId: vi.fn(),
  updateUserRole: vi.fn(),
  createAuditLog: vi.fn(),
  getTeamInviteByToken: vi.fn(),
  updateTeamInvite: vi.fn(),
  updateStakeholder: vi.fn(),
  setUserEmailVerified: vi.fn(),
  createAuthToken: vi.fn(),
  deleteExpiredAuthTokens: vi.fn().mockResolvedValue(undefined),
  isUserEmailVerified: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("test-session-token"),
  },
}));

vi.mock("./_core/cookies", () => ({
  getSessionCookieOptions: () => ({
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: false,
  }),
}));

vi.mock("./_core/email", () => ({
  isEmailConfigured: () => false,
  sendEmail: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    publicAppUrl: "http://localhost:3000",
    appId: "ai_erp_system",
    cookieSecret: "dev-only-jwt-secret-not-for-production-use!!",
    isProduction: false,
  },
}));

import * as db from "./db";
import { registerLocalAuthRoutes } from "./_core/localAuth";

async function withServer(
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  const server = await new Promise<import("http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(db.getLocalAuthCredentialByEmail).mockResolvedValue(undefined);
    vi.mocked(db.createLocalAuthCredential).mockResolvedValue(undefined);
    vi.mocked(db.upsertUser).mockResolvedValue(undefined);
    vi.mocked(db.getAllUsers).mockResolvedValue([]);
    vi.mocked(db.getUserByOpenId).mockResolvedValue({
      id: 1,
      openId: "local_test",
      email: "new@example.com",
      name: "New",
      role: "user",
    } as any);
    vi.mocked(db.createAuthToken).mockResolvedValue(undefined);
  });

  it("creates an account and returns 201", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: "new@example.com",
          password: "password123",
          name: "New User",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(db.createLocalAuthCredential).toHaveBeenCalled();
      expect(db.upsertUser).toHaveBeenCalled();
      expect(db.createAuthToken).toHaveBeenCalled();
    });
  });

  it("still returns 201 when verification-token persistence fails", async () => {
    vi.mocked(db.createAuthToken).mockRejectedValue(
      new Error("Table 'authTokens' doesn't exist")
    );

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: "softfail@example.com",
          password: "password123",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.emailVerified).toBe(false);
    });
  });

  it("returns 409 when credentials already exist for the email", async () => {
    vi.mocked(db.getLocalAuthCredentialByEmail).mockResolvedValue({
      openId: "local_taken",
      email: "taken@example.com",
    } as any);

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: "taken@example.com",
          password: "password123",
        }),
      });
      expect(res.status).toBe(409);
      expect(db.createLocalAuthCredential).not.toHaveBeenCalled();
    });
  });

  it("returns 409 with recovery when user exists without credentials", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: 9,
      email: "orphan@example.com",
    } as any);
    vi.mocked(db.getLocalAuthCredentialByEmail).mockResolvedValue(undefined);

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: "orphan@example.com",
          password: "password123",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.recovery).toBe("reset_password");
      expect(db.createLocalAuthCredential).not.toHaveBeenCalled();
    });
  });
});

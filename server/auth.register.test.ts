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
  getEmployeesByEmail: vi.fn(),
  getEmployeeById: vi.fn(),
  getEmployeeByUserId: vi.fn(),
  getUserById: vi.fn(),
  setEmployeeUserIdIfUnlinked: vi.fn(),
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

  describe("with an invite token for an employee", () => {
    const invite = {
      id: 3,
      email: "new@example.com",
      role: "user",
      status: "pending",
      token: "tok",
      linkedStakeholderId: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const employee = {
      id: 5, companyId: 1, userId: null, firstName: "New", lastName: "Hire",
      email: "NEW@example.com", personalEmail: null,
    };
    const signup = (baseUrl: string) =>
      fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "new@example.com", password: "password123", invite: "tok" }),
      });

    beforeEach(() => {
      vi.mocked(db.getTeamInviteByToken).mockResolvedValue(invite as any);
      vi.mocked(db.getEmployeesByEmail).mockResolvedValue([employee] as any);
      vi.mocked(db.getEmployeeById).mockResolvedValue(employee as any);
      vi.mocked(db.getEmployeeByUserId).mockResolvedValue(undefined);
      vi.mocked(db.getUserById).mockResolvedValue({ id: 1, email: "new@example.com", role: "user", companyId: null } as any);
      vi.mocked(db.setEmployeeUserIdIfUnlinked).mockResolvedValue(true);
    });

    it("accepts the invite and links the new login to the employee with the invite email", async () => {
      await withServer(async (baseUrl) => {
        const res = await signup(baseUrl);
        const body = await res.json();
        expect(res.status).toBe(201);
        expect(body.emailVerified).toBe(true);
        expect(db.updateTeamInvite).toHaveBeenCalledWith(3, expect.objectContaining({ status: "accepted" }));
        expect(db.getEmployeesByEmail).toHaveBeenCalledWith("new@example.com");
        expect(db.setEmployeeUserIdIfUnlinked).toHaveBeenCalledWith(5, 1);
        expect(db.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ entityType: "employee", entityId: 5, newValues: { userId: 1 } })
        );
      });
    });

    it("does not link over an existing link, and a link failure never fails the signup", async () => {
      vi.mocked(db.getEmployeesByEmail).mockResolvedValueOnce([{ ...employee, userId: 77 }] as any);
      await withServer(async (baseUrl) => {
        const res = await signup(baseUrl);
        expect(res.status).toBe(201);
        expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
      });

      vi.mocked(db.getEmployeesByEmail).mockRejectedValueOnce(new Error("Table 'employees' doesn't exist"));
      await withServer(async (baseUrl) => {
        const res = await signup(baseUrl);
        const body = await res.json();
        expect(res.status).toBe(201);
        expect(body).toMatchObject({ success: true, emailVerified: true });
        expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
      });
    });

    it("refuses an invite token redeemed with a different email, before creating anything", async () => {
      await withServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
          body: JSON.stringify({ email: "attacker@evil.example", password: "password123", invite: "tok" }),
        });
        expect(res.status).toBe(403);
        expect(db.updateUserRole).not.toHaveBeenCalled();
        expect(db.updateTeamInvite).not.toHaveBeenCalled();
        expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
      });
    });

    it("matches the invite email case-insensitively", async () => {
      vi.mocked(db.getTeamInviteByToken).mockResolvedValue({ ...invite, email: "New@Example.com" } as any);
      await withServer(async (baseUrl) => {
        const res = await signup(baseUrl);
        expect(res.status).toBe(201);
        expect(db.updateTeamInvite).toHaveBeenCalledWith(3, expect.objectContaining({ status: "accepted" }));
      });
    });
  });
});

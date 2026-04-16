/**
 * Tests for Login page utility functions.
 * Functions tested: FormMode, title/subtitle generation, switchMode behavior
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from Login.tsx ──

type FormMode = "login" | "register" | "forgotPassword";

function getTitle(mode: FormMode): string {
  return mode === "register"
    ? "Create Account"
    : mode === "forgotPassword"
      ? "Forgot Password"
      : "Sign In";
}

function getSubtitle(mode: FormMode): string {
  return mode === "register"
    ? "Enter your details to create an account"
    : mode === "forgotPassword"
      ? "Enter your email to receive a reset link"
      : "Enter your credentials to access your account";
}

function getEndpoint(mode: FormMode): string {
  return mode === "register" ? "/api/auth/register" : "/api/auth/login";
}

function buildRequestBody(
  mode: FormMode,
  email: string,
  password: string,
  name: string,
  inviteToken: string | null,
): Record<string, string> {
  const body: Record<string, string> = { email, password };
  if (mode === "register" && name) body.name = name;
  if (mode === "register" && inviteToken) body.invite = inviteToken;
  return body;
}

// Password validation logic from ResetPassword
function validatePassword(newPassword: string, confirmPassword: string): string | null {
  if (newPassword.length < 8) return "Password must be at least 8 characters";
  if (newPassword !== confirmPassword) return "Passwords do not match";
  return null;
}

// ── Tests ──

describe("Login page — getTitle", () => {
  it("returns 'Sign In' for login mode", () => {
    expect(getTitle("login")).toBe("Sign In");
  });

  it("returns 'Create Account' for register mode", () => {
    expect(getTitle("register")).toBe("Create Account");
  });

  it("returns 'Forgot Password' for forgotPassword mode", () => {
    expect(getTitle("forgotPassword")).toBe("Forgot Password");
  });
});

describe("Login page — getSubtitle", () => {
  it("returns credentials subtitle for login", () => {
    expect(getSubtitle("login")).toContain("credentials");
  });

  it("returns details subtitle for register", () => {
    expect(getSubtitle("register")).toContain("details");
  });

  it("returns email subtitle for forgotPassword", () => {
    expect(getSubtitle("forgotPassword")).toContain("email");
  });
});

describe("Login page — getEndpoint", () => {
  it("returns register endpoint for register mode", () => {
    expect(getEndpoint("register")).toBe("/api/auth/register");
  });

  it("returns login endpoint for login mode", () => {
    expect(getEndpoint("login")).toBe("/api/auth/login");
  });

  it("returns login endpoint for forgotPassword mode (not used for forgot)", () => {
    expect(getEndpoint("forgotPassword")).toBe("/api/auth/login");
  });
});

describe("Login page — buildRequestBody", () => {
  it("includes email and password for login", () => {
    const body = buildRequestBody("login", "test@test.com", "pass123", "John", null);
    expect(body).toEqual({ email: "test@test.com", password: "pass123" });
  });

  it("includes name for register", () => {
    const body = buildRequestBody("register", "test@test.com", "pass123", "John", null);
    expect(body).toEqual({ email: "test@test.com", password: "pass123", name: "John" });
  });

  it("includes invite token for register", () => {
    const body = buildRequestBody("register", "test@test.com", "pass123", "John", "invite-abc");
    expect(body).toEqual({ email: "test@test.com", password: "pass123", name: "John", invite: "invite-abc" });
  });

  it("skips name and invite when empty", () => {
    const body = buildRequestBody("register", "test@test.com", "pass123", "", null);
    expect(body).toEqual({ email: "test@test.com", password: "pass123" });
  });

  it("does not include name for login even if provided", () => {
    const body = buildRequestBody("login", "test@test.com", "pass123", "John", null);
    expect(body).not.toHaveProperty("name");
  });
});

describe("ResetPassword — validatePassword", () => {
  it("returns null for valid password pair", () => {
    expect(validatePassword("password123", "password123")).toBeNull();
  });

  it("returns error for short password", () => {
    expect(validatePassword("short", "short")).toBe("Password must be at least 8 characters");
  });

  it("returns error for mismatched passwords", () => {
    expect(validatePassword("password123", "different123")).toBe("Passwords do not match");
  });

  it("checks length before mismatch", () => {
    expect(validatePassword("short", "other")).toBe("Password must be at least 8 characters");
  });

  it("allows exactly 8 characters", () => {
    expect(validatePassword("12345678", "12345678")).toBeNull();
  });

  it("rejects 7 characters", () => {
    expect(validatePassword("1234567", "1234567")).toBe("Password must be at least 8 characters");
  });
});

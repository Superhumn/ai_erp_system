import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./routers/middleware", () => ({ getValidGoogleToken: vi.fn() }));

import { escapeDriveQueryValue } from "./aiAgentService";

describe("escapeDriveQueryValue", () => {
  it("escapes quotes and backslashes so a search term cannot break out of the literal", () => {
    expect(escapeDriveQueryValue("O'Brien")).toBe("O\\'Brien");
    expect(escapeDriveQueryValue("a\\b")).toBe("a\\\\b");
    // A trailing backslash followed by a quote must not leave the quote unescaped.
    expect(escapeDriveQueryValue("x\\'")).toBe("x\\\\\\'");
  });
});

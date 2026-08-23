import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The allowlist is derived from storage config, so the module under test needs
// ENV stubbed before it loads.
vi.mock("./_core/env", () => ({
  ENV: {
    get r2PublicUrl() {
      return process.env.__TEST_R2_PUBLIC_URL ?? "";
    },
    get r2AccountId() {
      return process.env.__TEST_R2_ACCOUNT_ID ?? "";
    },
  },
}));

import {
  assertFetchableAttachmentUrl,
  isFetchableAttachmentUrl,
  allowedAttachmentHosts,
  UnsafeAttachmentUrlError,
} from "./attachmentUrl";

const PUBLIC = "https://files.example-erp.com";
const ACCOUNT = "abc123";

beforeEach(() => {
  process.env.__TEST_R2_PUBLIC_URL = PUBLIC;
  process.env.__TEST_R2_ACCOUNT_ID = ACCOUNT;
});

afterEach(() => {
  delete process.env.__TEST_R2_PUBLIC_URL;
  delete process.env.__TEST_R2_ACCOUNT_ID;
});

describe("allowedAttachmentHosts", () => {
  it("includes the public storage host and the account endpoint", () => {
    expect(allowedAttachmentHosts()).toEqual([
      "files.example-erp.com",
      "abc123.r2.cloudflarestorage.com",
    ]);
  });

  it("ignores a malformed public URL rather than widening the allowlist", () => {
    process.env.__TEST_R2_PUBLIC_URL = "not a url";
    expect(allowedAttachmentHosts()).toEqual(["abc123.r2.cloudflarestorage.com"]);
  });

  it("is empty when storage is unconfigured", () => {
    process.env.__TEST_R2_PUBLIC_URL = "";
    process.env.__TEST_R2_ACCOUNT_ID = "";
    expect(allowedAttachmentHosts()).toEqual([]);
  });
});

describe("assertFetchableAttachmentUrl", () => {
  it("accepts a data: URL from the inbound-mail path", () => {
    const url = "data:application/pdf;base64,JVBERi0=";
    expect(assertFetchableAttachmentUrl(url)).toBe(url);
  });

  it("accepts a URL on the configured public storage host", () => {
    const url = `${PUBLIC}/quotes/rate-sheet.pdf`;
    expect(assertFetchableAttachmentUrl(url)).toBe(url);
  });

  it("accepts a presigned URL on the account endpoint", () => {
    const url = `https://${ACCOUNT}.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=abc`;
    expect(assertFetchableAttachmentUrl(url)).toBe(url);
  });

  it("rejects cloud metadata", () => {
    expect(() =>
      assertFetchableAttachmentUrl("http://169.254.169.254/latest/meta-data/iam/"),
    ).toThrow(UnsafeAttachmentUrlError);
  });

  it("rejects localhost and private network hosts", () => {
    for (const url of [
      "http://localhost:8080/secret",
      "http://127.0.0.1/admin",
      "http://10.0.0.5/internal",
      "http://192.168.1.1/router",
    ]) {
      expect(() => assertFetchableAttachmentUrl(url)).toThrow(UnsafeAttachmentUrlError);
    }
  });

  it("rejects an arbitrary external host", () => {
    expect(() => assertFetchableAttachmentUrl("https://evil.example.com/payload.pdf")).toThrow(
      /not an allowed storage host/,
    );
  });

  it("rejects a host that merely embeds an allowed one", () => {
    // Suffix matching would let this through; the check is exact.
    expect(() =>
      assertFetchableAttachmentUrl("https://files.example-erp.com.evil.test/x.pdf"),
    ).toThrow(UnsafeAttachmentUrlError);
    expect(() =>
      assertFetchableAttachmentUrl("https://evil-files.example-erp.com/x.pdf"),
    ).toThrow(UnsafeAttachmentUrlError);
  });

  it("rejects non-http schemes", () => {
    expect(() => assertFetchableAttachmentUrl("file:///etc/passwd")).toThrow(/scheme/);
    expect(() => assertFetchableAttachmentUrl("ftp://files.example-erp.com/x")).toThrow(/scheme/);
  });

  it("rejects empty and malformed URLs", () => {
    expect(() => assertFetchableAttachmentUrl("")).toThrow(/empty/);
    expect(() => assertFetchableAttachmentUrl("   ")).toThrow(/empty/);
    expect(() => assertFetchableAttachmentUrl("http://")).toThrow(UnsafeAttachmentUrlError);
  });

  it("refuses every remote URL when storage is unconfigured", () => {
    process.env.__TEST_R2_PUBLIC_URL = "";
    process.env.__TEST_R2_ACCOUNT_ID = "";
    expect(() => assertFetchableAttachmentUrl("https://files.example-erp.com/x.pdf")).toThrow(
      /No object storage is configured/,
    );
    // data: URLs still work — they never leave the process.
    expect(assertFetchableAttachmentUrl("data:text/csv;base64,YQ==")).toBeTruthy();
  });

  it("is case-insensitive on the host", () => {
    expect(assertFetchableAttachmentUrl(`https://FILES.EXAMPLE-ERP.COM/x.pdf`)).toBeTruthy();
  });
});

describe("isFetchableAttachmentUrl", () => {
  it("returns a boolean instead of throwing", () => {
    expect(isFetchableAttachmentUrl(`${PUBLIC}/a.pdf`)).toBe(true);
    expect(isFetchableAttachmentUrl("http://169.254.169.254/")).toBe(false);
  });
});

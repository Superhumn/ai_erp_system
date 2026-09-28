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
  fetchAttachment,
  decodeDataUrl,
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

describe("fetchAttachment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes base64 and percent-encoded data URLs without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const b64 = await fetchAttachment(`data:text/csv;base64,${Buffer.from("a,b").toString("base64")}`);
    expect(b64.buffer.toString("utf8")).toBe("a,b");
    expect(b64.contentType).toBe("text/csv");
    const plain = decodeDataUrl("data:text/plain,hello%20world");
    expect(plain.buffer.toString("utf8")).toBe("hello world");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rebuilds the remote URL from the configured storage host, never the caller's string", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === "content-type" ? "application/pdf" : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await fetchAttachment(`${PUBLIC}/uploads/doc.pdf?x=1`);
    expect(fetchSpy).toHaveBeenCalledWith("https://files.example-erp.com/uploads/doc.pdf?x=1");
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(result.contentType).toBe("application/pdf");
  });

  it("refuses hosts outside the allowlist before any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAttachment("https://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(UnsafeAttachmentUrlError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enforces the byte limit from Content-Length and from the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === "content-length" ? "999" : null) },
      arrayBuffer: async () => new Uint8Array(10).buffer,
    })));
    await expect(fetchAttachment(`${PUBLIC}/big.bin`, { maxBytes: 100 })).rejects.toThrow(/exceeds/);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new Uint8Array(200).buffer,
    })));
    await expect(fetchAttachment(`${PUBLIC}/big.bin`, { maxBytes: 100 })).rejects.toThrow(/exceeds/);
    await expect(fetchAttachment(`data:text/plain,${"x".repeat(200)}`, { maxBytes: 100 })).rejects.toThrow(/exceeds/);
  });
});

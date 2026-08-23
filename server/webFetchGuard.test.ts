import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: any[]) => lookupMock(...args) }));

import {
  checkPublicUrl,
  isBlockedAddress,
  safeFetchHtml,
  BlockedUrlError,
  type RawHttpResponse,
  type RequestFn,
} from "./webFetchGuard";

beforeEach(() => {
  lookupMock.mockReset();
  // Default: hosts resolve to a public address unless a test says otherwise.
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isBlockedAddress — IPv4", () => {
  it.each([
    ["169.254.169.254", "cloud metadata"],
    ["127.0.0.1", "loopback"],
    ["10.0.0.5", "private /8"],
    ["172.16.0.1", "private /12 low"],
    ["172.31.255.254", "private /12 high"],
    ["192.168.1.1", "private /16"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "this network"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["192.88.99.1", "6to4 relay anycast"],
    ["198.18.0.1", "benchmarking /15 low"],
    ["198.19.255.254", "benchmarking /15 high"],
    ["198.51.100.7", "TEST-NET-2"],
    ["203.0.113.7", "TEST-NET-3"],
    ["192.0.2.7", "TEST-NET-1"],
  ])("blocks %s (%s)", ip => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows ordinary public addresses", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    // Just outside the private /12 on both sides.
    expect(isBlockedAddress("172.15.0.1")).toBe(false);
    expect(isBlockedAddress("172.32.0.1")).toBe(false);
  });
});

describe("isBlockedAddress — IPv6", () => {
  it.each([
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fe80::1", "link-local"],
    ["fd00::1", "unique local"],
    ["fc00::1", "unique local"],
    ["ff02::1", "multicast"],
    ["::ffff:10.0.0.1", "v4-mapped private, dotted"],
    ["::ffff:a00:1", "v4-mapped private, hex groups"],
    ["0:0:0:0:0:0:0:1", "loopback written long-hand"],
    ["64:ff9b::1", "NAT64"],
    ["2001:db8::1", "documentation"],
    ["2001:0db8:0:0:0:0:0:1", "documentation, long-hand"],
    ["2001::1", "Teredo"],
    ["2002:0a00:0001::", "6to4 wrapping 10.0.0.1"],
    ["100::1", "discard-only"],
    ["FE80::1", "link-local, uppercase"],
  ])("blocks %s (%s)", ip => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows a public v6 address", () => {
    expect(isBlockedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("allows 6to4 wrapping a public v4 address", () => {
    // 2002:5db8:d822:: wraps 93.184.216.34, which is fine.
    expect(isBlockedAddress("2002:5db8:d822::")).toBe(false);
  });

  it("allows a 2001: address that is not Teredo or documentation", () => {
    expect(isBlockedAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("blocks anything that is not an IP at all", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });
});

describe("checkPublicUrl — scheme and shape", () => {
  it("accepts http and https", async () => {
    await expect(checkPublicUrl("https://example.com/")).resolves.toMatchObject({
      address: "93.184.216.34",
    });
    await expect(checkPublicUrl("http://example.com/")).resolves.toBeTruthy();
  });

  it.each(["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com", "data:text/html,x"])(
    "rejects %s",
    async url => {
      await expect(checkPublicUrl(url)).rejects.toThrow(BlockedUrlError);
    },
  );

  it("rejects credentials embedded in the URL", async () => {
    // https://user:pass@evil.test can read as a trusted host at a glance.
    await expect(checkPublicUrl("https://user:pass@example.com/")).rejects.toThrow(/credentials/);
  });

  it("rejects a malformed URL", async () => {
    await expect(checkPublicUrl("not a url")).rejects.toThrow(BlockedUrlError);
  });
});

describe("checkPublicUrl — DNS resolution", () => {
  it("blocks a public-looking host that resolves to a private address", async () => {
    // The reason hostname allowlisting is not enough on its own.
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(checkPublicUrl("https://internal.example.com/")).rejects.toThrow(
      /private or reserved/,
    );
  });

  it("blocks a host that resolves to metadata", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(checkPublicUrl("https://metadata.example.com/")).rejects.toThrow(
      /private or reserved/,
    );
  });

  it("blocks when any one of several addresses is private", async () => {
    // A split-horizon host must not be reachable via its public record.
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.10", family: 4 },
    ]);
    await expect(checkPublicUrl("https://mixed.example.com/")).rejects.toThrow(/192\.168\.1\.10/);
  });

  it("blocks a host that resolves to nothing", async () => {
    lookupMock.mockResolvedValue([]);
    await expect(checkPublicUrl("https://void.example.com/")).rejects.toThrow(/no addresses/);
  });

  it("blocks when resolution fails", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(checkPublicUrl("https://nope.example.com/")).rejects.toThrow(/Could not resolve/);
  });

  it("checks a literal IP without any DNS lookup", async () => {
    await expect(checkPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /private or reserved/,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("accepts a literal public IP", async () => {
    await expect(checkPublicUrl("https://93.184.216.34/")).resolves.toMatchObject({
      address: "93.184.216.34",
    });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("handles a bracketed IPv6 literal", async () => {
    await expect(checkPublicUrl("http://[::1]/")).rejects.toThrow(/private or reserved/);
  });
});

// ─── safeFetchHtml: redirects, size and content-type ───────────────────
//
// The transport is injected so the hop-by-hop re-checking can be exercised
// without a network. `checkPublicUrl` still runs for real on every hop — the
// DNS mock above is what decides whether a hop is public.

function bodyOf(text: string): AsyncIterable<Uint8Array> {
  return (async function* () {
    yield new TextEncoder().encode(text);
  })();
}

function scriptedRequest(
  pages: Record<string, Partial<RawHttpResponse> & { text?: string }>,
): { request: RequestFn; visited: string[] } {
  const visited: string[] = [];
  const request: RequestFn = async checked => {
    const url = checked.url.toString();
    visited.push(url);
    const page = pages[url];
    if (!page) throw new Error(`no scripted response for ${url}`);
    return {
      status: page.status ?? 200,
      headers: page.headers ?? { "content-type": "text/html" },
      body: page.body ?? bodyOf(page.text ?? ""),
    };
  };
  return { request, visited };
}

describe("safeFetchHtml — redirects", () => {
  it("follows a redirect chain and reports the final URL", async () => {
    const { request, visited } = scriptedRequest({
      "https://example.com/": {
        status: 301,
        headers: { location: "https://example.com/en/", "content-type": "text/html" },
      },
      "https://example.com/en/": { text: "<html>hello</html>" },
    });
    const result = await safeFetchHtml("https://example.com/", { request });
    expect(result.body).toContain("hello");
    expect(result.finalUrl).toBe("https://example.com/en/");
    expect(result.redirects).toEqual(["https://example.com/en/"]);
    expect(visited).toHaveLength(2);
  });

  it("resolves a relative Location against the current URL", async () => {
    const { request } = scriptedRequest({
      "https://example.com/a/b": {
        status: 302,
        headers: { location: "../c", "content-type": "text/html" },
      },
      "https://example.com/c": { text: "ok" },
    });
    const result = await safeFetchHtml("https://example.com/a/b", { request });
    expect(result.finalUrl).toBe("https://example.com/c");
  });

  it("refuses a redirect into a private range — the classic bypass", async () => {
    // The first hop is public; the second resolves to link-local metadata.
    lookupMock.mockImplementation(async (host: string) =>
      host === "metadata.example.com"
        ? [{ address: "169.254.169.254", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }],
    );
    const { request, visited } = scriptedRequest({
      "https://example.com/": {
        status: 302,
        headers: { location: "https://metadata.example.com/latest/meta-data/" },
      },
    });
    await expect(safeFetchHtml("https://example.com/", { request })).rejects.toThrow(
      /private or reserved/,
    );
    // The blocked hop was never requested — it was refused before the connect.
    expect(visited).toEqual(["https://example.com/"]);
  });

  it("refuses a redirect to a literal private address", async () => {
    const { request } = scriptedRequest({
      "https://example.com/": {
        status: 307,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      },
    });
    await expect(safeFetchHtml("https://example.com/", { request })).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it("refuses a redirect to a non-http scheme", async () => {
    const { request } = scriptedRequest({
      "https://example.com/": { status: 302, headers: { location: "file:///etc/passwd" } },
    });
    await expect(safeFetchHtml("https://example.com/", { request })).rejects.toThrow(
      /not allowed/,
    );
  });

  it("gives up on a redirect loop rather than following it forever", async () => {
    const request: RequestFn = async () => ({
      status: 302,
      headers: { location: "https://example.com/loop" },
      body: bodyOf(""),
    });
    await expect(safeFetchHtml("https://example.com/loop", { request })).rejects.toThrow(
      /Too many redirects/,
    );
  });

  it("returns the redirect itself when there is no Location header", async () => {
    const { request } = scriptedRequest({
      "https://example.com/": { status: 302, headers: {} },
    });
    const result = await safeFetchHtml("https://example.com/", { request });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(302);
  });
});

describe("safeFetchHtml — body handling", () => {
  it("refuses a non-text content type without reading it", async () => {
    const { request } = scriptedRequest({
      "https://example.com/": {
        headers: { "content-type": "application/pdf" },
        text: "%PDF-1.7 ...",
      },
    });
    const result = await safeFetchHtml("https://example.com/", { request });
    expect(result.ok).toBe(false);
    expect(result.body).toBe("");
  });

  it("refuses a body whose declared length is over the cap", async () => {
    const { request } = scriptedRequest({
      "https://example.com/": {
        headers: { "content-type": "text/html", "content-length": "999999" },
        text: "<html>big</html>",
      },
    });
    const result = await safeFetchHtml("https://example.com/", { request, maxBytes: 100 });
    expect(result.truncated).toBe(true);
    expect(result.body).toBe("");
  });

  it("truncates a body that lies about its length", async () => {
    // No content-length, so the cap has to hold while streaming.
    const { request } = scriptedRequest({
      "https://example.com/": {
        headers: { "content-type": "text/html" },
        text: "x".repeat(500),
      },
    });
    const result = await safeFetchHtml("https://example.com/", { request, maxBytes: 100 });
    expect(result.truncated).toBe(true);
    expect(result.body).toHaveLength(100);
  });

  it("reports a 404 as not ok but still returns the body", async () => {
    const { request } = scriptedRequest({
      "https://example.com/": { status: 404, text: "<html>gone</html>" },
    });
    const result = await safeFetchHtml("https://example.com/", { request });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.body).toContain("gone");
  });
});

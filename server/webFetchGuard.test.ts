import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: any[]) => lookupMock(...args) }));

import { checkPublicUrl, isBlockedAddress, BlockedUrlError } from "./webFetchGuard";

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
    ["64:ff9b::1", "NAT64"],
  ])("blocks %s (%s)", ip => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows a public v6 address", () => {
    expect(isBlockedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTotalDriveImportFailure,
  totalDriveImportFailureMessage,
} from "../googleDriveSyncService";
import { isConfidentialFolderName } from "./googleDrive";

describe("isConfidentialFolderName", () => {
  it("skips folders whose name starts with an underscore", () => {
    expect(isConfidentialFolderName("_secret")).toBe(true);
    expect(isConfidentialFolderName("_")).toBe(true);
    expect(isConfidentialFolderName("  _leading space")).toBe(true);
  });

  it('skips folders named "private" or "confidential" regardless of case', () => {
    expect(isConfidentialFolderName("private")).toBe(true);
    expect(isConfidentialFolderName("Private")).toBe(true);
    expect(isConfidentialFolderName("CONFIDENTIAL")).toBe(true);
    expect(isConfidentialFolderName("  Confidential  ")).toBe(true);
  });

  it("does not skip ordinary folder names", () => {
    expect(isConfidentialFolderName("2. Financial")).toBe(false);
    expect(isConfidentialFolderName("Confidential Docs")).toBe(false); // not an exact match
    expect(isConfidentialFolderName("Marketing")).toBe(false);
    expect(isConfidentialFolderName("")).toBe(false);
  });
});

describe("isTotalDriveImportFailure", () => {
  it("is true when Drive returned files but every import failed", () => {
    expect(
      isTotalDriveImportFailure({
        filesFound: 3,
        filesCreated: 0,
        filesUpdated: 0,
        filesFailed: 3,
      }),
    ).toBe(true);
  });

  it("is false when at least one file was created or updated", () => {
    expect(
      isTotalDriveImportFailure({
        filesFound: 3,
        filesCreated: 1,
        filesUpdated: 0,
        filesFailed: 2,
      }),
    ).toBe(false);
    expect(
      isTotalDriveImportFailure({
        filesFound: 2,
        filesCreated: 0,
        filesUpdated: 1,
        filesFailed: 1,
      }),
    ).toBe(false);
  });

  it("is false for an empty Drive folder", () => {
    expect(
      isTotalDriveImportFailure({
        filesFound: 0,
        filesCreated: 0,
        filesUpdated: 0,
        filesFailed: 0,
      }),
    ).toBe(false);
  });

  it("builds a user-facing message including the first error", () => {
    const msg = totalDriveImportFailureMessage({
      filesFound: 2,
      errors: ['File "deck.pdf": a field exceeded the maximum length'],
    });
    expect(msg).toContain("Found 2 file(s)");
    expect(msg).toContain("a field exceeded the maximum length");
  });
});

describe("driveFetch service-account fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./googleServiceAccount");
  });

  it("retries with the service account on 404 when configured", async () => {
    vi.doMock("./googleServiceAccount", () => ({
      isServiceAccountConfigured: () => true,
      getServiceAccountAccessToken: async () => "sa-token",
      getServiceAccountEmail: () => "sa@example.com",
    }));
    vi.resetModules();
    const { driveFetch } = await import("./googleDrive");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "not found for user",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "ok",
      });
    vi.stubGlobal("fetch", fetchMock);

    const res = await driveFetch("https://www.googleapis.com/drive/v3/files/abc", "user-token");
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as { headers: { Authorization: string } }).headers.Authorization).toBe(
      "Bearer sa-token",
    );
  });
});

describe("syncDriveFolder incompleteSearch + token getter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./googleServiceAccount");
  });

  it("marks the tree partial when Drive returns incompleteSearch", async () => {
    vi.doMock("./googleServiceAccount", () => ({
      isServiceAccountConfigured: () => false,
      getServiceAccountAccessToken: async () => null,
      getServiceAccountEmail: () => null,
    }));
    vi.resetModules();
    const { syncDriveFolder } = await import("./googleDrive");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        incompleteSearch: true,
        files: [
          {
            id: "f1",
            name: "deck.pdf",
            mimeType: "application/pdf",
            parents: ["root"],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncDriveFolder("token", "root", 1);
    expect(result.success).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.files).toHaveLength(1);
  });

  it("accepts a token getter and calls it for each listing", async () => {
    vi.doMock("./googleServiceAccount", () => ({
      isServiceAccountConfigured: () => false,
      getServiceAccountAccessToken: async () => null,
      getServiceAccountEmail: () => null,
    }));
    vi.resetModules();
    const { syncDriveFolder } = await import("./googleDrive");

    const getter = vi.fn(async () => "fresh-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncDriveFolder(getter, "root", 1);
    expect(result.success).toBe(true);
    expect(getter).toHaveBeenCalled();
    expect((fetchMock.mock.calls[0][1] as { headers: { Authorization: string } }).headers.Authorization).toBe(
      "Bearer fresh-token",
    );
  });
});

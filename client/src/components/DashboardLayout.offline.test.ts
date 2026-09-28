import { describe, it, expect, afterEach, vi } from "vitest";
import { TRPCClientError } from "@trpc/client";
import { isOfflineAuthError } from "./DashboardLayout";

describe("isOfflineAuthError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats a transport failure (TRPCClientError without server data) as offline", () => {
    const err = new TRPCClientError("Failed to fetch", { cause: new TypeError("Failed to fetch") });
    expect(err.data).toBeUndefined();
    expect(isOfflineAuthError(err)).toBe(true);
  });

  it("does not treat a real server response (UNAUTHORIZED) as offline", () => {
    const err = new TRPCClientError("UNAUTHORIZED", {
      result: {
        error: { message: "UNAUTHORIZED", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } },
      } as any,
    });
    expect(err.data?.code).toBe("UNAUTHORIZED");
    expect(isOfflineAuthError(err)).toBe(false);
  });

  it("treats null error as not offline when the browser is online", () => {
    expect(isOfflineAuthError(null)).toBe(false);
  });

  it("treats any error as offline when navigator.onLine is false", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(isOfflineAuthError(new Error("whatever"))).toBe(true);
  });
});

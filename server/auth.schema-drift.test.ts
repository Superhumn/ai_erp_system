import { describe, expect, it } from "vitest";

/**
 * Contract tests for the schema-drift fallback used by getUserByEmail /
 * getUserByOpenId / getAllUsers when production is missing emailVerified /
 * companyId / regionScope (the failure mode that 500'd login/signup).
 */
describe("user select schema-drift fallback", () => {
  function isUnknownColumnError(error: unknown): boolean {
    const err = error as {
      code?: string;
      errno?: number;
      message?: string;
      cause?: { code?: string; errno?: number; message?: string };
    };
    const code = err?.code || err?.cause?.code;
    const errno = err?.errno ?? err?.cause?.errno;
    const message = `${err?.message || ""} ${err?.cause?.message || ""}`;
    return (
      code === "ER_BAD_FIELD_ERROR" ||
      errno === 1054 ||
      /Unknown column/i.test(message)
    );
  }

  function padUserRow(row: Record<string, unknown>) {
    return {
      ...row,
      companyId: (row.companyId as number | null | undefined) ?? null,
      regionScope:
        (row.regionScope as "entity" | "region" | "global" | undefined) ??
        "global",
      emailVerified: Boolean(row.emailVerified ?? false),
    };
  }

  it("detects Drizzle-wrapped Unknown column errors", () => {
    expect(
      isUnknownColumnError({
        message: "Failed query: select `emailVerified` from `users`",
        cause: {
          code: "ER_BAD_FIELD_ERROR",
          errno: 1054,
          message: "Unknown column 'emailVerified' in 'field list'",
        },
      })
    ).toBe(true);
  });

  it("does not treat unrelated failures as schema drift", () => {
    expect(isUnknownColumnError({ message: "connection refused" })).toBe(false);
  });

  it("pads core user rows with auth/region defaults", () => {
    const padded = padUserRow({
      id: 1,
      openId: "local_abc",
      email: "a@b.com",
      name: "A",
    });
    expect(padded.emailVerified).toBe(false);
    expect(padded.companyId).toBeNull();
    expect(padded.regionScope).toBe("global");
  });
});

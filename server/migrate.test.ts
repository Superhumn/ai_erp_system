import { describe, expect, it } from "vitest";
import { isDiskFullMigrationError } from "./migrate";

describe("isDiskFullMigrationError", () => {
  it("returns true for mysql disk full code on cause", () => {
    expect(
      isDiskFullMigrationError({
        cause: { code: "ER_DISK_FULL_NOWAIT" },
      }),
    ).toBe(true);
  });

  it("returns true for disk full message", () => {
    expect(
      isDiskFullMigrationError({
        cause: { sqlMessage: "Create table/tablespace 'regions' failed, as disk is full" },
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(
      isDiskFullMigrationError({
        message: "Syntax error in SQL statement",
      }),
    ).toBe(false);
  });
});

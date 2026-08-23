import { describe, expect, it } from "vitest";
import {
  HASH_ITERATIONS,
  HASH_ITERATIONS_LEGACY,
  generateSalt,
  hashPassword,
  hashPasswordWithIterations,
  verifyPassword,
} from "./_core/passwordHash";

describe("passwordHash", () => {
  it("hashes and verifies with the current iteration count", async () => {
    const salt = generateSalt();
    const hash = await hashPassword("correct-horse-battery", salt);

    const ok = await verifyPassword("correct-horse-battery", salt, hash);
    expect(ok).toEqual({ valid: true, needsUpgrade: false });

    const bad = await verifyPassword("wrong-password", salt, hash);
    expect(bad).toEqual({ valid: false, needsUpgrade: false });
  });

  it("accepts legacy 100k hashes and flags needsUpgrade", async () => {
    const salt = generateSalt();
    const legacyHash = await hashPasswordWithIterations(
      "legacy-password",
      salt,
      HASH_ITERATIONS_LEGACY
    );

    const result = await verifyPassword("legacy-password", salt, legacyHash);
    expect(result).toEqual({ valid: true, needsUpgrade: true });
  });

  it("rejects malformed stored hashes without throwing", async () => {
    const salt = generateSalt();
    const result = await verifyPassword("anything", salt, "not-hex!!");
    expect(result.valid).toBe(false);
  });

  it("uses distinct salts", () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });

  it("documents the current vs legacy iteration counts", () => {
    expect(HASH_ITERATIONS).toBe(600000);
    expect(HASH_ITERATIONS_LEGACY).toBe(100000);
  });
});

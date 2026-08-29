import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * Regression guard: signup SELECTs every `users` column and then inserts into
 * `authTokens`. Commit 011b1970 / eb251bbd added those schema objects without
 * a migration, which made production signup return 500. This test keeps the
 * repair migration honest.
 */
describe("signup schema migration 0056", () => {
  const drizzleDir = path.resolve(import.meta.dirname, "../drizzle");
  const migrationPath = path.join(
    drizzleDir,
    "0056_auth_tokens_email_verified_user_region.sql"
  );
  const journalPath = path.join(drizzleDir, "meta/_journal.json");

  it("ships an idempotent migration for authTokens + users.emailVerified + region columns", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE `authTokens`/);
    expect(sql).toMatch(/email_verification/);
    expect(sql).toMatch(/password_reset/);
    expect(sql).toMatch(/ADD COLUMN `emailVerified`/);
    expect(sql).toMatch(/ADD COLUMN `companyId`/);
    expect(sql).toMatch(/ADD COLUMN `regionScope`/);
    expect(sql).toMatch(/CREATE TABLE `regions`/);
    expect(sql).toMatch(/INFORMATION_SCHEMA/);
    // Auth-critical work must run before regions (disk-full on regions
    // previously aborted the procedure before users columns were added).
    const emailVerifiedAt = sql.indexOf("ADD COLUMN `emailVerified`");
    const regionsAt = sql.indexOf("CREATE TABLE `regions`");
    expect(emailVerifiedAt).toBeGreaterThan(-1);
    expect(regionsAt).toBeGreaterThan(emailVerifiedAt);
    expect(sql).toMatch(/CONTINUE HANDLER FOR SQLEXCEPTION/);
  });

  it("is recorded in the drizzle journal", () => {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string; idx: number }>;
    };
    const entry = journal.entries.find(
      (e) => e.tag === "0056_auth_tokens_email_verified_user_region"
    );
    expect(entry).toBeDefined();
    expect(entry?.idx).toBe(56);
  });
});

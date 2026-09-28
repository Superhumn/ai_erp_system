import { describe, expect, it, vi, beforeEach } from "vitest";

// Regression: transactionalEmail.messages.list accepts toEmail / fromDate / toDate /
// limit / offset, but db.getEmailMessages used to ignore all five. This drives the
// helper against a recording query builder (no live MySQL) and checks that every
// filter reaches the query.

type Call = { method: string; args: unknown[] };
const calls: Call[] = [];

function makeBuilder(): any {
  const builder: any = {};
  for (const method of ["select", "from", "where", "orderBy", "limit", "offset"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return builder;
}

vi.mock("mysql2", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => makeBuilder()) }));

process.env.DATABASE_URL = "mysql://test";

import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { getEmailMessages } from "./db";

const argsOf = (method: string) => calls.filter(c => c.method === method).map(c => c.args);

describe("getEmailMessages filters", () => {
  beforeEach(() => { calls.length = 0; });

  it("applies default limit/offset when no filters are given", async () => {
    await getEmailMessages();
    expect(argsOf("where")).toHaveLength(0);
    expect(argsOf("limit")).toEqual([[100]]);
    expect(argsOf("offset")).toEqual([[0]]);
  });

  it("filters on toEmail, fromDate and toDate, and honours limit/offset", async () => {
    const fromDate = new Date("2026-01-01T00:00:00Z");
    const toDate = new Date("2026-02-01T00:00:00Z");
    await getEmailMessages({ toEmail: "a@example.com", fromDate, toDate, limit: 25, offset: 50 });

    const where = argsOf("where");
    expect(where).toHaveLength(1);
    // Render the and(...) chunk through the MySQL dialect so each filter's
    // column and bound value are visible.
    const { sql: text, params } = new MySqlDialect().sqlToQuery(where[0][0] as SQL);
    expect(text).toContain("`toEmail` = ?");
    expect(text).toContain("`createdAt` >= ?");
    expect(text).toContain("`createdAt` <= ?");
    expect(params).toEqual(["a@example.com", "2026-01-01 00:00:00.000", "2026-02-01 00:00:00.000"]);
    expect(argsOf("limit")).toEqual([[25]]);
    expect(argsOf("offset")).toEqual([[50]]);
  });
});

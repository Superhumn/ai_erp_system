import { describe, expect, it, vi, beforeEach } from "vitest";

// Drives the DOCUMENT IMPORT HELPERS in db.ts against a recording query builder
// (no live MySQL):
//  - getVendorByName: exact match wins over prefix/contains, optional companyId
//    scope, blank names never match.
//  - createDocumentImportLog / getDocumentImportLogs: the writer's JSON is what
//    the reader (and the Import History tab) reads back.

type Call = { method: string; args: unknown[] };
const calls: Call[] = [];
/** Rows each `.limit()` resolves to, in call order (empty when exhausted). */
const selectResults: unknown[][] = [];
/** Rows captured from `.values()` so a test can feed them back to a select. */
const inserted: Record<string, unknown>[] = [];

function makeBuilder(): any {
  const builder: any = {};
  for (const method of ["select", "from", "where", "orderBy", "insert"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(selectResults.shift() ?? []);
  };
  builder.values = (...args: unknown[]) => {
    calls.push({ method: "values", args });
    inserted.push(args[0] as Record<string, unknown>);
    return Promise.resolve([{ insertId: inserted.length }]);
  };
  return builder;
}

vi.mock("mysql2", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => makeBuilder()) }));

process.env.DATABASE_URL = "mysql://test";

import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { getVendorByName, createDocumentImportLog, getDocumentImportLogs } from "./db";

const argsOf = (method: string) => calls.filter(c => c.method === method).map(c => c.args);
const render = (chunk: unknown) => new MySqlDialect().sqlToQuery(chunk as SQL);

beforeEach(() => {
  calls.length = 0;
  selectResults.length = 0;
  inserted.length = 0;
});

describe("getVendorByName", () => {
  it("returns the exact (case-insensitive) match first without trying the LIKE patterns", async () => {
    selectResults.push([{ id: 1, name: "ABC" }]);
    const vendor = await getVendorByName("abc");
    expect(vendor).toEqual({ id: 1, name: "ABC" });

    const where = argsOf("where");
    expect(where).toHaveLength(1);
    const { sql: text, params } = render(where[0][0]);
    expect(text.toLowerCase()).toContain("lower(`vendors`.`name`) = lower(?)");
    expect(text.toLowerCase()).not.toContain("like");
    expect(params).toEqual(["abc"]);
  });

  it("falls back to a prefix match, then a contains match, and escapes LIKE wildcards", async () => {
    selectResults.push([], [], [{ id: 2, name: "The 100% Juice Co" }]);
    const vendor = await getVendorByName("100% Juice");
    expect(vendor).toEqual({ id: 2, name: "The 100% Juice Co" });

    const rendered = argsOf("where").map(([chunk]) => render(chunk));
    expect(rendered).toHaveLength(3);
    expect(rendered[0].params).toEqual(["100% Juice"]);
    expect(rendered[1].sql.toLowerCase()).toContain("like lower(?)");
    expect(rendered[1].params).toEqual(["100\\% Juice%"]);
    expect(rendered[2].params).toEqual(["%100\\% Juice%"]);
    expect(argsOf("limit")).toEqual([[1], [1], [1]]);
  });

  it("returns null when nothing matches at any level", async () => {
    expect(await getVendorByName("Nobody")).toBeNull();
    expect(argsOf("where")).toHaveLength(3);
  });

  it("adds a companyId condition to every lookup when one is given", async () => {
    selectResults.push([], [{ id: 3, name: "ABC Logistics", companyId: 5 }]);
    const vendor = await getVendorByName("ABC", 5);
    expect(vendor).toMatchObject({ id: 3, companyId: 5 });

    const rendered = argsOf("where").map(([chunk]) => render(chunk));
    expect(rendered).toHaveLength(2);
    for (const r of rendered) {
      expect(r.sql).toContain("`companyId` = ?");
      expect(r.params[r.params.length - 1]).toBe(5);
    }
    expect(rendered[0].params).toEqual(["ABC", 5]);
    expect(rendered[1].params).toEqual(["ABC%", 5]);
  });

  it("does not scope when companyId is omitted (today's behaviour)", async () => {
    await getVendorByName("ABC");
    for (const [chunk] of argsOf("where")) {
      expect(render(chunk).sql).not.toContain("companyId");
    }
  });

  it("never queries for a blank name (the contains pattern would be %%)", async () => {
    expect(await getVendorByName("   ")).toBeNull();
    expect(await getVendorByName("")).toBeNull();
    expect(argsOf("select")).toHaveLength(0);
  });
});

describe("document import log round trip", () => {
  const createdRecords = [
    { type: "vendor", id: 4, name: "Acme" },
    { type: "purchase_order", id: 88, name: "PO-1" },
  ];
  const updatedRecords = [{ type: "raw_material", id: 55, name: "Coconut Oil", changes: "Received: +4" }];

  it("writes the filename, record arrays and status the reader expects", async () => {
    await createDocumentImportLog({
      filename: "po-1.pdf",
      documentType: "purchase_order",
      status: "partial",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: JSON.stringify(["Related PO not found"]),
      error: undefined,
      importedBy: 2,
      importedAt: 1_700_000_000_000,
      companyId: 7,
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      companyId: 7,
      userId: 2,
      action: "create",
      entityType: "document_import_purchase_order",
      entityName: "po-1.pdf",
      newValues: {
        filename: "po-1.pdf",
        status: "partial",
        createdRecords,
        updatedRecords,
        warnings: ["Related PO not found"],
        importedAt: 1_700_000_000_000,
      },
    });
  });

  it("reads back what it wrote: fileName, counts derived from the arrays, and importData for the page", async () => {
    await createDocumentImportLog({
      filename: "inv-9.pdf",
      documentType: "vendor_invoice",
      status: "success",
      createdRecords: JSON.stringify(createdRecords),
      updatedRecords: JSON.stringify(updatedRecords),
      warnings: "[]",
      importedBy: 2,
      importedAt: 1_700_000_000_000,
    });
    const createdAt = new Date("2026-09-28T10:00:00Z");
    selectResults.push([{ id: 31, ...inserted[0], createdAt }]);

    const logs = await getDocumentImportLogs(10);
    expect(argsOf("limit")).toEqual([[10]]);
    expect(logs).toHaveLength(1);
    const [log] = logs;
    expect(log).toMatchObject({
      id: 31,
      fileName: "inv-9.pdf",
      documentType: "vendor_invoice",
      status: "success",
      recordsCreated: 2,
      recordsUpdated: 1,
      warnings: [],
      createdAt,
    });
    // DocumentImport.tsx derives its counts from importData.createdRecords.length
    // and maps status success -> completed, so these must survive the round trip.
    expect(log.importData.createdRecords).toEqual(createdRecords);
    expect(log.importData.updatedRecords).toEqual(updatedRecords);
    expect(log.importData.status).toBe("success");
    expect(log.importData.filename).toBe("inv-9.pdf");
  });

  it("tolerates rows written by the old reader vocabulary or with missing JSON", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    selectResults.push([
      { id: 1, action: "create", entityType: "document_import_freight_invoice", entityName: "old.pdf", newValues: { fileName: "old.pdf", createdRecords: "[{\"type\":\"vendor\",\"id\":1,\"name\":\"X\"}]" }, createdAt },
      { id: 2, action: "create", entityType: "document_import_purchase_order", entityName: "empty.pdf", newValues: null, createdAt },
    ]);
    const [oldRow, emptyRow] = await getDocumentImportLogs();
    expect(oldRow).toMatchObject({ fileName: "old.pdf", documentType: "freight_invoice", recordsCreated: 1, recordsUpdated: 0, status: "success" });
    expect(oldRow.importData.importedAt).toBe(createdAt.getTime());
    expect(emptyRow).toMatchObject({ fileName: "empty.pdf", recordsCreated: 0, recordsUpdated: 0, warnings: [] });
    expect(emptyRow.importData.createdRecords).toEqual([]);
  });
});

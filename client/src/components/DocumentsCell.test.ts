import { describe, it, expect } from "vitest";
import { DOC_TYPES, HR_DOC_TYPES } from "./DocumentsCell";

// Mirror of the `type` zod enum in server/routers/documents.ts (`upload`).
const SERVER_DOC_TYPES = [
  "contract", "invoice", "receipt", "report", "legal", "hr", "freight",
  "customs", "bol", "packing_list", "certificate", "po", "other",
];

describe("DocumentsCell document types", () => {
  it("default option values are all accepted by documents.upload", () => {
    for (const t of DOC_TYPES) expect(SERVER_DOC_TYPES).toContain(t);
  });

  it("HR sub-types are NOT server types, so the cell must map them to type 'hr'", () => {
    // Guards the mapping in handleFileSelect: if this ever starts passing for
    // every HR type, the server enum grew and the mapping can be simplified.
    const unsupported = HR_DOC_TYPES.filter((t) => !SERVER_DOC_TYPES.includes(t));
    expect(unsupported.length).toBeGreaterThan(0);
    expect(SERVER_DOC_TYPES).toContain("hr");
  });
});

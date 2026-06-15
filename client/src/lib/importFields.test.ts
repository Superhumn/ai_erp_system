import { describe, it, expect } from "vitest";
import {
  suggestFieldForHeader,
  buildDefaultMapping,
  missingRequiredFields,
  coerceImportValue,
  buildImportRecord,
  IMPORT_SKIP,
} from "@shared/importFields";

describe("suggestFieldForHeader", () => {
  it("maps common header variants to the canonical field", () => {
    expect(suggestFieldForHeader("Customer Name", "customers")).toBe("name");
    expect(suggestFieldForHeader("name", "customers")).toBe("name");
    expect(suggestFieldForHeader("Email Address", "customers")).toBe("email");
    expect(suggestFieldForHeader("Zip Code", "customers")).toBe("postalCode");
    expect(suggestFieldForHeader("Surname", "employees")).toBe("lastName");
    expect(suggestFieldForHeader("First Name", "employees")).toBe("firstName");
    expect(suggestFieldForHeader("Sell Price", "products")).toBe("unitPrice");
  });

  it("returns the skip sentinel when nothing matches", () => {
    expect(suggestFieldForHeader("Random Column 42", "customers")).toBe(IMPORT_SKIP);
    expect(suggestFieldForHeader("", "customers")).toBe(IMPORT_SKIP);
  });
});

describe("buildDefaultMapping", () => {
  it("auto-maps a realistic header set without reusing a field", () => {
    const mapping = buildDefaultMapping(
      ["Customer Name", "E-mail", "Phone Number", "Mystery"],
      "customers",
    );
    expect(mapping).toEqual({
      "Customer Name": "name",
      "E-mail": "email",
      "Phone Number": "phone",
      Mystery: IMPORT_SKIP,
    });
  });

  it("does not assign the same field to two headers", () => {
    const mapping = buildDefaultMapping(["Name", "Company"], "customers");
    const assigned = Object.values(mapping).filter((v) => v !== IMPORT_SKIP);
    expect(new Set(assigned).size).toBe(assigned.length);
  });
});

describe("missingRequiredFields", () => {
  it("flags required fields that are not mapped", () => {
    const missing = missingRequiredFields("employees", { "First Name": "firstName" });
    expect(missing.map((f) => f.key)).toEqual(["lastName"]);
  });

  it("returns nothing once all required fields are mapped", () => {
    const mapping = { A: "firstName", B: "lastName" };
    expect(missingRequiredFields("employees", mapping)).toHaveLength(0);
  });
});


describe("coerceImportValue", () => {
  const def = (type: any, enumValues?: string[]) => ({ key: "f", label: "F", type, enumValues });

  it("parses decimals, stripping currency/commas", () => {
    expect(coerceImportValue("$1,200.50", def("decimal"))).toEqual({ value: "1200.50" });
    expect(coerceImportValue("not money", def("decimal")).error).toBeTruthy();
  });

  it("parses ints and dates", () => {
    expect(coerceImportValue("45", def("int"))).toEqual({ value: 45 });
    expect(coerceImportValue("abc", def("int")).error).toBeTruthy();
    const d = coerceImportValue("2025-01-15", def("date")).value as Date;
    expect(d instanceof Date && d.getUTCFullYear()).toBe(2025);
    expect(coerceImportValue("nope", def("date")).error).toBeTruthy();
  });

  it("matches enums case-insensitively and rejects unknowns", () => {
    expect(coerceImportValue("Business", def("enum", ["individual", "business"]))).toEqual({ value: "business" });
    expect(coerceImportValue("vip", def("enum", ["individual", "business"])).error).toBeTruthy();
  });

  it("treats blank as undefined (not an error)", () => {
    expect(coerceImportValue("  ", def("string"))).toEqual({ value: undefined });
  });
});

describe("buildImportRecord", () => {
  it("coerces mapped columns into a typed record", () => {
    const { record, errors } = buildImportRecord(
      { Name: "Acme", Kind: "Business", Credit: "$50,000", Terms: "45" },
      { Name: "name", Kind: "type", Credit: "creditLimit", Terms: "paymentTerms" },
      "customers",
    );
    expect(errors).toHaveLength(0);
    expect(record).toEqual({ name: "Acme", type: "business", creditLimit: "50000", paymentTerms: 45 });
  });

  it("reports an error for an invalid enum value", () => {
    const { errors } = buildImportRecord({ Name: "Acme", Kind: "vip" }, { Name: "name", Kind: "type" }, "customers");
    expect(errors.some((e) => /Type/.test(e))).toBe(true);
  });

  it("flags a missing required field", () => {
    const { errors } = buildImportRecord({ Email: "a@b.com" }, { Email: "email" }, "customers");
    expect(errors.some((e) => /Name/.test(e))).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  suggestFieldForHeader,
  buildDefaultMapping,
  missingRequiredFields,
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

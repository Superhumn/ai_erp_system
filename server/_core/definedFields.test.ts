import { describe, expect, it } from "vitest";
import { definedFields } from "./definedFields";

describe("definedFields", () => {
  it("returns null when every field is undefined", () => {
    expect(definedFields({ a: undefined, b: undefined })).toBeNull();
    expect(definedFields({})).toBeNull();
  });

  it("keeps defined values, including falsy ones", () => {
    expect(definedFields({ a: 0, b: "", c: false, d: null, e: undefined })).toEqual({
      a: 0,
      b: "",
      c: false,
      d: null,
    });
  });
});

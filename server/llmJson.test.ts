import { describe, it, expect } from "vitest";
import { parseLlmJson } from "./llmJson";

describe("parseLlmJson", () => {
  it("parses clean JSON", () => {
    expect(parseLlmJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses a fenced block", () => {
    expect(parseLlmJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses an unlabelled fenced block", () => {
    expect(parseLlmJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses a fenced block behind a sentence — the case that broke the mutation", () => {
    expect(parseLlmJson('Here is the JSON:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses a fenced block with a trailing sentence", () => {
    expect(parseLlmJson('```json\n{"a":1}\n```\nLet me know if you need more.')).toEqual({ a: 1 });
  });

  it("recovers a bare object embedded in prose", () => {
    expect(parseLlmJson('Sure thing. {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });

  it("recovers a top-level array", () => {
    expect(parseLlmJson('Result:\n[1,2,3]')).toEqual([1, 2, 3]);
  });

  it("prefers an object over an array when both appear", () => {
    expect(parseLlmJson('{"items":[1,2]}')).toEqual({ items: [1, 2] });
  });

  it("handles nested braces and strings containing braces", () => {
    const value = { outer: { inner: "a } b" }, n: 2 };
    expect(parseLlmJson("noise " + JSON.stringify(value) + " tail")).toEqual(value);
  });

  it("passes through an already-structured value", () => {
    const obj = { a: 1 };
    expect(parseLlmJson(obj)).toBe(obj);
  });

  it("returns null for unparseable text rather than throwing", () => {
    expect(parseLlmJson("the carrier did not attach rates")).toBeNull();
  });

  it("returns null for empty and nullish input", () => {
    expect(parseLlmJson("")).toBeNull();
    expect(parseLlmJson("   ")).toBeNull();
    expect(parseLlmJson(null)).toBeNull();
    expect(parseLlmJson(undefined)).toBeNull();
  });

  it("returns null when a fence contains invalid JSON", () => {
    expect(parseLlmJson("```json\nnot json at all\n```")).toBeNull();
  });
});

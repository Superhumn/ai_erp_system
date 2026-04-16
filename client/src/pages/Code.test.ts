/**
 * Tests for Code page utility functions.
 * Functions tested: LANGUAGES, AI_ACTIONS, snippet filtering logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from Code.tsx ──

const LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "swift", label: "Swift" },
];

const AI_ACTIONS = [
  { value: "generate", label: "Generate Code", description: "Generate code from a description" },
  { value: "explain", label: "Explain Code", description: "Get a detailed explanation" },
  { value: "debug", label: "Debug Code", description: "Find and fix bugs" },
  { value: "refactor", label: "Refactor Code", description: "Improve code quality" },
  { value: "review", label: "Code Review", description: "Get a code review" },
  { value: "test", label: "Generate Tests", description: "Create unit tests" },
  { value: "document", label: "Add Docs", description: "Generate documentation" },
  { value: "optimize", label: "Optimize", description: "Optimize performance" },
] as const;

function filterSnippets(
  snippets: Array<{ title: string; description?: string | null; language: string; code: string }>,
  searchQuery: string,
): typeof snippets {
  if (!searchQuery) return snippets;
  const q = searchQuery.toLowerCase();
  return snippets.filter(s =>
    s.title.toLowerCase().includes(q) ||
    (s.description && s.description.toLowerCase().includes(q)) ||
    s.language.toLowerCase().includes(q) ||
    s.code.toLowerCase().includes(q)
  );
}

// ── Tests ──

describe("Code page — LANGUAGES", () => {
  it("has 18 languages", () => {
    expect(LANGUAGES).toHaveLength(18);
  });

  it("includes TypeScript", () => {
    expect(LANGUAGES.find(l => l.value === "typescript")).toBeTruthy();
  });

  it("includes Python", () => {
    expect(LANGUAGES.find(l => l.value === "python")).toBeTruthy();
  });

  it("includes SQL", () => {
    expect(LANGUAGES.find(l => l.value === "sql")).toBeTruthy();
  });

  it("all have unique values", () => {
    const values = LANGUAGES.map(l => l.value);
    expect(new Set(values).size).toBe(18);
  });

  it("all have non-empty labels", () => {
    for (const lang of LANGUAGES) {
      expect(lang.label.length).toBeGreaterThan(0);
    }
  });
});

describe("Code page — AI_ACTIONS", () => {
  it("has 8 actions", () => {
    expect(AI_ACTIONS).toHaveLength(8);
  });

  it("includes generate, explain, debug, refactor, review, test, document, optimize", () => {
    const values = AI_ACTIONS.map(a => a.value);
    expect(values).toEqual([
      "generate", "explain", "debug", "refactor",
      "review", "test", "document", "optimize",
    ]);
  });

  it("all actions have descriptions", () => {
    for (const action of AI_ACTIONS) {
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  it("all actions have labels", () => {
    for (const action of AI_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
    }
  });
});

describe("Code page — filterSnippets", () => {
  const snippets = [
    { title: "Hello World", description: "Basic example", language: "typescript", code: "console.log('hello')" },
    { title: "API Endpoint", description: "REST handler", language: "python", code: "def handler(req):" },
    { title: "SQL Query", description: null, language: "sql", code: "SELECT * FROM users" },
  ];

  it("returns all snippets for empty query", () => {
    expect(filterSnippets(snippets, "")).toEqual(snippets);
  });

  it("filters by title", () => {
    const result = filterSnippets(snippets, "hello");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Hello World");
  });

  it("filters by description", () => {
    const result = filterSnippets(snippets, "REST");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("API Endpoint");
  });

  it("filters by language", () => {
    const result = filterSnippets(snippets, "python");
    expect(result).toHaveLength(1);
  });

  it("filters by code content", () => {
    const result = filterSnippets(snippets, "SELECT");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("SQL Query");
  });

  it("handles null description", () => {
    const result = filterSnippets(snippets, "sql");
    expect(result).toHaveLength(1);
  });

  it("is case insensitive", () => {
    expect(filterSnippets(snippets, "HELLO")).toHaveLength(1);
    expect(filterSnippets(snippets, "hello")).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    expect(filterSnippets(snippets, "xyz")).toHaveLength(0);
  });
});
